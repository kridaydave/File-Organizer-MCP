/**
 * File Organizer MCP Server v5.0.0
 * organizer_digest Tool
 *
 * @module tools/organizer-digest
 *
 * The pull model, not push. Nothing here fires on its own: you ask for a
 * digest and you get one. The input is a window, the output is a collapse of
 * every history row inside it.
 *
 * One tick over N watches is N rows in operations.jsonl and N manifests on
 * disk, and that stays true — the writer is not touched. The digest does the
 * collapsing, which is why "what did last night's scheduled passes actually
 * do" is one call instead of reading twenty rows and adding them up by hand.
 *
 * Four things a reader wants, in this order: how much happened in total, where
 * it happened, what kind of pass it was, and which passes need attention.
 * The last one is a section of its own rather than a count inside the totals,
 * because a `partial` pass is the thing most worth a human's eyes and a number
 * buried in a total is not it.
 */

import { z } from "zod";
import type { ToolDefinition, ToolResponse } from "../types.js";
import { ValidationError } from "../types.js";
import { OrganizerDigestInputSchema } from "../schemas/system.js";
import { createErrorResponse } from "../utils/error-handler.js";
import { formatDuration } from "../utils/formatters.js";
import type { HistoryEntry } from "../services/history-logger.service.js";
import { createRequestContext, type ToolContext } from "../mcp/context.js";

export type OrganizerDigestInput = z.infer<typeof OrganizerDigestInputSchema>;

/**
 * One page of history read. The history read path caps a single request here,
 * so a digest over a busy week is a handful of reads rather than one unbounded
 * one that would have to hold every row the machine has ever written.
 */
const PAGE_SIZE = 1000;

/** Milliseconds per unit of a relative window. */
const RELATIVE_UNITS = {
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
} as const;

/** Label for an entry that recorded no directory, so it is still counted. */
const NO_DIRECTORY = "(no directory recorded)";

