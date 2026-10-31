#!/usr/bin/env node

/**
 * verify-harness CLI: the subcommands behind the `verify-file-organizer`
 * skill's control-file-organizer.mjs. Argument parsing and output contract
 * live here; the sandbox, stdio and JSON-RPC machinery live in harness.mjs.
 *
 * stdout is machine readable. Diagnostics go to stderr and are silent unless
 * --verbose. Exit code is 0 when the tool call succeeded, 1 when it failed,
 * 2 when the harness itself could not run.
 */

import fs from "node:fs/promises";
import path from "node:path";
import {
  REPO,
  SANDBOX_ROOT,
  MARKER,
  SandboxRefusalError,
  coerce,
  configRootFor,
  ensureSandbox,
  exists,
  isOurSandbox,
  listTools,
  parseBody,
  readHistory,
  session,
} from "./harness.mjs";

// ── argv ───────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const flags = new Map();
  const positional = [];
  // `--arg key=value` is repeatable, so it cannot live in the flags Map: a second
  // occurrence of the same key would overwrite the first. Collected in order and
  // applied after the flags, so an explicit pair always wins over a bare flag.
  const toolArgs = [];
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token.startsWith("--")) {
      const eq = token.indexOf("=");
      const key = eq !== -1 ? token.slice(2, eq) : token.slice(2);
      const value =
        eq !== -1
          ? token.slice(eq + 1)
          : argv[i + 1] && !argv[i + 1].startsWith("--")
            ? argv[++i]
            : "true";
      if (key === "arg") {
        if (value === "true") {
          throw new SandboxRefusalError("--arg needs key=value");
        }
        toolArgs.push(value);
      } else {
        flags.set(key, value);
      }
    } else {
      positional.push(token);
    }
  }
  return { flags, positional, toolArgs };
}

// ── output helpers ─────────────────────────────────────────────────────────

/**
 * Terminal error inside a subcommand: fail() throws this instead of calling
 * process.exit, and main() turns it into the exit code. process.exit must not
 * run while stdout still holds output: writes to a pipe are ASYNCHRONOUS on
 * macOS, so an immediate exit truncates the response at the pipe buffer (a
 * ~8KB `tools` listing arrived on the macOS CI leg as unterminated JSON).
 * Letting the process end naturally flushes queued writes on every platform.
 */
class CliExit extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

function makeIo(flags) {
  const verbose = flags.get("verbose") === "true";
  return {
    verbose,
    log(...parts) {
      if (verbose) process.stderr.write(parts.join(" ") + "\n");
    },
    fail(message, code = 2) {
      throw new CliExit(message, code);
    },
    ok(payload) {
      process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
    },
  };
}

// ── subcommands ────────────────────────────────────────────────────────────

const USAGE = `verify-harness - drive the File Organizer MCP server and prove the result

  doctor                     build, handshake and allowed-directory check
  tools [--filter substr]    list tools with one-line descriptions
  schema <tool>              JSON schema and annotations for one tool
  sandbox [--fresh]          create a hermetic sandbox, print its paths
  call <tool> [--arg k=v]    call one tool against a sandbox
  history                    read operations.jsonl written by the last calls
  cleanup                    remove every sandbox this helper created
  scenarios [--filter substr]  run the declarative scenarios in scenarios/

Common flags
  --sandbox <path>   reuse a specific sandbox root (default: tmp/file-organizer-verify/default)
  --fresh            recreate the sandbox and its fixtures from scratch
  --out <file>       also write the call result to <file> as proof
  --verbose          echo server stderr
  --json             force response_format=json and pretty-print the parsed body`;

function summarize(body) {
  if (typeof body === "string") return body.split("\n")[0];
  return JSON.stringify(body).slice(0, 200);
}

async function cmdDoctor({ flags, io }) {
  const checks = [];
  const record = (name, okFlag, detail) => checks.push({ check: name, ok: okFlag, detail });

  const entryExists = await exists(path.join(REPO, "dist", "src", "index.js"));
  record("dist/src/index.js present", entryExists, path.join(REPO, "dist", "src", "index.js"));
  if (!entryExists) {
    record("build", false, "run `npm run build`");
    io.ok({ ok: false, checks });
    return 1;
  }

  const pkg = JSON.parse(await fs.readFile(path.join(REPO, "package.json"), "utf8"));
  record("toolchain", true, `node ${process.versions.node}, package ${pkg.version}`);

  const sb = await ensureSandbox(flags.get("sandbox"));
  try {
    const { tools } = await listTools(sb.root);
    record("initialize handshake", true, `${tools.length} tools advertised`);

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

    io.ok({ ok: checks.every((c) => c.ok), sandbox: sb, checks });
    return checks.every((c) => c.ok) ? 0 : 1;
  } catch (error) {
    record("initialize handshake", false, error.message);
    io.ok({ ok: false, sandbox: sb, checks });
    return 1;
  }
}

