#!/usr/bin/env node

/**
 * control-file-organizer — drive the real File Organizer MCP server the way a
 * client does, and prove what it did.
 *
 * Every subcommand is hermetic: it spawns the server with HOME (or APPDATA on
 * Windows) pointed at a throwaway root, so config.json, history.jsonl,
 * rollbacks and backups never touch the developer's real config dir. Only the
 * sandbox you name is allowed to be read or written.
 *
 * stdout is machine readable. Diagnostics go to stderr and are silent unless
 * --verbose. Exit code is 0 when the tool call succeeded, 1 when it failed,
 * 2 when the harness itself could not run.
 */

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..", "..", "..");
const SERVER_ENTRY = path.join(REPO, "dist", "src", "index.js");
const SANDBOX_ROOT = path.join(os.tmpdir(), "file-organizer-verify");
const MARKER = ".file-organizer-verify-sandbox";

const argv = process.argv.slice(2);
const flags = new Map();
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const token = argv[i];
  if (token.startsWith("--")) {
    const eq = token.indexOf("=");
    if (eq !== -1) {
      flags.set(token.slice(2, eq), token.slice(eq + 1));
    } else if (argv[i + 1] && !argv[i + 1].startsWith("--")) {
      flags.set(token.slice(2), argv[++i]);
    } else {
      flags.set(token.slice(2), "true");
    }
  } else {
    positional.push(token);
  }
}

const verbose = flags.get("verbose") === "true";

function log(...parts) {
  if (verbose) process.stderr.write(parts.join(" ") + "\n");
}

function fail(message, code = 2) {
  process.stderr.write(message + "\n");
  process.exit(code);
}

function ok(payload) {
  process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
}

/** fs.access resolves with undefined, so existence must be read from the rejection. */
async function exists(target) {
  return fs.access(target).then(
    () => true,
    () => false
  );
}

// ── sandbox ────────────────────────────────────────────────────────────────

/** Where this platform reads config.json from. Mirrors src/core/config/paths.ts. */
/**
 * The config directory, mirroring getConfigDirectory() in src/core/config/paths.ts.
 * macOS keeps its own convention rather than honoring XDG_CONFIG_HOME, matching
 * the server.
 */
function configRootFor(home) {
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), "file-organizer-mcp");
  }
  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", "file-organizer-mcp");
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(home, ".config"), "file-organizer-mcp");
}

/**
 * HOME moves every state location. APPDATA or XDG_CONFIG_HOME alone would move
 * the history, rollback and backup dirs but leave config.json in the real home,
 * so the sandbox would still load the developer's allow-list.
 */
function sandboxEnv(root) {
  const env = { ...process.env, LOG_LEVEL: flags.get("log-level") || "error" };
  if (process.platform === "win32") {
    env.USERPROFILE = root;
    env.APPDATA = path.join(root, "AppData", "Roaming");
  } else {
    env.HOME = root;
    env.XDG_CONFIG_HOME = path.join(root, ".config");
  }
  return env;
}

const PDF_HEADER = Buffer.from([0x25, 0x50, 0x44, 0x46]);
const ZIP_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

/**
 * Fixtures are real shapes, not an empty dir: a nested tree, an exact
 * duplicate pair, a mislabelled file whose magic bytes disagree with its
 * extension, and a pathologically long name.
 */
