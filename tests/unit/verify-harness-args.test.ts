/**
 * verify-file-organizer harness: argument parsing.
 *
 * The harness is the thing AGENTS.md tells an agent to reach for instead of
 * trusting a passing unit test, so a silent failure in its own argument parsing
 * is expensive: it makes every proof look green while dropping the arguments
 * that were supposed to drive it.
 *
 * `--arg key=value` was documented as the way to pass a tool argument and as
 * repeatable. It was neither. Every `--arg` was stored in the flags Map under
 * the literal key "arg", so `--arg files=[...]` reached the server as
 * `{arg: 'files=[...]'}` and the tool rejected the call with a missing-field
 * error that looked like a tool bug. Being a Map, a repeated key also
 * overwrote the earlier value.
 *
 * These spawn the harness for real and read the args it reports sending, which
 * is the only place the parse is observable.
 */

import { describe, it, expect, afterAll } from "@jest/globals";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const HARNESS = path.join(
  REPO_ROOT,
  ".opencode/skills/verify-file-organizer/scripts/control-file-organizer.mjs",
);

/**
 * Run one harness `call` and return the args it says it sent to the server.
 *
 * The tool is `doctor`, which takes no required arguments, so the request
 * reaches the server regardless of what we pass and the echo comes back
 * unmangled. A bad sandbox or an unbuilt dist/ surfaces as a thrown error
 * rather than a silent empty object.
 */
function sentArgs(...argv: string[]): Record<string, unknown> {
  const stdout = execFileSync(
    process.execPath,
    [HARNESS, "call", "doctor", ...argv, "--json"],
    { cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  const parsed = JSON.parse(stdout) as { args: Record<string, unknown> };
  return parsed.args;
}

describe("verify-file-organizer harness argument parsing", () => {
  it("splits --arg key=value into a key and a value", () => {
    const args = sentArgs("--arg", "directory=/tmp/somewhere");
    expect(args.directory).toBe("/tmp/somewhere");
    // The regression: the pair used to arrive as the literal key "arg".
    expect(args.arg).toBeUndefined();
  });

  it("coerces a JSON array so a list argument survives", () => {
    const args = sentArgs("--arg", 'files=["/tmp/a.txt","/tmp/b.txt"]');
    expect(args.files).toEqual(["/tmp/a.txt", "/tmp/b.txt"]);
  });

  it("keeps every occurrence when --arg is repeated", () => {
    const args = sentArgs(
      "--arg",
      "directory=/tmp/one",
      "--arg",
      'files=["/tmp/a.txt"]',
    );
    expect(args.directory).toBe("/tmp/one");
    expect(args.files).toEqual(["/tmp/a.txt"]);
  });

  it("coerces booleans and numbers rather than passing them as strings", () => {
    const args = sentArgs("--arg", "dry_run=false", "--arg", "limit=25");
    expect(args.dry_run).toBe(false);
    expect(args.limit).toBe(25);
  });

  it("still accepts the bare --key value form", () => {
    const args = sentArgs("--directory", "/tmp/bare");
    expect(args.directory).toBe("/tmp/bare");
  });

  it("still accepts the --key=value form", () => {
    const args = sentArgs("--directory=/tmp/joined");
    expect(args.directory).toBe("/tmp/joined");
  });
});

/**
 * The harness must not write to the developer's real config.
 *
 * `ensureSandbox` records the sandbox allow-list in config.json, and the server
 * reads that file back out of the sandbox it was spawned with. Resolving the
 * config directory from the ambient XDG_CONFIG_HOME rather than from the sandbox
 * root put those two in different places: the allow-list went to the real
 * `~/.config/file-organizer-mcp/config.json`, which the harness created on a
 * machine that had none, and the server looked for it in the sandbox and did not
 * find it. Every `--sandbox` call then failed with "outside allowed
 * directories", and the default sandbox only worked because it was reading the
 * real home's allow-list.
 *
 * These run the harness with XDG_CONFIG_HOME pointed at a sentinel directory
 * and assert nothing was written there.
 */
describe("verify-file-organizer sandbox stays out of the real config", () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "fo-harness-"));
  const sentinel = path.join(tmpRoot, "sentinel-xdg");

  afterAll(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  function sandboxIn(root: string): string {
    return execFileSync(
      process.execPath,
      [HARNESS, "sandbox", "--sandbox", root],
      {
        cwd: REPO_ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, XDG_CONFIG_HOME: sentinel, HOME: sentinel },
      },
    );
  }

  it("writes the sandbox config inside the sandbox root", () => {
    const root = path.join(tmpRoot, "sandbox-a");
    const out = JSON.parse(sandboxIn(root)) as { configFile: string };

    expect(out.configFile.startsWith(root + path.sep)).toBe(true);
    expect(fs.existsSync(out.configFile)).toBe(true);
  });

  it("leaves the real config location untouched", () => {
    sandboxIn(path.join(tmpRoot, "sandbox-b"));

    expect(fs.existsSync(sentinel)).toBe(false);
  });
});