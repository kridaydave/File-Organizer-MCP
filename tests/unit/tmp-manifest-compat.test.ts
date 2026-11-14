/**
 * PROBE: does a manifest written by the PRE-#72 code still load under #72?
 *
 * Builds a v1.0 manifest exactly the way main's createManifest did (no
 * contentHash/hashMethod on any action), signs it with the real
 * ManifestIntegrityService, drops it in a temp storage dir, then reads it
 * back through RollbackService.getManifest + verifyManifestFiles.
 */
import { describe, it, expect } from "@jest/globals";
import fs from "fs/promises";
import os from "os";
import path from "path";

const { manifestIntegrityService } = await import(
  "../../src/core/organize/manifest-integrity.js"
);
const { RollbackService } = await import("../../src/core/organize/rollback.js");
const { verifyManifestFiles } = await import(
  "../../src/core/organize/verify-integrity.js"
);

describe("probe: pre-#72 manifest loadability", () => {
  it("legacy manifest round-trips", async () => {
    const storage = await fs.mkdtemp(path.join(os.tmpdir(), "legacy-man-"));
    const work = await fs.mkdtemp(path.join(os.tmpdir(), "legacy-work-"));
    const { CONFIG } = await import("../../src/config.js");
    const prev = CONFIG.paths.customAllowed;
    CONFIG.paths.customAllowed = [os.tmpdir()];

    const target = path.join(work, "moved.txt");
    await fs.writeFile(target, "payload");
    await fs.writeFile(path.join(work, "source.txt"), "payload");

    const id = "11111111-2222-4333-8444-555555555555";
    const timestamp = 1700000000000;
    // Exactly main's shape: no contentHash, no hashMethod.
    const actions = [
      {
        type: "move" as const,
        originalPath: path.join(work, "source.txt"),
        currentPath: target,
        timestamp,
      },
    ];
    const hash = manifestIntegrityService.computeHash(actions, timestamp);
    const manifest: Record<string, unknown> = {
      id,
      timestamp,
      description: "legacy organize",
      actions,
      version: "1.0",
      hash,
    };
    manifest.signature = manifestIntegrityService.computeSignature(
      manifest as never,
    );
    await fs.writeFile(
      path.join(storage, `${id}.json`),
      JSON.stringify(manifest, null, 2),
    );

    const svc = new RollbackService(storage);
    let loaded: unknown;
    let loadError: unknown;
    try {
      loaded = await svc.getManifest(id);
    } catch (e) {
      loadError = e;
    }
    console.log("LOAD_ERROR>>>" + String(loadError) + "<<<");
    console.log("LOADED>>>" + JSON.stringify(loaded) + "<<<");

    if (loaded) {
      const report = await verifyManifestFiles(loaded as never);
      console.log("REPORT>>>" + JSON.stringify(report) + "<<<");
    }

    // Also: is it still listed by listManifests (used for "verify last op")?
    const listed = await svc.listManifests();
    console.log("LISTED>>>" + JSON.stringify(listed.map((m) => m.id)) + "<<<");

    CONFIG.paths.customAllowed = prev;
    await fs.rm(storage, { recursive: true, force: true });
    await fs.rm(work, { recursive: true, force: true });
    expect(true).toBe(true);
  });
});