async function seed(into) {
  const write = async (rel, data) => {
    const full = path.join(into, rel);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data);
    return full;
  };

  await write("notes/todo.md", "# todo\n- verify skill\n");
  await write("notes/report.txt", "quarterly numbers\n");
  // find_duplicate_files has no recursion flag, so a top-level pair is the only
  // shape it can see. The inbox pair proves the nested case is invisible to it.
  await write("dupe-a.txt", "top level identical bytes\n");
  await write("dupe-b.txt", "top level identical bytes\n");
  await write("inbox/dup-a.txt", "identical bytes for the duplicate finder\n");
  await write("inbox/dup-b.txt", "identical bytes for the duplicate finder\n");
  await write("inbox/actually-a-pdf.txt", Buffer.concat([PDF_HEADER, Buffer.from("-1.4 fake pdf body")]));
  await write("inbox/archive.zip", Buffer.concat([ZIP_HEADER, Buffer.from("not a real zip")]));
  await write("photos/IMG_0001.jpg", Buffer.from("fake jpeg payload"));
  await write(`${"deep/".repeat(6)}buried.txt`, "found only by a recursive scan\n");
  await write(`long-name-${"x".repeat(180)}.txt`, "name length guard\n");
}

async function ensureSandbox(name, { fresh = false } = {}) {
  const root = path.resolve(name || path.join(SANDBOX_ROOT, "default"));
  // A caller-supplied root may hold real work, so wiping it needs proof it is ours.
  if (fresh && !(await isOurSandbox(root))) {
    fail(`refusing to --fresh ${root}. It carries no ${MARKER}, so it is not a sandbox this helper created.`);
  }
  if (fresh) await fs.rm(root, { recursive: true, force: true });
  const configDir = configRootFor(root);
  await fs.mkdir(configDir, { recursive: true });
  await fs.mkdir(path.join(root, "data"), { recursive: true });
  await fs.writeFile(path.join(root, MARKER), "created by control-file-organizer\n");

  const existing = await fs.readFile(path.join(configDir, "config.json"), "utf8").catch(() => null);
  const config = existing ? JSON.parse(existing) : {};
  const dataDir = path.join(root, "data");
  config.customAllowedDirectories = Array.from(new Set([...(config.customAllowedDirectories || []), dataDir]));
  config.historyLogging = { ...(config.historyLogging || {}), enabled: true };
  await fs.writeFile(path.join(configDir, "config.json"), JSON.stringify(config, null, 2) + "\n");

  const seeded = path.join(dataDir, ".seeded");
  if (!(await exists(seeded))) {
    await seed(dataDir);
    await fs.writeFile(seeded, "ok\n");
  }
  return { root, dataDir, configDir };
}

// ── json-rpc over stdio ────────────────────────────────────────────────────

function connect(env, onStderr) {
  const proc = spawn(process.execPath, [SERVER_ENTRY], { env, stdio: ["pipe", "pipe", "pipe"] });
  const pending = new Map();
  let buffer = "";
  let stderr = "";

  proc.stdout.setEncoding("utf8");
  proc.stderr.setEncoding("utf8");
  proc.stderr.on("data", (chunk) => {
    stderr += chunk;
    onStderr(chunk);
  });
  proc.stdout.on("data", (chunk) => {
    buffer += chunk;
    let nl;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }
      const waiter = pending.get(message.id);
      if (!waiter) continue;
      pending.delete(message.id);
      message.error ? waiter.reject(new Error(JSON.stringify(message.error))) : waiter.resolve(message.result);
    }
  });

  let seq = 0;
  const request = (method, params) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  // A notification carries no id. Sending one with an id earns -32601.
  const notify = (method, params) =>
    proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");

  const stop = () => {
    if (proc.exitCode === null && proc.signalCode === null) proc.kill("SIGTERM");
  };

  return { request, notify, stop, stderr: () => stderr };
}

async function session(root, run) {
  await fs.access(SERVER_ENTRY).catch(() =>
    fail(`dist/src/index.js is missing. Run \`npm run build\` first.`)
  );
  const client = connect(sandboxEnv(root), (chunk) => log("[server]", chunk.trim()));
  try {
    await client.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "control-file-organizer", version: "1" },
    });
    client.notify("notifications/initialized", {});
    return await run(client);
  } finally {
    client.stop();
  }
}

async function listTools(root) {
  return session(root, (client) => client.request("tools/list", {}));
}

function coerce(raw) {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw === "null") return null;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  if (raw.startsWith("{") || raw.startsWith("[")) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

