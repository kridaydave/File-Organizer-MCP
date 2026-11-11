/**
 * export_report Tool — one call, one durable health report
 *
 * @module tools/export-report
 *
 * Every number here is already computed elsewhere: the scanner has the file
 * list, `summarizeDiskUsage` has the category breakdown, `findDuplicates` has
 * the groups. This tool assembles those into a document and, when asked, writes
 * it. It walks the directory exactly ONCE and feeds that one result to all
 * three consumers, so the totals, the breakdown and the top files can never
 * describe different moments in time.
 *
 * `output_path` being optional is the design decision that matters. There is no
 * dry-run flag because there is nothing to guard: omit the path and the only
 * thing this tool does is read. There is no code path where "preview" is a flag
 * someone can forget to pass.
 */

import fs from "fs";
import type {
  DuplicateGroup,
  FileWithSize,
  ToolDefinition,
  ToolResponse,
} from "../types.js";
import { validateStrictPath } from "../services/path-validator.service.js";
import { FileScannerService } from "../core/scan/scanner.js";
import { summarizeDiskUsage } from "../core/scan/disk-usage.js";
import { HashCalculatorService } from "../core/hash/hasher.js";
import { CategorizerService } from "../services/categorizer.service.js";
import { createErrorResponse, sanitizeErrorMessage } from "../utils/error-handler.js";
import { formatBytes } from "../utils/formatters.js";
import { createRequestContext, type ToolContext } from "../mcp/context.js";
import { ExportReportInputSchema } from "../schemas/system.js";
import { exportReportOutputJsonSchema } from "../schemas/output.js";

export { ExportReportInputSchema } from "../schemas/system.js";

export const exportReportToolDefinition: ToolDefinition = {
  name: "file_organizer_export_report",
  title: "Export Directory Health Report",
  description:
    "Write a health report for a directory: total files and bytes, the space each category holds, duplicate groups with the space they waste, and the largest files. One directory walk feeds all four sections, so they cannot disagree with each other. Without output_path the report comes back in the response and nothing is written, which is why there is no dry-run flag. With output_path the report is written exclusively and never replaces an existing file. Read-only otherwise: it inspects, it never moves or deletes.",
  inputSchema: {
    type: "object",
    properties: {
      directory: {
        type: "string",
        description: "Full path to the directory to report on",
      },
      include_subdirs: {
        type: "boolean",
        description: "Recurse into subdirectories",
        default: true,
      },
      top_n: {
        type: "number",
        description: "How many of the largest files to report (1-100)",
        default: 10,
      },
      duplicate_limit: {
        type: "number",
        description:
          "How many duplicate groups to list (0-1000). Totals always cover every group found.",
        default: 10,
      },
      output_path: {
        type: "string",
        description:
          "Where to write the report. Must pass path validation. The write refuses to overwrite an existing file. Omit to receive the report in the response instead of writing one.",
      },
      response_format: {
        type: "string",
        enum: ["json", "markdown"],
        default: "markdown",
      },
    },
    required: ["directory"],
  },
  outputSchema: exportReportOutputJsonSchema,
  annotations: {
    // Writes the report file when output_path is given, so it is not read-only.
    readOnlyHint: false,
    // It never deletes or overwrites: the exclusive write fails when the chosen
    // path already holds a file.
    destructiveHint: false,
    // Re-running against the same output_path fails on the existing file, and
    // two runs over an unchanged directory still differ in generated_at, so a
    // repeat is not a no-op that converges.
    idempotentHint: false,
    openWorldHint: false,
  },
};

/** One group as the report carries it: paths only, no per-file metadata. */
interface ReportDuplicateGroup {
  hash: string;
  count: number;
  size: string;
  size_bytes: number;
  files: string[];
}

interface HealthReport {
  directory: string;
  include_subdirs: boolean;
  generated_at: string;
  output_path: string | null;
  written: boolean;
  /** Set on the response only; a file cannot report its own size before it exists. */
  bytes_written?: number;
  scan: {
    total_files: number;
    total_size: number;
    total_size_readable: string;
  };
  categories: ReturnType<typeof summarizeDiskUsage>["categories"];
  duplicates: {
    total_groups: number;
    total_files: number;
    wasted_space: number;
    wasted_space_readable: string;
    groups_listed: number;
    groups: ReportDuplicateGroup[];
    skipped_count: number;
    skipped_bytes: number;
  };
  top_files: Array<{
    name: string;
    path: string;
    size: number;
    size_readable: string;
  }>;
  limits: string[];
}

