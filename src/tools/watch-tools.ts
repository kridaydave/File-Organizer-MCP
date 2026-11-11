/**
 * File Organizer MCP Server
 * watch_directory, unwatch_directory, list_watches Tools
 *
 * The three write/list halves of the watch set. Their business logic already
 * lives in `src/extensions/scheduler/watch-manager.ts` (the same functions the
 * `file-organizer-watch` CLI subcommands call) and their Zod schemas in
 * `src/extensions/scheduler/watch.schemas.ts`. This module supplies only the
 * MCP-facing contract the client reads off the wire: the tool name, the
 * description, and a hand-written JSON `inputSchema` kept in step with the Zod
 * schema. `tests/unit/tools/watch.test.ts` asserts the two stay in step, since
 * nothing else checks the hand-written schema against the Zod one.
 *
 * Keeping the definitions here rather than next to the handlers follows the
 * registry's own rule (`src/mcp/registry.ts`): every tool definition lives in
 * `src/tools/`, so all 40+ MCP contracts sit in one directory while the watch
 * scheduling logic stays with the scheduler.
 *
 * @module tools/watch-tools
 */

import type { ToolDefinition } from "../types.js";

const RESPONSE_FORMAT_JSON_SCHEMA = {
  type: "string",
  enum: ["json", "markdown"],
  default: "markdown",
  description:
    'Output format: "markdown" for human-readable, "json" for programmatic use',
} as const;

/**
 * Add a directory to the watch list, or update the schedule of one already
 * listed.
 *
 * Writes config.json, so it is not read-only, and registering a directory that
 * is already watched replaces that entry rather than adding a second one.
 */
export const watchDirectoryToolDefinition: ToolDefinition = {
  name: "file_organizer_watch_directory",
  title: "Watch Directory",
  description:
    "Add a directory to the watch list, or update the schedule of one already listed. Writes config.json. The schedule is a standard cron expression evaluated in the machine's local time (the timezone node-cron actually fires in, not UTC). A pass organized by this watch honors the watch's own rules: min_file_age_minutes skips files written moments ago, and max_files_per_run caps how many files one pass moves. Registering a directory that is already watched replaces its entry rather than adding a second one. This only edits the configuration; run the file-organizer-watch command to start the watcher that acts on it.",
  inputSchema: {
    type: "object",
    properties: {
      directory: {
        type: "string",
        minLength: 1,
        description: "Full path to the directory to watch",
      },
      schedule: {
        type: "string",
        minLength: 1,
        description:
          'Cron expression (e.g., "0 9 * * *" for 9am daily, "*/30 * * * *" for every 30 min)',
      },
      auto_organize: {
        type: "boolean",
        default: true,
        description: "Enable auto-organization on this schedule",
      },
      min_file_age_minutes: {
        type: "integer",
        minimum: 0,
        description:
          "Minimum file age in minutes before organizing (prevents organizing files being written)",
      },
      max_files_per_run: {
        type: "integer",
        minimum: 1,
        description: "Maximum files to process per run",
      },
      response_format: RESPONSE_FORMAT_JSON_SCHEMA,
    },
    required: ["directory", "schedule"],
  },
  annotations: {
    // Writes config.json, and re-registering a directory overwrites its
    // existing entry, so it is neither read-only nor side-effect free.
    readOnlyHint: false,
    destructiveHint: true,
    // The same call repeated leaves the identical watch entry in place: the
    // second run updates to the same values rather than compounding.
    idempotentHint: true,
    // Only edits local config; no network or external service is touched.
    openWorldHint: false,
  },
};

/**
 * Remove a directory from the watch list.
 *
 * Writes config.json. Only the watch entry is removed; files already organized
 * are left where they are. Removing a directory that is not watched is reported
 * as an error and changes nothing.
 */
export const unwatchDirectoryToolDefinition: ToolDefinition = {
  name: "file_organizer_unwatch_directory",
  title: "Unwatch Directory",
  description:
    "Remove a directory from the watch list. Writes config.json. Only the watch entry is removed; files the watch already organized are left where they are. Removing a directory that is not in the watch list is reported as an error and changes nothing.",
  inputSchema: {
    type: "object",
    properties: {
      directory: {
        type: "string",
        minLength: 1,
        description: "Full path to the directory to remove from watch list",
      },
      response_format: RESPONSE_FORMAT_JSON_SCHEMA,
    },
    required: ["directory"],
  },
  annotations: {
    // Writes config.json by deleting a watch entry.
    readOnlyHint: false,
    destructiveHint: true,
    // Removing an already-absent directory leaves the world unchanged, so a
    // retry never compounds, even though the repeat call reports an error.
    idempotentHint: true,
    // Only edits local config; no network or external service is touched.
    openWorldHint: false,
  },
};

/**
 * List every directory currently in the watch list with its schedule and rules.
 *
 * Read-only. This is the raw watch list; `file_organizer_watch_status` layers
 * next-run times and a liveness state on the same entries.
 */
export const listWatchesToolDefinition: ToolDefinition = {
  name: "file_organizer_list_watches",
  title: "List Watches",
  description:
    "List every directory currently in the watch list with its cron schedule and rules (auto_organize, min_file_age_minutes, max_files_per_run). Read-only: reads config.json and writes nothing. This is the raw watch list; file_organizer_watch_status adds next-run times and a liveness state for the same entries.",
  inputSchema: {
    type: "object",
    properties: {
      response_format: RESPONSE_FORMAT_JSON_SCHEMA,
    },
    required: [],
  },
  annotations: {
    // Reads config.json only.
    readOnlyHint: true,
    destructiveHint: false,
    // Reading twice returns the same list and never changes the world.
    idempotentHint: true,
    // Only reads local config; no network or external service is touched.
    openWorldHint: false,
  },
};

// The handlers already exist in the scheduler extension (they back the CLI's
// add/remove/list subcommands too). Re-exported here so the registry imports a
// single module per tool, matching how every other src/tools/ module works.
export {
  handleWatchDirectory,
  handleUnwatchDirectory,
  handleListWatches,
} from "../extensions/scheduler/watch-manager.js";
