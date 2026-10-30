/**
 * Discovery tools over the seeded fixtures: the exact duplicate pair, the
 * category list, and the doctor's self-check.
 */

import fs from "node:fs/promises";
import path from "node:path";

export const name = "discover";

export const scenarios = [
  {
    name: "find-duplicate-pair",
    steps: [
      {
        tool: "find_duplicate_files",
        args: ({ sb }) => ({ directory: sb.dataDir }),
        assert(body) {
          const printed = JSON.stringify(body);
          // The seeded top-level pair is the only shape find_duplicate_files
          // sees (it does not recurse), so it must be in the answer.
          if (!(printed.includes("dupe-a.txt") && printed.includes("dupe-b.txt"))) {
            throw new Error(`duplicate pair missing from result: ${printed.slice(0, 300)}`);
          }
        },
      },
    ],
  },
  {
    name: "read-seeded-file",
    steps: [
      {
        tool: "read_file",
        args: ({ sb }) => ({ path: path.join(sb.dataDir, "notes", "todo.md") }),
        assert(body) {
          const text = typeof body === "string" ? body : JSON.stringify(body);
          if (!text.includes("verify skill")) throw new Error(`read_file returned unexpected content: ${text.slice(0, 200)}`);
        },
      },
      {
        tool: "read_file",
        args: ({ sb }) => ({ path: path.join(sb.dataDir, "notes", "absent.md") }),
        async assert(_body, result) {
          if (result?.isError !== true) {
            throw new Error("read_file on an absent path must report isError, not success");
          }
        },
      },
    ],
  },
  {
    name: "categories-and-doctor",
    steps: [
      {
        tool: "get_categories",
        args: () => ({}),
        assert(body) {
          const text = typeof body === "string" ? body : JSON.stringify(body);
          if (!text.toLowerCase().includes("image")) throw new Error(`categories missing the Images family: ${text.slice(0, 200)}`);
        },
      },
      {
        tool: "doctor",
        args: () => ({ response_format: "json" }),
      },
      {
        tool: "list_files",
        args: ({ sb }) => ({ directory: sb.dataDir }),
        assert(body) {
          const text = JSON.stringify(body);
          // list_files is not recursive: assert on a top-level fixture.
          if (!text.includes("dupe-a.txt")) throw new Error(`list_files did not see the seeded tree: ${text.slice(0, 300)}`);
        },
      },
    ],
  },
];