export const organizerDigestToolDefinition: ToolDefinition = {
  name: "file_organizer_organizer_digest",
  title: "Organizer Digest",
  description:
    "Aggregate the recorded operation history into one digest over a time window: totals overall, a breakdown per directory and per operation, every partial or failed pass in its own section, and the undo manifest id of each run covered. Nothing is scheduled and nothing fires on its own — you ask, you get a digest. Read-only: it reads the same operations.jsonl the history tools read and moves nothing.",
  inputSchema: {
    type: "object",
    properties: {
      last: {
        type: "string",
        description:
          "Relative window ending now: a number followed by m, h, d or w, e.g. '24h', '7d', '2w'. Ignored when from/since is given.",
      },
      from: {
        type: "string",
        description: "ISO date string - window start, inclusive. Alias of since.",
      },
      since: {
        type: "string",
        description: "ISO date string - window start, inclusive. Alias of from.",
      },
      to: {
        type: "string",
        description:
          "ISO date string - window end, inclusive. Alias of until. Defaults to now.",
      },
      until: {
        type: "string",
        description:
          "ISO date string - window end, inclusive. Alias of to. Defaults to now.",
      },
      operation: {
        type: "string",
        description:
          "Restrict the digest to one operation, e.g. 'file_organizer_organize_files'",
      },
      status: {
        type: "string",
        enum: ["success", "error", "partial"],
        description: "Restrict the digest to one pass status",
      },
      source: {
        type: "string",
        enum: ["manual", "scheduled"],
        description: "Restrict the digest to manual or scheduled passes",
      },
      path_glob: {
        type: "string",
        description:
          "Glob matched against the paths each entry recorded, same as search_history",
      },
      privacy_mode: {
        type: "string",
        enum: ["full", "redacted", "none"],
        description:
          "Privacy mode for output: full (all details), redacted (paths hidden), none (minimal info)",
      },
      response_format: {
        type: "string",
        enum: ["json", "markdown"],
        default: "markdown",
        description:
          'Output format: "markdown" for human-readable, "json" for programmatic use',
      },
    },
    required: [],
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
};
/** The window the digest covers, echoed back so a reader can check it. */
interface DigestWindow {
  /** Window start, or null when the caller bounded nothing. */
  start: string | null;
  /** Window end. Always set: an unbounded end means "now". */
  end: string;
  start_kind: "absolute" | "relative" | "unbounded";
  /** The relative window as the caller spelled it, e.g. `24h`. */
  relative: string | null;
}

/** One row of a breakdown. `passes` is the number of history entries. */
interface DigestRow {
  passes: number;
  files_processed: number;
  files_skipped: number;
  partial: number;
  failed: number;
}

interface DigestFailure {
  timestamp: string;
  operation: string;
  status: "partial" | "error";
  source: "manual" | "scheduled";
  /** The undo handle, or null when the pass wrote no manifest. */
  manifest_id: string | null;
  detail: string | null;
  error: string | null;
}

export interface OrganizerDigest {
  generated_at: string;
  window: DigestWindow;
  filters: {
    operation: string | null;
    status: "success" | "error" | "partial" | null;
    source: "manual" | "scheduled" | null;
    path_glob: string | null;
  };
  totals: DigestRow & {
    successful: number;
    duration_ms: number;
    duration_readable: string;
    passes_with_manifest: number;
  };
  by_directory: Array<{ directory: string } & DigestRow>;
  by_operation: Array<{ operation: string } & DigestRow>;
  failures: DigestFailure[];
  undo_manifests: string[];
  limits: string[];
}

/**
 * The digest of one window, assembled from the history rows inside it.
 *
 * Pure apart from the generated_at the caller passes in, so both response
 * formats render the same numbers and a test can assemble one directly.
 */
function assembleDigest(input: {
  entries: readonly HistoryEntry[];
  window: DigestWindow;
  filters: OrganizerDigest["filters"];
  /** Rows in the window the page ceiling did not reach, or 0. */
  unreached: number;
  generatedAt: string;
}): OrganizerDigest {
  const totals = {
    passes: 0,
    files_processed: 0,
    files_skipped: 0,
    partial: 0,
    failed: 0,
    successful: 0,
    duration_ms: 0,
    passes_with_manifest: 0,
  };

  const perDirectory = new Map<string, DigestRow>();
  const perOperation = new Map<string, DigestRow>();
  const failures: DigestFailure[] = [];
  const manifests = new Set<string>();

  for (const entry of input.entries) {
    totals.passes += 1;
    totals.files_processed += entry.filesProcessed ?? 0;
    totals.files_skipped += entry.filesSkipped ?? 0;
    totals.duration_ms += entry.durationMs;
    if (entry.status === "partial") totals.partial += 1;
    else if (entry.status === "error") totals.failed += 1;
    else totals.successful += 1;
    if (entry.manifestId !== undefined) {
      totals.passes_with_manifest += 1;
      manifests.add(entry.manifestId);
    }

    // One row per entry, keyed on the first path it recorded. Both writers
    // record the root they worked on as that path, so this is the directory
    // the pass ran against; a second recorded path would be a different thing
    // and counting it here would double-count the same pass.
    bump(perDirectory, entry.paths?.[0] ?? NO_DIRECTORY, entry);
    bump(perOperation, entry.operation, entry);

    if (entry.status !== "success") {
      failures.push({
        timestamp: entry.timestamp,
        operation: entry.operation,
        status: entry.status,
        source: entry.source,
        manifest_id: entry.manifestId ?? null,
        detail: entry.details ?? null,
        error: entry.error?.message ?? null,
      });
    }
  }

  const limits: string[] = [];
  if (input.unreached > 0) {
    limits.push(
      `The window holds more passes than one read returns: ${input.unreached} older pass(es) are not counted here. Narrow the window to cover them.`,
    );
  }
  limits.push(
    "History is read from operations.jsonl plus the rotated operations.N.jsonl files beside it, so a window that crosses a rotation is still covered. The number of rotated files read follows config.historyLogging.keepRotatedFiles (default 5).",
  );

  return {
    generated_at: input.generatedAt,
    window: input.window,
    filters: input.filters,
    totals: {
      ...totals,
      duration_readable: formatDuration(totals.duration_ms),
    },
    // Newest-first, which is the order the history read already produced: the
    // pass a reader cares about most is the one that just went wrong.
    failures,
    by_directory: directoryRows(perDirectory),
    by_operation: operationRows(perOperation),
    // Sorted rather than emitted in read order: these are ids a caller pastes
    // into undo_last_operation, and two digests over the same window should
    // hand back the same list.
    undo_manifests: [...manifests].sort(compareStrings),
    limits,
  };
}

function bump(
  map: Map<string, DigestRow>,
  key: string,
  entry: HistoryEntry,
): void {
  const row = map.get(key) ?? {
    passes: 0,
    files_processed: 0,
    files_skipped: 0,
    partial: 0,
    failed: 0,
  };
  row.passes += 1;
  row.files_processed += entry.filesProcessed ?? 0;
  row.files_skipped += entry.filesSkipped ?? 0;
  if (entry.status === "partial") row.partial += 1;
  if (entry.status === "error") row.failed += 1;
  map.set(key, row);
}

/**
 * Map to a sorted array. Plain code-unit comparison, never `localeCompare`:
 * the order is part of the contract and a locale-dependent sort would make the
 * same window produce a different row order on a different machine.
 *
 * Two named functions rather than one generic over the key, because the two
 * rows are two different contract shapes and a shared generic bought nothing
 * but a cast.
 */
function directoryRows(
  map: Map<string, DigestRow>,
): OrganizerDigest["by_directory"] {
  return [...map.entries()]
    .map(([directory, row]) => ({ directory, ...row }))
    .sort((a, b) => compareStrings(a.directory, b.directory));
}

function operationRows(
  map: Map<string, DigestRow>,
): OrganizerDigest["by_operation"] {
  return [...map.entries()]
    .map(([operation, row]) => ({ operation, ...row }))
    .sort((a, b) => compareStrings(a.operation, b.operation));
}

function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * The window the caller asked for, resolved once and echoed back.
 *
 * An absolute start wins over `last`, so passing both does not silently lose
 * one of them. The Zod schema has already refused a `last` this cannot read,
 * so the defensive throw here names the constraint rather than a path.
 */
function resolveWindow(input: {
  last: string | undefined;
  from: string | undefined;
  since: string | undefined;
  to: string | undefined;
  until: string | undefined;
  now: Date;
}): DigestWindow {
  const end = new Date(input.to ?? input.until ?? input.now.toISOString());
  const absoluteStart = input.from ?? input.since;

  if (absoluteStart !== undefined) {
    return {
      start: new Date(absoluteStart).toISOString(),
      end: end.toISOString(),
      start_kind: "absolute",
      relative: null,
    };
  }

  if (input.last !== undefined) {
    const match = /^([1-9]\d*)([mhdw])$/.exec(input.last);
    if (match === null) {
      throw new ValidationError(
        "last must be a number followed by a unit: m (minutes), h (hours), d (days) or w (weeks), e.g. '24h'",
      );
    }
    const unit = match[2] as keyof typeof RELATIVE_UNITS;
    return {
      start: new Date(end.getTime() - Number(match[1]) * RELATIVE_UNITS[unit]).toISOString(),
      end: end.toISOString(),
      start_kind: "relative",
      relative: input.last,
    };
  }

  return {
    start: null,
    end: end.toISOString(),
    start_kind: "unbounded",
    relative: null,
  };
}

export async function handleOrganizerDigest(
  args: Record<string, unknown>,
  ctx: ToolContext = createRequestContext(),
): Promise<ToolResponse> {
  try {
    const parsed = OrganizerDigestInputSchema.safeParse(args);
    if (!parsed.success) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
          },
        ],
        isError: true,
      };
    }

    const {
      last,
      from,
      since,
      to,
      until,
      operation,
      status,
      source,
      path_glob,
      privacy_mode,
      response_format,
    } = parsed.data;

    const now = new Date();
    const window = resolveWindow({ last, from, since, to, until, now });

    // A window that starts after it ends is a caller mistake, not an empty
    // window, and answering it with zeroes would read as "nothing happened".
    if (window.start !== null && window.start > window.end) {
      throw new ValidationError(
        `The window starts after it ends: start ${window.start}, end ${window.end}`,
      );
    }

    const effectivePrivacyMode =
      privacy_mode ?? ctx.config.historyLogging?.privacyMode ?? "full";

    const entries: HistoryEntry[] = [];
    let total = 0;
    // Paged rather than one read, because the history read path caps a single
    // request and a digest that silently stopped at that cap would under-report
    // a busy window. Rows are keyed by id because a pass logging mid-digest
    // shifts newest-first paging by one and would otherwise count the boundary
    // row twice.
    const seen = new Set<string>();
    for (;;) {
      const page = await ctx.history.searchHistory({
        startDate: window.start ?? undefined,
        endDate: window.end,
        operation,
        status,
        source,
        pathGlob: path_glob,
        limit: PAGE_SIZE,
        offset: seen.size,
        privacyMode: effectivePrivacyMode,
      });
      total = page.total;
      for (const entry of page.entries) {
        if (seen.has(entry.id)) continue;
        seen.add(entry.id);
        entries.push(entry);
      }
      if (!page.hasMore) break;
    }

    const digest = assembleDigest({
      entries,
      window,
      filters: {
        operation: operation ?? null,
        status: status ?? null,
        source: source ?? null,
        path_glob: path_glob ?? null,
      },
      unreached: Math.max(0, total - entries.length),
      generatedAt: now.toISOString(),
    });

    return {
      content: [
        {
          type: "text",
          text:
            response_format === "json"
              ? JSON.stringify(digest, null, 2)
              : digestMarkdown(digest),
        },
      ],
      // Both formats carry it: the numbers a caller parses out of the JSON are
      // the numbers the markdown shows, so the two halves of the contract
      // cannot drift apart.
      structuredContent: digest as unknown as Record<string, unknown>,
    };
  } catch (error) {
    return createErrorResponse(error);
  }
}