/**
 * Bytes a duplicate group wastes: every copy after the first.
 *
 * Computed from `size_bytes` on the group rather than by looking a file up by
 * name, because two files in one group can share a name and a name lookup would
 * then pick whichever the walk happened to see first.
 */
function wastedBytes(group: DuplicateGroup): number {
  return group.size_bytes * (group.count - 1);
}

function toReportGroup(group: DuplicateGroup): ReportDuplicateGroup {
  return {
    hash: group.hash,
    count: group.count,
    size: group.size,
    size_bytes: group.size_bytes,
    files: group.files.map((file) => file.path),
  };
}

/**
 * Assemble the report from one directory walk. Pure: no fs, no config, no clock
 * beyond the timestamp the caller passes in.
 */
function assembleReport(input: {
  directory: string;
  includeSubdirs: boolean;
  files: readonly FileWithSize[];
  categorize: (name: string) => string;
  groups: readonly DuplicateGroup[];
  skippedCount: number;
  skippedBytes: number;
  topN: number;
  duplicateLimit: number;
  generatedAt: string;
}): HealthReport {
  const usage = summarizeDiskUsage(input.files, input.categorize);

  const topFiles = [...input.files]
    .sort((a, b) => b.size - a.size)
    .slice(0, input.topN)
    .map((file) => ({
      name: file.name,
      path: file.path,
      size: file.size,
      size_readable: formatBytes(file.size),
    }));

  // Totals over EVERY group, so truncating the list never changes the headline
  // numbers. A report claiming "12 groups, 3.1 GB wasted" and then listing two
  // of them is misleading in the direction that matters.
  const wasted = input.groups.reduce((sum, g) => sum + wastedBytes(g), 0);
  const listed = input.groups.slice(0, input.duplicateLimit);

  // Every caveat that would make the numbers above read as more complete than
  // they are. A health report that quietly omits its own blind spots is worse
  // than no report, because it gets filed and believed.
  const limits: string[] = [];
  if (input.duplicateLimit > 0 && input.groups.length > input.duplicateLimit) {
    limits.push(
      `${input.groups.length - input.duplicateLimit} of ${input.groups.length} duplicate groups are not listed. Raise duplicate_limit to see them; the totals above already count every group.`,
    );
  }
  if (input.duplicateLimit === 0 && input.groups.length > 0) {
    limits.push(
      `duplicate_limit is 0, so no groups are listed. ${input.groups.length} group(s) were found and the totals above count them.`,
    );
  }
  if (input.files.length > topFiles.length) {
    limits.push(
      `Only the ${topFiles.length} largest of ${input.files.length} file(s) are listed. Raise top_n for more.`,
    );
  }
  if (input.skippedCount > 0) {
    limits.push(
      `${input.skippedCount} file(s) (${formatBytes(input.skippedBytes)}) were not compared for duplicates, so the duplicate totals are a lower bound.`,
    );
  }
  if (!input.includeSubdirs) {
    limits.push(
      "include_subdirs is false, so everything below this directory was not counted.",
    );
  }

  return {
    directory: input.directory,
    include_subdirs: input.includeSubdirs,
    generated_at: input.generatedAt,
    output_path: null,
    written: false,
    scan: {
      total_files: usage.total_files,
      total_size: usage.total_size,
      total_size_readable: usage.total_size_readable,
    },
    categories: usage.categories,
    duplicates: {
      total_groups: input.groups.length,
      total_files: input.groups.reduce((sum, g) => sum + g.count, 0),
      wasted_space: wasted,
      wasted_space_readable: formatBytes(wasted),
      groups_listed: listed.length,
      groups: listed.map(toReportGroup),
      skipped_count: input.skippedCount,
      skipped_bytes: input.skippedBytes,
    },
    top_files: topFiles,
    limits,
  };
}

/**
 * Serialize the report for disk. What lands in the file is the report itself,
 * not a wrapper around it, so a reader can parse one object and get the numbers.
 *
 * The write receipt is set on the copy that goes to disk (`output_path` and
 * `written`), because the path is known before the write and `written: false`
 * inside a file that exists would be a lie. `bytes_written` stays off the file
 * for the obvious reason: a write cannot report its own size before it happens.
 */
