/**
 * file_organizer_sensitive_scan — tool wiring.
 *
 * These call the handler the way the MCP server does and assert on the payload
 * the registry advertises: the tool is reachable by name, its structuredContent
 * matches the declared outputSchema, the risk score arrives with the reasons
 * that produced it, and the "not safe to share" caveat survives both response
 * formats. markdown is the default, and an agent reading only the text must
 * still see the caveat, so it is asserted there too.
 *
 * The sandbox lives under os.tmpdir() and is granted through
 * CONFIG.paths.customAllowed. Assertions go through path.basename because
 * macOS answers /private/var for a /var temp dir.
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from "@jest/globals";
import fs from "fs/promises";
import os from "os";
import path from "path";

const { CONFIG } = await import("../../../src/config.js");
const { handleSensitiveScan } = await import(
  "../../../src/tools/sensitive-scan.js"
);
const { sensitiveScanOutputSchema } = await import(
  "../../../src/schemas/output.js"
);
const { toolHandlers } = await import("../../../src/mcp/registry.js");
const { jpegWithExif } = await import("../../helpers/exif-fixture.js");

type ScanPayload = {
  directory: string;
  scanned_count: number;
  skipped_count: number;
  flagged_count: number;
  highest_risk_score: number;
  truncated: boolean;
  files: Array<{
    name: string;
    risk_score: number;
    risk_level: string;
    reasons: Array<{
      kind: string;
      weight: number;
      detail: string;
      exif_tags: string[];
      value?: string;
    }>;
  }>;
  skipped: Array<{ name: string; reason: string; detail: string }>;
  limits: string[];
};

describe("file_organizer_sensitive_scan", () => {
  let testDir: string;
  let restoreCustomAllowed: string[] | undefined;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "sensitive-tool-"));
    restoreCustomAllowed = CONFIG.paths._overrideCustomAllowed;
    CONFIG.paths.customAllowed = [os.tmpdir()];
  });

  afterEach(async () => {
    CONFIG.paths.customAllowed = restoreCustomAllowed;
    await new Promise((r) => setTimeout(r, 100));
    await fs.rm(testDir, { recursive: true, force: true });
  });

  async function scan(
    directory: string,
    extra: Record<string, unknown> = {},
  ): Promise<ScanPayload> {
    const res = await handleSensitiveScan({
      directory,
      response_format: "json",
      ...extra,
    });
    expect(res.isError).toBeUndefined();
    // The handler must produce a payload, not an undefined result that a
    // permissive assertion would wave through.
    expect(res.structuredContent).toBeDefined();
    const parsed = sensitiveScanOutputSchema.safeParse(res.structuredContent);
    expect(parsed.success).toBe(true);
    return res.structuredContent as ScanPayload;
  }

  async function writeJpeg(
    name: string,
    fixture: Parameters<typeof jpegWithExif>[0] = {},
  ): Promise<void> {
    await fs.writeFile(path.join(testDir, name), jpegWithExif(fixture));
  }

  it("is registered under the name the issue asks for", () => {
    expect(toolHandlers.has("file_organizer_sensitive_scan")).toBe(true);
  });

  it("reports a GPS-tagged photo with the reasons behind its score", async () => {
    await writeJpeg("trip.jpg", {
      latitude: [51, 30, 26.4, "N"],
      longitude: [0, 7, 39.6, "W"],
      cameraOwnerName: "Jane Q Public",
    });

    const out = await scan(testDir);

    expect(out.scanned_count).toBe(1);
    expect(out.flagged_count).toBe(1);
    expect(out.highest_risk_score).toBe(70);

    const file = out.files[0];
    expect(file?.name).toBe("trip.jpg");
    expect(file?.risk_score).toBe(70);
    expect(file?.risk_level).toBe("high");

    const reasons = file?.reasons ?? [];
    expect(reasons.map((r) => r.kind).sort()).toEqual([
      "gps_coordinates",
      "owner_name",
    ]);
    // The score has to be explainable: the reasons add up to it.
    expect(reasons.reduce((sum, r) => sum + r.weight, 0)).toBe(70);
    for (const reason of reasons) {
      expect(reason.detail.length).toBeGreaterThan(0);
      expect(reason.exif_tags.length).toBeGreaterThan(0);
    }
  });

  it("states the heuristic limit in the payload, not only in the description", async () => {
    await writeJpeg("plain.jpg");

    const out = await scan(testDir);

    expect(out.files[0]?.risk_score).toBe(0);
    expect(out.limits.join(" ")).toContain("Heuristic detection, not redaction");
    expect(out.limits.join(" ")).toContain(
      "does NOT mean the file is safe to share",
    );
  });

  it("names the files it could not analyze instead of implying they are clean", async () => {
    await writeJpeg("photo.jpg");
    await fs.writeFile(path.join(testDir, "resume.pdf"), "%PDF-1.7");

    const out = await scan(testDir);

    expect(out.scanned_count).toBe(1);
    expect(out.skipped_count).toBe(1);
    expect(out.skipped[0]?.name).toBe("resume.pdf");
    expect(out.skipped[0]?.reason).toBe("format_not_analyzed");
  });

  it("carries the caveat into the default markdown response", async () => {
    await writeJpeg("trip.jpg", {
      latitude: [51, 30, 26.4, "N"],
      longitude: [0, 7, 39.6, "W"],
    });

    const res = await handleSensitiveScan({ directory: testDir });

    expect(res.isError).toBeUndefined();
    const text = res.content[0]?.text ?? "";
    expect(text).toContain("Heuristic detection, not redaction");
    expect(text).toContain("does NOT mean the file is safe to share");
    expect(text).toContain("trip.jpg");
    expect(text).toContain("40/100 (medium)");
  });

  it("descends into subdirectories only when asked", async () => {
    const sub = path.join(testDir, "trip");
    await fs.mkdir(sub);
    await fs.writeFile(
      path.join(sub, "buried.jpg"),
      jpegWithExif({
        latitude: [51, 30, 26.4, "N"],
        longitude: [0, 7, 39.6, "W"],
      }),
    );

    expect((await scan(testDir)).scanned_count).toBe(0);
    expect(
      (await scan(testDir, { include_subdirs: true })).scanned_count,
    ).toBe(1);
  });

  it("rejects a directory outside the allowed roots without leaking its path", async () => {
    // A second sandbox that the allowlist does not cover, so the refusal names
    // a real path rather than the filesystem root.
    const forbidden = await fs.mkdtemp(
      path.join(os.tmpdir(), "sensitive-forbidden-"),
    );
    try {
      // Narrow the allowlist to the scan sandbox so the sibling is genuinely
      // outside it, rather than merely outside a subdirectory of tmpdir.
      CONFIG.paths.customAllowed = [await fs.realpath(testDir)];

      const res = await handleSensitiveScan({
        directory: forbidden,
        response_format: "json",
      });

      expect(res.isError).toBe(true);
      const text = res.content[0]?.text ?? "";
      expect(text).toContain("Access denied");
      expect(text).not.toContain(forbidden);
    } finally {
      await new Promise((r) => setTimeout(r, 100));
      await fs.rm(forbidden, { recursive: true, force: true });
    }
  });

  it("rejects a missing directory argument", async () => {
    const res = await handleSensitiveScan({ response_format: "json" });
    expect(res.isError).toBe(true);
  });
});