function windowLabel(window: DigestWindow): string {
  if (window.start === null) {
    return "all recorded history";
  }
  if (window.start_kind === "relative") {
    return `${window.start} → ${window.end} (last ${window.relative})`;
  }
  return `${window.start} → ${window.end}`;
}

const ROW_HEADER = [
  "| Passes | Files moved | Files skipped | Partial | Failed |",
  "| -----: | ----------: | ------------: | ------: | -----: |",
];

function rowLine(label: string, row: DigestRow): string {
  return `| ${label} | ${row.passes} | ${row.files_processed} | ${row.files_skipped} | ${row.partial} | ${row.failed} |`;
}

function digestMarkdown(digest: OrganizerDigest): string {
  const lines: string[] = ["### Organizer Digest", ""];

  lines.push(`**Window:** ${windowLabel(digest.window)}`);
  lines.push(`**Generated:** ${digest.generated_at}`);

  const active = Object.entries(digest.filters).filter(
    ([, value]) => value !== null,
  );
  if (active.length > 0) {
    lines.push(
      `**Filters:** ${active.map(([name, value]) => `${name}=${String(value)}`).join(", ")}`,
    );
  }
  lines.push("");

  if (digest.totals.passes === 0) {
    lines.push(
      "No passes fell inside this window, so every count below is zero.",
      "",
    );
  }

  const totals = digest.totals;
  lines.push(
    "#### Totals",
    "",
    `${totals.passes} pass(es), ${totals.files_processed} file(s) moved, ${totals.files_skipped} skipped, ${totals.duration_readable} of work.`,
    "",
    `${totals.successful} finished clean, ${totals.partial} partial, ${totals.failed} failed. ${totals.passes_with_manifest} wrote a manifest that can be undone.`,
    "",
  );

  lines.push(
    "#### By directory",
    "",
    digest.by_directory.length === 0
      ? "No directory was recorded in this window."
      : [
          ...ROW_HEADER,
          ...digest.by_directory.map((row) => rowLine(row.directory, row)),
        ].join("\n"),
    "",
  );

  lines.push(
    "#### By operation",
    "",
    digest.by_operation.length === 0
      ? "No operation ran in this window."
      : [
          ...ROW_HEADER,
          ...digest.by_operation.map((row) => rowLine(row.operation, row)),
        ].join("\n"),
    "",
  );

  // Its own section, not a count inside the totals. A partial pass is the
  // thing most worth a human's eyes, and a number folded into a total is not.
  if (digest.failures.length > 0) {
    lines.push(
      "#### Needs attention",
      "",
      `${digest.failures.length} pass(es) did not finish clean:`,
      "",
    );
    for (const failure of digest.failures) {
      const manifest =
        failure.manifest_id === null
          ? "no manifest, so this pass cannot be undone on its own"
          : `undo: \`${failure.manifest_id}\``;
      lines.push(
        `- **${failure.operation}** (${failure.timestamp}, ${failure.source}) — ${failure.status}; ${manifest}`,
      );
      if (failure.detail !== null) lines.push(`  - ${failure.detail}`);
      if (failure.error !== null) lines.push(`  - Error: ${failure.error}`);
    }
    lines.push("");
  }

  if (digest.undo_manifests.length > 0) {
    lines.push(
      "#### Undo handles",
      "",
      digest.undo_manifests.map((id) => `- \`${id}\``).join("\n"),
      "",
      "Pass an id to `file_organizer_undo_last_operation` to undo that specific run rather than whatever ran last.",
      "",
    );
  }

  if (digest.limits.length > 0) {
    lines.push("#### What this digest does not cover", "");
    for (const limit of digest.limits) lines.push(`- ${limit}`);
    lines.push("");
  }

  return lines.join("\n");
}
