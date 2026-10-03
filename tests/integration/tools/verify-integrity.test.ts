/**
 * file_organizer_verify_integrity — tool wiring.
 *
 * The tool resolves a manifest, rehashes what that manifest names, and reports
 * the drift. These tests drive the handler the way the server does, with the
 * rollback storage redirected at a sandbox so nothing reads the real undo
 * history, and check both response formats because both are contract.
 *
 * Paths are compared against the exact strings the manifest was written with
 * (the sandbox path the test itself built) rather than a canonical form, since
 * macOS realpath rewrites /var to /private/var and Windows expands short names.
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  jest,
} from "@jest/globals";
import fs from "fs/promises";
import os from "os";
import path from "path";
import crypto from "crypto";

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "verify-tool-"));

// Pointed at a per-test directory so each test starts from an empty history
// and nothing reads the real undo history.
let rollbackDir = path.join(tempRoot, "rollback");

const actualPaths = await import("../../../src/core/config/paths.js");

jest.unstable_mockModule("../../../src/core/config/paths.js", () => ({
  ...actualPaths,
  getRollbackDirectory: () => rollbackDir,
}));

const { CONFIG } = await import("../../../src/config.js");
const { handleVerifyIntegrity } =
  await import("../../../src/tools/rollback.js");
const { RollbackService } =
  await import("../../../src/core/organize/rollback.js");
const { verifyIntegrityOutputSchema } =
  await import("../../../src/schemas/output.js");

type Report = {
  manifest_id: string;
  total_files: number;
  checked: number;
  unchanged: number;
  modified: number;
  missing: number;
  unverifiable: number;
  drift_detected: boolean;
  verified: boolean;
  files: Array<{ path: string; status: string; reason?: string }>;
};

function sha256(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

describe("file_organizer_verify_integrity", () => {
  let sandbox: string;
  let rollbackService: InstanceType<typeof RollbackService>;

  beforeAll(() => {
    CONFIG.paths.customAllowed = [tempRoot];
  });

  afterAll(async () => {
    await new Promise((r) => setTimeout(r, 100));
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  beforeEach(async () => {
    sandbox = await fs.mkdtemp(path.join(os.tmpdir(), "verify-sandbox-"));
    CONFIG.paths.customAllowed = [tempRoot, sandbox];
    rollbackDir = path.join(sandbox, "rollback");
    rollbackService = new RollbackService(rollbackDir);
  });

  /** Move a file the way an organize does, then record the manifest for it. */
  async function organized(
    name: string,
    content: string,
    options: { hashBudgetBytes?: number } = {},
  ): Promise<{ manifestId: string; destination: string }> {
    const original = path.join(sandbox, "incoming", name);
    const destination = path.join(sandbox, "Documents", name);
    await fs.mkdir(path.dirname(original), { recursive: true });
    await fs.writeFile(original, content);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.rename(original, destination);

    const manifestId = await rollbackService.createManifest(
      `Organization of ${sandbox} (1 files)`,
      [
        {
          type: "move",
          originalPath: original,
          currentPath: destination,
          timestamp: 1,
        },
      ],
      options,
    );
    return { manifestId, destination };
  }

  async function verify(
    args: Record<string, unknown>,
  ): Promise<{ report: Report; isError: boolean; text: string }> {
    const res = await handleVerifyIntegrity({ response_format: "json", ...args });
    return {
      report: res.structuredContent as Report,
      isError: res.isError === true,
      text: res.content[0]?.text ?? "",
    };
  }

  it("reports a moved file as verified while its bytes are untouched", async () => {
    const { manifestId, destination } = await organized(
      "notes.txt",
      "organized bytes\n",
    );

    const { report, isError } = await verify({ manifest_id: manifestId });

    expect(isError).toBe(false);
    expect(report.manifest_id).toBe(manifestId);
    expect(report.total_files).toBe(1);
    expect(report.checked).toBe(1);
    expect(report.unchanged).toBe(1);
    expect(report.modified).toBe(0);
    expect(report.missing).toBe(0);
    expect(report.unverifiable).toBe(0);
    expect(report.drift_detected).toBe(false);
    expect(report.verified).toBe(true);
    expect(report.files[0]?.path).toBe(destination);
    expect(report.files[0]?.status).toBe("unchanged");

    const parsed = verifyIntegrityOutputSchema.safeParse(report);
    expect(parsed.success).toBe(true);
  });

  it("reports drift once a moved file is edited after the operation", async () => {
    const { manifestId, destination } = await organized(
      "notes.txt",
      "organized bytes\n",
    );
    await fs.writeFile(destination, "edited after the move\n");

    const { report, isError } = await verify({ manifest_id: manifestId });

    expect(isError).toBe(false);
    expect(report.checked).toBe(1);
    expect(report.unchanged).toBe(0);
    expect(report.modified).toBe(1);
    expect(report.drift_detected).toBe(true);
    expect(report.verified).toBe(false);
    expect(report.files[0]?.status).toBe("modified");
  });

  it("reports a moved file as missing once it is deleted after the operation", async () => {
    const { manifestId, destination } = await organized(
      "notes.txt",
      "organized bytes\n",
    );
    await fs.rm(destination);

    const { report } = await verify({ manifest_id: manifestId });

    expect(report.missing).toBe(1);
    expect(report.modified).toBe(0);
    expect(report.drift_detected).toBe(true);
    expect(report.verified).toBe(false);
    expect(report.files[0]?.status).toBe("missing");
  });

  // An unhashed manifest must not read as a clean bill of health.
  it("separates an unhashed manifest from a verified one", async () => {
    const { manifestId, destination } = await organized(
      "legacy.txt",
      "no digest was stored\n",
      { hashBudgetBytes: 0 },
    );
    // The file is in exactly the state the manifest recorded, so the only
    // honest answer is that it could not be checked.
    const { report } = await verify({ manifest_id: manifestId });

    expect(report.total_files).toBe(1);
    expect(report.checked).toBe(0);
    expect(report.unchanged).toBe(0);
    expect(report.unverifiable).toBe(1);
    expect(report.verified).toBe(false);
    expect(report.drift_detected).toBe(false);
    expect(report.files[0]?.path).toBe(destination);
    expect(report.files[0]?.status).toBe("unverifiable");
    expect(report.files[0]?.reason).toMatch(/no content hash/i);
  });

  it("verifies the most recent manifest when no id is given", async () => {
    const now = jest.spyOn(Date, "now");

    try {
      now.mockReturnValue(1_000);
      const older = await organized("older.txt", "older bytes\n");
      now.mockReturnValue(2_000);
      const newer = await organized("newer.txt", "newer bytes\n");

      const { report } = await verify({});

      expect(report.manifest_id).toBe(newer.manifestId);
      expect(report.manifest_id).not.toBe(older.manifestId);
      expect(report.files[0]?.path).toBe(newer.destination);
    } finally {
      now.mockRestore();
    }
  });

  it("keeps the markdown format honest about what it could check", async () => {
    const hashed = await organized("hashed.txt", "checked bytes\n");
    const unhashed = await organized(
      "unhashed.txt",
      "unchecked bytes\n",
      { hashBudgetBytes: 0 },
    );

    const verified = await handleVerifyIntegrity({
      manifest_id: hashed.manifestId,
    });
    const verifiedText = verified.content[0]?.text ?? "";
    expect(verifiedText).toContain("Verified");
    expect(verifiedText).toContain("**Checked:** 1/1");
    // The SDK rejects a result with no structuredContent from a tool that
    // declares an outputSchema, so markdown carries it too.
    expect(
      verifyIntegrityOutputSchema.safeParse(verified.structuredContent).success,
    ).toBe(true);

    const unhashedRes = await handleVerifyIntegrity({
      manifest_id: unhashed.manifestId,
    });
    const unhashedText = unhashedRes.content[0]?.text ?? "";
    expect(unhashedText).not.toContain("Verified");
    expect(unhashedText).toContain("**Checked:** 0/1");
    expect(unhashedText).toContain("**Unverifiable:** 1");
    expect(unhashedText).toContain(unhashed.destination);
  });

  it("refuses an id that is not a manifest UUID, without echoing it", async () => {
    const { isError, text } = await verify({
      manifest_id: "../../../../etc/passwd",
    });

    expect(isError).toBe(true);
    expect(text).not.toContain("etc/passwd");
    expect(text).not.toContain(tempRoot);
  });

  it("refuses a manifest id that does not exist", async () => {
    const { isError } = await verify({
      manifest_id: "00000000-0000-4000-8000-000000000000",
    });

    expect(isError).toBe(true);
  });

  it("says so when there is no undo history to verify", async () => {
    rollbackDir = path.join(sandbox, "empty-rollback");

    const res = await handleVerifyIntegrity({});

    expect(res.isError).toBe(true);
    expect(res.content[0]?.text).toContain("No undo history found");
  });
});