function serializeReport(report: HealthReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

function reportMarkdown(report: HealthReport): string {
  const lines = [
    `### Health Report for \`${report.directory}\``,
    "",
    `Generated ${report.generated_at}`,
    "",
    `**Files:** ${report.scan.total_files}`,
    `**Total size:** ${report.scan.total_size_readable}`,
    report.written
      ? `**Written:** yes (${report.bytes_written} bytes)`
      : "**Written:** no (no output_path was given, so nothing was written)",
    "",
  ];

  lines.push(
    "#### Space by category",
    "",
    report.categories.length === 0
      ? "No files found."
      : [
          "| Category | Files | Size | Share |",
          "| -------- | ----: | ---: | ----: |",
          ...report.categories.map(
            (c) =>
              `| ${c.category} | ${c.file_count} | ${c.total_size_readable} | ${c.percent_of_total}% |`,
          ),
        ].join("\n"),
    "",
  );

  const dup = report.duplicates;
  lines.push(
    "#### Duplicates",
    "",
    `**Groups:** ${dup.total_groups}`,
    `**Files in a group:** ${dup.total_files}`,
    `**Wasted space:** ${dup.wasted_space_readable}`,
    `**Listed:** ${dup.groups_listed} of ${dup.total_groups}`,
    "",
  );
  for (const group of dup.groups) {
    lines.push(
      `**${group.count} copies of ${group.size}** — ${group.hash.slice(0, 12)}`,
      ...group.files.map((file) => `- \`${file}\``),
      "",
    );
  }

  lines.push(
    "#### Largest files",
    "",
    report.top_files.length === 0
      ? "No files found."
      : report.top_files
          .map((f, i) => `${i + 1}. \`${f.path}\` - ${f.size_readable}`)
          .join("\n"),
    "",
  );

  if (report.limits.length > 0) {
    lines.push("#### What this report does not cover", "");
    for (const line of report.limits) lines.push(`- ${line}`);
    lines.push("");
  }

  return lines.join("\n");
}

export async function handleExportReport(
  args: Record<string, unknown>,
  ctx: ToolContext = createRequestContext(),
): Promise<ToolResponse> {
  try {
    const parsed = ExportReportInputSchema.safeParse(args);
    if (!parsed.success) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${parsed.error.issues.map((issue) => issue.message).join(", ")}`,
          },
        ],
        isError: true,
      };
    }

    const {
      directory,
      include_subdirs,
      top_n,
      duplicate_limit,
      output_path,
      response_format,
    } = parsed.data;

    const validatedPath = await validateStrictPath(directory);
    if (!validatedPath) {
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: sanitizeErrorMessage(`Error: Invalid or forbidden source path: ${directory}`),
          },
        ],
      };
    }

    // The one walk. Everything below reads this array.
    const scanner = new FileScannerService();
    const files = await scanner.getAllFiles(validatedPath, include_subdirs);

    // Categorizer is pure, constructed per request from config rules, so custom
    // rules classify the report exactly as they would classify an organize.
    const categorizer = new CategorizerService(ctx.config.customRules ?? []);
    const hasher = new HashCalculatorService();
    const duplicates = await hasher.findDuplicates(files);

    const report = assembleReport({
      directory: validatedPath,
      includeSubdirs: include_subdirs,
      files,
      categorize: (name) => categorizer.getCategory(name),
      groups: duplicates.groups,
      skippedCount: duplicates.skipped.length,
      skippedBytes: duplicates.skipped_bytes,
      topN: top_n,
      duplicateLimit: duplicate_limit,
      generatedAt: new Date().toISOString(),
    });

    if (output_path !== undefined) {
      // The one write in this tool goes through the full validation pipeline.
      const validated = await validateStrictPath(output_path);
      // Claim the write in the document before writing it, so the file on disk
      // is not carrying `written: false`.
      report.output_path = validated;
      report.written = true;
      const contents = serializeReport(report);
      try {
        // `wx` is what makes this non-destructive: an existing file at the
        // chosen path is never replaced, so nothing the user put there is lost.
        fs.writeFileSync(validated, contents, {
          encoding: "utf-8",
          flag: "wx",
        });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") {
          // Naming the path back would leak a directory layout, and the caller
          // supplied it anyway, so say what happened and what to do instead.
          return {
            content: [
              {
                type: "text",
                text: "Error: a file already exists at the requested output path, and this tool never overwrites one. Nothing was written. Export again with a different output_path, or remove the existing file first.",
              },
            ],
            isError: true,
          };
        }
        throw error;
      }
      // Known only now, so the response carries it and the file does not.
      report.bytes_written = Buffer.byteLength(contents, "utf-8");
    }

    return {
      content: [
        {
          type: "text",
          text:
            response_format === "json"
              ? JSON.stringify(report, null, 2)
              : reportMarkdown(report),
        },
      ],
      // The markdown path carries it too: the tool declares an outputSchema and
      // the SDK rejects a result without structuredContent.
      structuredContent: report as unknown as Record<string, unknown>,
    };
  } catch (error) {
    return createErrorResponse(error);
  }
}