async function cmdTools({ flags, io }) {
  const sb = await ensureSandbox(flags.get("sandbox"));
  const { tools } = await listTools(sb.root);
  const filter = flags.get("filter");
  const matched = filter ? tools.filter((t) => t.name.includes(filter)) : tools;
  io.ok(matched.map((t) => ({ name: t.name, title: t.title, description: t.description })));
  return 0;
}

async function cmdSchema({ flags, io, positional }) {
  const name = positional[1];
  if (!name) io.fail("schema needs a tool name");
  const sb = await ensureSandbox(flags.get("sandbox"));
  const { tools } = await listTools(sb.root);
  const tool = tools.find((t) => t.name === name || t.name === `file_organizer_${name}`);
  if (!tool) io.fail(`no such tool: ${name}`, 1);
  io.ok(tool);
  return 0;
}

async function cmdSandbox({ flags, io }) {
  const sb = await ensureSandbox(flags.get("sandbox"), { fresh: flags.get("fresh") === "true" });
  const tree = await fs
    .readdir(sb.dataDir, { recursive: true, withFileTypes: true })
    .then((entries) => entries.filter((e) => e.isFile()).map((e) => path.relative(sb.dataDir, path.join(e.parentPath ?? e.path, e.name))));
  io.ok({ root: sb.root, dataDir: sb.dataDir, configFile: path.join(sb.configDir, "config.json"), files: tree.sort() });
  return 0;
}

async function cmdCall({ flags, io, positional, toolArgs }) {
  const name = positional[1];
  if (!name) io.fail("call needs a tool name");
  const args = {};
  for (const [key, value] of flags) {
    if (["sandbox", "fresh", "out", "verbose", "json", "log-level"].includes(key)) continue;
    args[key] = coerce(value);
  }
  for (const pair of toolArgs) {
    const eq = pair.indexOf("=");
    if (eq === -1) io.fail(`--arg needs key=value, got "${pair}"`);
    args[pair.slice(0, eq)] = coerce(pair.slice(eq + 1));
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
  io.ok({ tool: short, args, isError: Boolean(failed), sandbox: sb, result: body });

  const out = flags.get("out");
  if (out) {
    await fs.mkdir(path.dirname(path.resolve(out)), { recursive: true });
    await fs.writeFile(path.resolve(out), JSON.stringify({ tool: short, args, isError: Boolean(failed), result: body }, null, 2) + "\n");
    io.log("proof written to", out);
  }
  return failed ? 1 : 0;
}

async function cmdHistory({ flags, io }) {
  const root = path.resolve(flags.get("sandbox") || path.join(SANDBOX_ROOT, "default"));
  // Read-only, but the same escape would print the developer's real
  // operations.jsonl, so it gets the same refusal as the writers.
  const entries = await readHistory(root);
  if (entries === null) {
    io.fail(`no operations.jsonl under ${configRootFor(root)}. Has an organizing tool run yet?`, 1);
  }
  io.ok(entries);
  return 0;
}

async function cmdCleanup({ flags, io }) {
  const target = flags.get("sandbox") ? path.resolve(flags.get("sandbox")) : SANDBOX_ROOT;
  if (!(await isOurSandbox(target))) {
    io.fail(
      `refusing to remove ${target}. It is neither under ${SANDBOX_ROOT} nor marked with ${MARKER}.\n` +
        `If it really is a throwaway sandbox, delete it yourself.`
    );
  }
  await fs.rm(target, { recursive: true, force: true });
  io.ok({ removed: target });
  return 0;
}

async function cmdScenarios({ flags }) {
  const { runScenarios } = await import("./run-scenarios.mjs");
  return runScenarios({ filter: flags.get("filter") });
}

// ── dispatch ───────────────────────────────────────────────────────────────

export async function main(argv) {
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (error) {
    process.stderr.write(error.message + "\n");
    return 2;
  }
  const io = makeIo(parsed.flags);
  const [command] = parsed.positional;
  const ctx = { ...parsed, io };
  try {
    switch (command) {
      case "doctor":
        return await cmdDoctor(ctx);
      case "tools":
        return await cmdTools(ctx);
      case "schema":
        return await cmdSchema(ctx);
      case "sandbox":
        return await cmdSandbox(ctx);
      case "call":
        return await cmdCall(ctx);
      case "history":
        return await cmdHistory(ctx);
      case "cleanup":
        return await cmdCleanup(ctx);
      case "scenarios":
        return await cmdScenarios(ctx);
      default:
        process.stderr.write(USAGE + "\n");
        return command ? 2 : 0;
    }
  } catch (error) {
    if (error instanceof CliExit || error instanceof SandboxRefusalError) {
      process.stderr.write(error.message + "\n");
      return error.code ?? 2;
    }
    throw error;
  }
}

// Run directly (not when imported by the skill forwarder's main()).
const invoked = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.url.replace("file://", ""));
if (invoked) {
  // exitCode, never process.exit: see CliExit above.
  process.exitCode = await main(process.argv.slice(2));
}