// ── subcommands ────────────────────────────────────────────────────────────

const USAGE = `control-file-organizer — drive the File Organizer MCP server and prove the result

  doctor                     build, handshake and allowed-directory check
  tools [--filter substr]    list tools with one-line descriptions
  schema <tool>              JSON schema and annotations for one tool
  sandbox [--fresh]          create a hermetic sandbox, print its paths
  call <tool> [--arg k=v]    call one tool against a sandbox
  history                    read operations.jsonl written by the last calls
  cleanup                    remove every sandbox this helper created

Common flags
  --sandbox <path>   reuse a specific sandbox root (default: tmp/file-organizer-verify/default)
  --fresh            recreate the sandbox and its fixtures from scratch
  --out <file>       also write the call result to <file> as proof
  --verbose          echo server stderr
  --json             force response_format=json and pretty-print the parsed body`;

async function cmdDoctor() {
  const checks = [];
  const record = (name, okFlag, detail) => checks.push({ check: name, ok: okFlag, detail });

  // fs.access resolves with undefined, so a missing file is only visible via the rejection.
  const entryExists = await exists(SERVER_ENTRY);
  record("dist/src/index.js present", entryExists, SERVER_ENTRY);
  if (!entryExists) {
    record("build", false, "run `npm run build`");
    ok({ ok: false, checks });
    return 1;
  }

  const pkg = JSON.parse(await fs.readFile(path.join(REPO, "package.json"), "utf8"));
  record("toolchain", true, `node ${process.versions.node}, package ${pkg.version}`);

  const sb = await ensureSandbox(flags.get("sandbox"));
  try {
    const tools = await listTools(sb.root);
    record("initialize handshake", true, `${tools.tools.length} tools advertised`);

    const doctor = await session(sb.root, (client) =>
      client.request("tools/call", {
        name: "file_organizer_doctor",
        arguments: { response_format: "json" },
      })
    );
    const body = parseBody(doctor);
    record("file_organizer_doctor", !doctor.isError, summarize(body));

    const scan = await session(sb.root, (client) =>
      client.request("tools/call", {
        name: "file_organizer_scan_directory",
        arguments: { directory: sb.dataDir, response_format: "json" },
      })
    );
    const scanned = parseBody(scan);
    const count = scanned?.total_count ?? scanned?.totalFiles ?? null;
    record("read-only tool call", !scan.isError, `scan_directory returned ${count ?? "an unparsed"} entries`);

    ok({ ok: checks.every((c) => c.ok), sandbox: sb, checks });
    return checks.every((c) => c.ok) ? 0 : 1;
  } catch (error) {
    record("initialize handshake", false, error.message);
    ok({ ok: false, sandbox: sb, checks });
    return 1;
  }
}

