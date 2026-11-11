/**
 * verify-harness core: drive the real File Organizer MCP server the way a
 * client does, hermetically.
 *
 * This is the library behind the `verify-file-organizer` skill's CLI
 * (scripts/verify/cli.mjs) and behind the scenario runner
 * (scripts/verify/run-scenarios.mjs). It knows nothing about argv; callers
 * parse their own arguments and call these functions.
 *
 * Every entry point spawns the server with HOME (or APPDATA on Windows)
 * pointed at a throwaway root, so config.json, history.jsonl, rollbacks and
 * backups never touch the developer's real config dir. Only the sandbox you
 * name is allowed to be read or written.
 *
 * Refusals (a sandbox root that is not ours, a config dir that escaped the
 * sandbox) throw SandboxRefusalError. Callers decide how to surface it.
 */

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const SERVER_ENTRY = path.join(REPO, "dist", "src", "index.js");
export const SANDBOX_ROOT = path.join(os.tmpdir(), "file-organizer-verify");
export const MARKER = ".file-organizer-verify-sandbox";

export class SandboxRefusalError extends Error {}

/** fs.access resolves with undefined, so existence must be read from the rejection. */
export async function exists(target) {
  return fs.access(target).then(
    () => true,
    () => false
  );
}

// ── sandbox ────────────────────────────────────────────────────────────────

/**
 * XDG_CONFIG_HOME for a sandbox root. Defined once and shared by
 * configRootFor() and sandboxEnv(): the harness has to write config.json into
 * the directory the child server reads it from, and two copies of that path are
 * two ways for them to drift apart.
 */
function sandboxConfigHome(root) {
  return path.join(root, ".config");
}

/**
 * The config directory, mirroring getConfigDirectory() in src/core/config/paths.ts.
 *
 * `root` is the *sandbox* root, never the real home. Every branch derives the
 * answer from `root` alone. An earlier version read XDG_CONFIG_HOME or APPDATA
 * from the harness's own environment, so on any machine with those set it
 * resolved into the developer's real config dir while the child, spawned with
 * redirected variables, read a directory that never received the config. Every
 * tool call then failed with "Access Denied: Path is outside allowed
 * directories".
 */
export function configRootFor(root) {
  if (process.platform === "win32") {
    return path.join(root, "AppData", "Roaming", "file-organizer-mcp");
  }
  if (process.platform === "darwin") {
    return path.join(root, "Library", "Application Support", "file-organizer-mcp");
  }
  return path.join(sandboxConfigHome(root), "file-organizer-mcp");
}

/**
 * True when target sits strictly inside parent. A separator-anchored prefix
 * check, like isOurSandbox(): `/sandbox-other` is not inside `/sandbox`, and a
 * config dir equal to the sandbox root is not a config dir.
 */
function isInside(parent, target) {
  return target !== parent && target.startsWith(parent + path.sep);
}

/**
 * The only place a write can leave the sandbox. configRootFor() consults the
 * platform, so a host APPDATA or XDG_CONFIG_HOME a future edit fails to ignore
 * resolves config.json into the developer's real config dir, and every write in
 * ensureSandbox() would land there quietly. Refuse loudly instead.
 */
export function assertSandboxConfigDir(root, configDir) {
  if (isInside(root, configDir)) return;
  throw new SandboxRefusalError(
    `refusing to use ${configDir} as the sandbox config directory.\n` +
      `It is outside the sandbox root ${root}, so this looks like the developer's real config directory.`
  );
}

/**
 * HOME moves every state location. APPDATA or XDG_CONFIG_HOME alone would move
 * the history, rollback and backup dirs but leave config.json in the real home,
 * so the sandbox would still load the developer's allow-list.
 */
export function sandboxEnv(root, { logLevel = "error" } = {}) {
  const env = { ...process.env, LOG_LEVEL: logLevel };
  if (process.platform === "win32") {
    env.USERPROFILE = root;
    env.APPDATA = path.join(root, "AppData", "Roaming");
  } else {
    env.HOME = root;
    env.XDG_CONFIG_HOME = sandboxConfigHome(root);
  }
  return env;
}

const PDF_HEADER = Buffer.from([0x25, 0x50, 0x44, 0x46]);
const ZIP_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

/**
 * Fixtures are real shapes, not an empty dir: a nested tree, exact duplicate
 * pairs at two depths, a mislabelled file whose magic bytes disagree with its
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

/**
 * Create or refresh a sandbox and return its paths. Throws
 * SandboxRefusalError before any write when the target is not ours to wipe.
 */
export async function ensureSandbox(name, { fresh = false } = {}) {
  const root = path.resolve(name || path.join(SANDBOX_ROOT, "default"));
  // A caller-supplied root may hold real work, so wiping it needs proof it is ours.
  if (fresh && !(await isOurSandbox(root))) {
    throw new SandboxRefusalError(
      `refusing to --fresh ${root}. It carries no ${MARKER}, so it is not a sandbox this helper created.`
    );
  }
  // Resolve the config dir and prove it before anything touches the disk.
  const configDir = configRootFor(root);
  assertSandboxConfigDir(root, configDir);

  if (fresh) await fs.rm(root, { recursive: true, force: true });
  await fs.mkdir(configDir, { recursive: true });
  await fs.mkdir(path.join(root, "data"), { recursive: true });
  await fs.writeFile(path.join(root, MARKER), "created by the verify harness\n");

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

/**
 * A directory is ours to delete only if it sits under our own root or carries
 * our marker. "Directly under tmpdir" is not enough: /tmp holds unrelated work.
 */
export async function isOurSandbox(target) {
  const root = path.resolve(target);
  if (root === SANDBOX_ROOT || root.startsWith(SANDBOX_ROOT + path.sep)) return true;
  return exists(path.join(root, MARKER));
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

/**
 * Open one server session, run `run(client)` inside the initialize handshake,
 * and always stop the child.
 */
export async function session(root, run, { logLevel, onStderr } = {}) {
  await fs.access(SERVER_ENTRY).catch(() => {
    throw new SandboxRefusalError(`dist/src/index.js is missing. Run \`npm run build\` first.`);
  });
  const client = connect(sandboxEnv(root, { logLevel }), (chunk) => onStderr?.(chunk));
  try {
    await client.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "verify-harness", version: "1" },
    });
    client.notify("notifications/initialized", {});
    return await run(client);
  } finally {
    client.stop();
  }
}

export async function listTools(root) {
  return session(root, (client) => client.request("tools/list", {}));
}

export function coerce(raw) {
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

/**
 * Pull the parsed body out of a ToolResponse: JSON when the text parses, the
 * structuredContent when there is no text, the raw text otherwise.
 */
export function parseBody(result) {
  const text = result?.content?.[0]?.text;
  if (typeof text !== "string") return result?.structuredContent ?? null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Read the sandbox's operations.jsonl; null when nothing has organized yet. */
export async function readHistory(root) {
  const configDir = configRootFor(root);
  assertSandboxConfigDir(root, configDir);
  const file = path.join(configDir, "operations.jsonl");
  const raw = await fs.readFile(file, "utf8").catch(() => null);
  if (raw === null) return null;
  return raw.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
}
