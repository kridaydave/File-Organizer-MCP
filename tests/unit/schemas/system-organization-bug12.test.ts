import { describe, it, expect } from "@jest/globals";
import os from "os";
import { SystemOrganizationInputSchema } from "../../../src/schemas/organize.js";
import { handleSystemOrganization } from "../../../src/tools/system-organization.js";

describe("BUG-12 system organize local_fallback_prefix containment", () => {
  it("rejects schema input that traverses out of the source directory", () => {
    const result = SystemOrganizationInputSchema.safeParse({
      source_dir: os.tmpdir(),
      local_fallback_prefix: "../../evil",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a normal local fallback prefix", () => {
    const result = SystemOrganizationInputSchema.safeParse({
      source_dir: os.tmpdir(),
      local_fallback_prefix: "Sorted",
    });
    expect(result.success).toBe(true);
  });

  it("returns an error from the handler for a traversal prefix", async () => {
    const result = await handleSystemOrganization({
      source_dir: "Downloads",
      local_fallback_prefix: "../../evil",
      dry_run: true,
    });
    expect(result.isError).toBe(true);
  });
});