function parseBody(result) {
  const text = result?.content?.[0]?.text;
  if (typeof text !== "string") return result?.structuredContent ?? null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function summarize(body) {
  if (typeof body === "string") return body.split("\n")[0];
  return JSON.stringify(body).slice(0, 200);
}

async function cmdTools() {
  const sb = await ensureSandbox(flags.get("sandbox"));
  const { tools } = await listTools(sb.root);
  const filter = flags.get("filter");
  const matched = filter ? tools.filter((t) => t.name.includes(filter)) : tools;
  ok(matched.map((t) => ({ name: t.name, title: t.title, description: t.description })));
  return 0;
}

async function cmdSchema(name) {
  if (!name) fail("schema needs a tool name");
  const sb = await ensureSandbox(flags.get("sandbox"));
  const { tools } = await listTools(sb.root);
  const tool = tools.find((t) => t.name === name || t.name === `file_organizer_${name}`);
  if (!tool) fail(`no such tool: ${name}`, 1);
  ok(tool);
  return 0;
}

async function cmdSandbox() {
  const sb = await ensureSandbox(flags.get("sandbox"), { fresh: flags.get("fresh") === "true" });
  const tree = await fs
    .readdir(sb.dataDir, { recursive: true, withFileTypes: true })
    .then((entries) => entries.filter((e) => e.isFile()).map((e) => path.relative(sb.dataDir, path.join(e.parentPath ?? e.path, e.name))));
  ok({ root: sb.root, dataDir: sb.dataDir, configFile: path.join(sb.configDir, "config.json"), files: tree.sort() });
  return 0;
}

async function cmdCall(name) {
  if (!name) fail("call needs a tool name");
  const args = {};
  for (const [key, value] of flags) {
    if (["sandbox", "fresh", "out", "verbose", "json", "log-level"].includes(key)) continue;
    args[key] = coerce(value);
  }
  if (flags.get("json") === "true" && !args.response_format) args.response_format = "json";

  const sb = await ensureSandbox(flags.get("sandbox"), { fresh: flags.get("fresh") === "true" });
  const short = name.startsWith("file_organizer_") ? name : `file_organizer_${name}`;

  let result;
  try {
    result = await session(sb.root, (client) =>
      client.request("tools/call", { name: short, arguments: args })
    );
  } catch (error) {
    process.stderr.write(`harness failure calling ${short}: ${error.message}\n`);
    return 2;
  }

  const body = parseBody(result);
  const text = result?.content?.[0]?.text ?? "";
  const failed = result?.isError === true || /^Error\b/.test(text);
  ok({ tool: short, args, isError: Boolean(failed), sandbox: sb, result: body });

  const out = flags.get("out");
  if (out) {
    await fs.mkdir(path.dirname(path.resolve(out)), { recursive: true });
    await fs.writeFile(path.resolve(out), JSON.stringify({ tool: short, args, isError: Boolean(failed), result: body }, null, 2) + "\n");
    log("proof written to", out);
  }
  return failed ? 1 : 0;
}

async function cmdHistory() {
  const root = path.resolve(flags.get("sandbox") || path.join(SANDBOX_ROOT, "default"));
  const configDir = configRootFor(root);
  const file = path.join(configDir, "operations.jsonl");
  const raw = await fs.readFile(file, "utf8").catch(() => null);
  if (raw === null) {
    process.stderr.write(`no operations.jsonl under ${configDir}. Has an organizing tool run yet?\n`);
    return 1;
  }
  ok(raw.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)));
  return 0;
}

/**
 * A directory is ours to delete only if it sits under our own root or carries
 * our marker. "Directly under tmpdir" is not enough: /tmp holds unrelated work.
 */
async function isOurSandbox(target) {
  const root = path.resolve(target);
  if (root === SANDBOX_ROOT || root.startsWith(SANDBOX_ROOT + path.sep)) return true;
  return exists(path.join(root, MARKER));
}

async function cmdCleanup() {
  const target = flags.get("sandbox") ? path.resolve(flags.get("sandbox")) : SANDBOX_ROOT;
  if (!(await isOurSandbox(target))) {
    fail(
      `refusing to remove ${target}. It is neither under ${SANDBOX_ROOT} nor marked with ${MARKER}.\n` +
        `If it really is a throwaway sandbox, delete it yourself.`
    );
  }
  await fs.rm(target, { recursive: true, force: true });
  ok({ removed: target });
  return 0;
}

const [command, ...rest] = positional;
switch (command) {
  case "doctor":
    process.exit(await cmdDoctor());
    break;
  case "tools":
    process.exit(await cmdTools());
    break;
  case "schema":
    process.exit(await cmdSchema(rest[0]));
    break;
  case "sandbox":
    process.exit(await cmdSandbox());
    break;
  case "call":
    process.exit(await cmdCall(rest[0]));
    break;
  case "history":
    process.exit(await cmdHistory());
    break;
  case "cleanup":
    process.exit(await cmdCleanup());
    break;
  default:
    process.stderr.write(USAGE + "\n");
    process.exit(command ? 2 : 0);
}
