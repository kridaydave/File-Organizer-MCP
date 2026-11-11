/**
 * Scenario coverage gate.
 *
 * Every registered tool must either be driven by a step in
 * scripts/verify/scenarios/*.mjs or carry an explicit waiver with a reason in
 * scripts/verify/coverage.json. A tool that appears in neither fails here, so
 * a new tool cannot land without either a real-server scenario or a reviewed
 * excuse.
 *
 * The covered set is derived from the scenario files, never listed in the
 * manifest: a deleted scenario cannot leave a stale claim behind, the same
 * direction tests/unit/docs-tool-list.test.ts reads its map from disk.
 */

import { describe, expect, it } from "@jest/globals";
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SCENARIOS_DIR = path.join(REPO_ROOT, "scripts/verify/scenarios");
const COVERAGE = path.join(REPO_ROOT, "scripts/verify/coverage.json");

let cachedRegistry: string[] | null = null;
function registryToolNames(): string[] {
  // The registry is a dist artifact of src/mcp/registry.ts; reading the tool
  // names out of the built server keeps this test static and fast while still
  // reading the source of truth the wire serves.
  if (cachedRegistry) return cachedRegistry;
  const script = path.join(REPO_ROOT, ".opencode/skills/verify-file-organizer/scripts/control-file-organizer.mjs");
  const out = execFileSync(process.execPath, [script, "tools"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  cachedRegistry = (JSON.parse(out) as Array<{ name: string }>).map((t) => t.name);
  return cachedRegistry;
}

/** Tool names referenced by scenario steps, e.g. tool: "scan_directory". */
function scenarioTools(): string[] {
  const files = fs.readdirSync(SCENARIOS_DIR).filter((f) => f.endsWith(".mjs")).sort();
  const tools = new Set<string>();
  for (const file of files) {
    const source = fs.readFileSync(path.join(SCENARIOS_DIR, file), "utf8");
    for (const match of source.matchAll(/tool:\s*"([^"]+)"/g)) {
      const short = match[1] ?? "";
      tools.add(short.startsWith("file_organizer_") ? short : `file_organizer_${short}`);
    }
  }
  return Array.from(tools).sort();
}

function waived(): Record<string, string> {
  return (JSON.parse(fs.readFileSync(COVERAGE, "utf8")) as { waived: Record<string, string> }).waived;
}

describe("verify scenario coverage", () => {
  it("every tool referenced by a scenario is registered", () => {
    const registered = new Set(registryToolNames());
    expect(registered.size).toBeGreaterThan(0);
    const unknown = scenarioTools().filter((t) => !registered.has(t));
    expect(unknown).toEqual([]);
  });

  it("every registered tool has a scenario or an explicit waiver", () => {
    const registered = registryToolNames().sort();
    const covered = scenarioTools();
    const waivedNames = Object.keys(waived()).sort();

    const missing = registered.filter((t) => !covered.includes(t) && !waivedNames.includes(t));
    expect(missing).toEqual([]);

    // A tool both covered and waived means the waiver is stale; a waiver for a
    // tool that no longer exists means the ledger is not being read.
    const stale = waivedNames.filter((t) => covered.includes(t) || !registered.includes(t));
    expect(stale).toEqual([]);
  });

  it("every waiver states a reason", () => {
    const noReason = Object.entries(waived())
      .filter(([, reason]) => typeof reason !== "string" || reason.trim().length < 10)
      .map(([tool]) => tool);
    expect(noReason).toEqual([]);
  });
});
