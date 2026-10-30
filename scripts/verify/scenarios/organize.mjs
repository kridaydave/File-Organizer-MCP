/**
 * The core flow: scan -> preview -> validate -> organize -> history -> undo.
 * Proves the whole loop on the real server, including that undo restores the
 * file organize moved back to its original path on disk.
 */

import fs from "node:fs/promises";
import path from "node:path";

export const name = "organize";

export const scenarios = [
  {
    name: "scan-preview-organize-undo",
    steps: [
      {
        name: "scan",
        tool: "scan_directory",
        args: ({ sb }) => ({ directory: sb.dataDir }),
        assert(body) {
          const count = body.total_count ?? body.totalFiles;
          if (!(count > 0)) throw new Error(`scan found no files: ${JSON.stringify(body).slice(0, 200)}`);
        },
      },
      {
        name: "preview",
        tool: "preview_organization",
        args: ({ sb }) => ({ directory: sb.dataDir }),
      },
      {
        name: "validate",
        tool: "validate_organization_plan",
        args: ({ sb }) => ({ directory: sb.dataDir, conflict_strategy: "rename" }),
        assert(body) {
          if (body.ok !== true) {
            throw new Error(`plan not ok: ${JSON.stringify(body.findings ?? body).slice(0, 300)}`);
          }
        },
      },
      {
        name: "organize",
        tool: "organize_files",
        args: ({ sb }) => ({ directory: sb.dataDir, dry_run: false, conflict_strategy: "rename" }),
        assert(body) {
          if (!body.manifest_id) throw new Error("organize returned no manifest_id, so the undo step cannot be targeted");
          const moved = (body.actions ?? []).length;
          if (moved === 0) throw new Error("organize reported no actions, so the undo would be vacuous");
        },
      },
      {
        tool: "view_history",
        args: () => ({}),
      },
      {
        tool: "categorize_by_type",
        args: ({ sb }) => ({ directory: sb.dataDir }),
      },
      {
        tool: "verify_integrity",
        args: ({ bodies }) => ({ manifest_id: bodies.organize.manifest_id }),
        assert(body) {
          // The batch was just written, so its manifest must verify clean.
          if (body.ok === false) throw new Error(`verify_integrity failed on a fresh manifest: ${JSON.stringify(body).slice(0, 300)}`);
        },
      },
      {
        tool: "undo_last_operation",
        args: ({ bodies }) => ({ manifest_id: bodies.organize.manifest_id }),
        async assert(body, _result, sb) {
          // organize moves top-level files first; undo must put this one back.
          await fs.access(path.join(sb.dataDir, "dupe-a.txt"));
        },
      },
    ],
  },
];
