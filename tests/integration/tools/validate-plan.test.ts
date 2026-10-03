/**
 * validate_organization_plan — tool wiring.
 *
 * The sandbox lives under os.tmpdir() and is granted through
 * CONFIG.paths.customAllowed. Assertions compare basenames, relative paths,
 * and sorted listings, never a raw absolute path, because macOS rewrites /var
 * to /private/var and Windows expands 8.3 short names.
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import fs from "fs/promises";
import os from "os";
import path from "path";

const { CONFIG } = await import("../../../src/config.js");
const { handleValidateOrganizationPlan } =
  await import("../../../src/tools/organization-preview.js");
const { getToolHandler, hasTool, TOOLS } =
  await import("../../../src/mcp/registry.js");
const { validateOrganizationPlanOutputSchema } =
  await import("../../../src/schemas/output.js");

type Finding = {
  kind: string;
  severity: string;
  sources: string[];
  destinations: string[];
  detail: string;
};

type Validation = {
  directory: string;
  ok: boolean;
  moves_checked: number;
  counts: { error: number; warning: number };
  findings: Finding[];
  checked: string[];
  not_checked: string[];
};

const TOOL_NAME = "file_organizer_validate_organization_plan";

describe("validate_organization_plan", () => {
  let testDir: string;
  let restoreCustomAllowed: string[] | undefined;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "validate-plan-"));
    restoreCustomAllowed = CONFIG.paths._overrideCustomAllowed;
    CONFIG.paths.customAllowed = [os.tmpdir()];
  });

  afterEach(async () => {
    CONFIG.paths.customAllowed = restoreCustomAllowed;
    await new Promise((r) => setTimeout(r, 100));
    await fs.rm(testDir, { recursive: true, force: true });
  });

  async function seed(): Promise<void> {
    // Two sources that plan onto one destination name.
    await fs.mkdir(path.join(testDir, "a"), { recursive: true });
    await fs.mkdir(path.join(testDir, "b"), { recursive: true });
    await fs.writeFile(path.join(testDir, "a", "report.txt"), "first");
    await fs.writeFile(path.join(testDir, "b", "report.txt"), "second");
    // A source whose planned destination is already occupied.
    await fs.writeFile(path.join(testDir, "notes.md"), "incoming");
    await fs.mkdir(path.join(testDir, "Documents"), { recursive: true });
    await fs.writeFile(path.join(testDir, "Documents", "notes.md"), "existing");
    // A source the sensitive-file gate refuses.
    await fs.writeFile(path.join(testDir, "passwords.txt"), "hunter2");
  }

  async function validate(
    args: Record<string, unknown> = {},
  ): Promise<Validation> {
    const res = await handleValidateOrganizationPlan({
      directory: testDir,
      include_subdirs: true,
      response_format: "json",
      ...args,
    });
    expect(res.isError).toBeUndefined();
    return res.structuredContent as unknown as Validation;
  }

  const kinds = (out: Validation) => out.findings.map((f) => f.kind).sort();

  it("is registered with a handler and honest annotations", () => {
    expect(hasTool(TOOL_NAME)).toBe(true);
    expect(typeof getToolHandler(TOOL_NAME)).toBe("function");

    const def = TOOLS.find((t) => t.name === TOOL_NAME);
    expect(def).toBeDefined();
    // Read-only: it moves nothing, so the annotations must say so.
    expect(def?.annotations).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    });
    expect(def?.outputSchema).toBeDefined();
  });

  it("structuredContent matches the declared output schema", async () => {
    await seed();
    const res = await handleValidateOrganizationPlan({
      directory: testDir,
      include_subdirs: true,
      response_format: "json",
    });

    const parsed = validateOrganizationPlanOutputSchema.safeParse(
      res.structuredContent,
    );
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.findings.length).toBeGreaterThan(0);
  });

  it("flags collisions, occupied destinations, and sensitive sources", async () => {
    await seed();

    const out = await validate();

    expect(kinds(out)).toEqual([
      "destination_exists",
      "destination_name_collision",
      "sensitive_source",
    ]);
    expect(out.counts.warning).toBe(3);
    expect(out.counts.error).toBe(0);
    expect(out.ok).toBe(true);
    expect(out.moves_checked).toBeGreaterThanOrEqual(4);

    const collision = out.findings.find(
      (f) => f.kind === "destination_name_collision",
    );
    // Basenames, because the absolute form differs per platform.
    expect(
      collision?.sources.map((s) => path.relative(testDir, s)).sort(),
    ).toEqual([path.join("a", "report.txt"), path.join("b", "report.txt")]);
    expect(collision?.destinations.map((d) => path.basename(d)).sort()).toEqual(
      ["report.txt", "report_1.txt"],
    );
    expect(collision?.severity).toBe("warning");

    const occupied = out.findings.find((f) => f.kind === "destination_exists");
    expect(occupied?.sources.map((s) => path.basename(s))).toEqual([
      "notes.md",
    ]);
    expect(occupied?.destinations.map((d) => path.basename(d))).toEqual([
      "notes.md",
    ]);

    const sensitive = out.findings.find((f) => f.kind === "sensitive_source");
    expect(sensitive?.sources.map((s) => path.basename(s))).toEqual([
      "passwords.txt",
    ]);
  });

  it("reports ok with the scope of the check for a clean directory", async () => {
    await fs.writeFile(path.join(testDir, "readme.md"), "# hi");

    const out = await validate();

    expect(out.findings).toEqual([]);
    expect(out.ok).toBe(true);
    expect(out.moves_checked).toBe(1);
    expect(out.checked.length).toBeGreaterThan(0);
    expect(out.not_checked.length).toBeGreaterThan(0);
  });

  it("is not ok when the plan leaves two sources on one destination", async () => {
    await seed();

    const out = await validate({ conflict_strategy: "overwrite" });

    expect(out.ok).toBe(false);
    expect(out.counts.error).toBeGreaterThanOrEqual(1);
    const collision = out.findings.find(
      (f) => f.kind === "destination_name_collision",
    );
    expect(collision?.severity).toBe("error");
  });

  it("markdown output carries the verdict, findings, and scope", async () => {
    await seed();

    const res = await handleValidateOrganizationPlan({
      directory: testDir,
      include_subdirs: true,
    });
    const text = res.content[0]!.type === "text" ? res.content[0]!.text : "";

    expect(text).toContain("### Plan validation for");
    expect(text).toContain(": OK");
    expect(text).toContain("**Destination name collision**");
    expect(text).toContain("**Checked:**");
    expect(text).toContain("**Not checked:**");
    // The SDK rejects results from outputSchema tools without structuredContent.
    expect(res.structuredContent).toBeDefined();
  });

  it("touches nothing on disk", async () => {
    await seed();

    const before = await snapshot(testDir);
    await validate();
    const after = await snapshot(testDir);

    expect(after).toEqual(before);
  });

  it("refuses a directory outside the allowed roots", async () => {
    const res = await handleValidateOrganizationPlan({
      directory: path.parse(os.tmpdir()).root,
      response_format: "json",
    });

    expect(res.isError).toBe(true);
    expect(res.structuredContent).toBeUndefined();
  });

  it("rejects a missing directory with an error response", async () => {
    const res = await handleValidateOrganizationPlan({
      response_format: "json",
    });

    expect(res.isError).toBe(true);
    const text = res.content[0]!.type === "text" ? res.content[0]!.text : "";
    expect(text).toContain("Error:");
  });
});

/**
 * Sorted relative listing of every file under `dir`. readdir order is
 * filesystem order, so it must never be compared unsorted.
 */
async function snapshot(dir: string, prefix = ""): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...(await snapshot(path.join(dir, entry.name), rel)));
    } else {
      const stats = await fs.stat(path.join(dir, entry.name));
      out.push(`${rel}:${stats.size}`);
    }
  }
  return out.sort();
}
