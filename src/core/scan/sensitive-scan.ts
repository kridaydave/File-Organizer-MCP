/**
 * Sensitive-metadata screen — score files for personal data they carry.
 *
 * Walks a directory, reads the metadata block of the files that can carry one,
 * and turns the EXIF tags it recognizes into a risk score plus the reasons that
 * produced it. Nothing is modified: this is a screen, not a redactor.
 *
 * Two constraints shape the code. First, only the head of each file is read —
 * EXIF lives in the APP1 segment at the front of a JPEG, so a large photo is
 * never pulled into memory whole. Second, the coverage caveat travels with the
 * result rather than living only in prose, because a caller that reads the
 * findings and not the docs must still not conclude that a zero means "safe".
 */

import fs from "fs/promises";
import path from "path";
import ExifParser from "exif-parser";
import { CONFIG, SKIP_DIRECTORIES } from "../../config.js";
import { detectImageFormat } from "../../services/metadata/image-privacy.js";
import { PathValidatorService } from "../../services/path-validator.service.js";
import { isErrnoException } from "../../utils/error-handler.js";
import { isSubPath } from "../../utils/file-utils.js";
import { logger } from "../../utils/logger.js";
import { resolveExistingAncestor } from "../../utils/path-security.js";
import type {
  SensitiveFileFinding,
  SensitiveFindingKind,
  SensitiveReason,
  SensitiveRiskLevel,
  SensitiveScanResult,
  SensitiveSkippedFile,
} from "../../types.js";

/**
 * Bytes read from the head of each candidate file. EXIF occupies a single APP1
 * segment at the start of the file; reading far past it would mean holding
 * megabytes of pixel data to answer a metadata question.
 */
export const EXIF_HEADER_BYTES = 256 * 1024;

/** Longest detected value echoed back, so one tag cannot flood the response. */
const MAX_VALUE_LENGTH = 120;

/** Extensions whose metadata block this scan can parse, and how they are named. */
const ANALYZABLE_EXTENSIONS: ReadonlySet<string> = new Set([
  ".jpg",
  ".jpeg",
  ".jpe",
  ".tif",
  ".tiff",
]);

/** Image formats whose EXIF this scan can parse. Others are reported skipped. */
const ANALYZABLE_FORMATS: ReadonlySet<string> = new Set(["jpeg", "tiff"]);

const SKIPPED_DIRS: ReadonlySet<string> = new Set(SKIP_DIRECTORIES);

/**
 * What this tool does and does not do. Repeated verbatim on every response:
 * the score is a heuristic, so a caller reading only the numbers would
 * otherwise read a zero as a clearance it never received.
 */
export const SENSITIVE_SCAN_LIMITS: readonly string[] = [
  "Heuristic detection, not redaction. This tool only reports tags it recognizes and never modifies the file.",
  "A risk score of 0 means no recognized EXIF tag was found. It does NOT mean the file is safe to share: metadata outside EXIF (PDF annotations, XMP, IPTC, embedded thumbnails), file names, and the visible image content are not analyzed.",
  `Only the first ${EXIF_HEADER_BYTES / 1024} KB of each file is read, so metadata stored past that offset is missed.`,
  "Coverage is limited to formats that carry EXIF (JPEG and TIFF). Every other file is listed under skipped with a reason.",
];

/**
 * One detection rule: a group of EXIF tags that means the same kind of harm.
 * A rule contributes its weight once no matter how many of its tags are
 * present, which is what keeps a score explainable as a list of causes.
 */
interface TagRule {
  kind: SensitiveFindingKind;
  weight: number;
  /** EXIF tag names that satisfy this rule. */
  tags: readonly string[];
  /** What the rule detected, phrased to read inside a sentence. */
  label: string;
}

/**
 * Ordered by weight so the reasons of a file read worst-first, which is the
 * order a caller triaging a folder wants them in.
 */
const TAG_RULES: readonly TagRule[] = [
  {
    kind: "owner_name",
    weight: 30,
    tags: ["OwnerName", "Artist"],
    label: "an owner or artist name",
  },
  {
    kind: "serial_number",
    weight: 25,
    tags: ["SerialNumber", "LensSerialNumber", "ImageUniqueID"],
    label: "a serial number that identifies the device",
  },
  {
    kind: "camera_device",
    weight: 15,
    tags: ["Make", "Model", "LensMake", "LensModel", "HostComputer"],
    label: "a camera or computer make and model",
  },
  {
    kind: "notes_or_comment",
    weight: 10,
    tags: ["UserComment", "ImageDescription", "DocumentName", "XPTitle"],
    label: "free-text notes or a description",
  },
  {
    kind: "copyright",
    weight: 5,
    tags: ["Copyright"],
    label: "a copyright notice",
  },
  {
    kind: "software",
    weight: 5,
    tags: ["Software", "ProcessingSoftware"],
    label: "the software that wrote the file",
  },
];

/** Points for an exact fix, the single most identifying tag pair EXIF carries. */
const GPS_COORDINATES_WEIGHT = 40;
const GPS_ALTITUDE_WEIGHT = 5;
const GPS_TIMESTAMP_WEIGHT = 5;

/** Score floor for each band. A score of 0 has no findings behind it. */
const RISK_BANDS: ReadonlyArray<{
  level: SensitiveRiskLevel;
  minScore: number;
}> = [
  { level: "high", minScore: 60 },
  { level: "medium", minScore: 25 },
  { level: "low", minScore: 1 },
];

/** Score ceiling, so a file carrying every rule stays a bounded number. */
const MAX_RISK_SCORE = 100;

/** Banded form of a score, so callers compare against a level not a cutoff. */
export function riskLevelFor(score: number): SensitiveRiskLevel {
  const band = RISK_BANDS.find((b) => score >= b.minScore);
  return band?.level ?? "none";
}

/**
 * Render a tag value for the response. Structured values (rational arrays,
 * maker blobs) are dropped rather than stringified into something that looks
 * like data but is not; the reason still names the tag.
 */
function formatTagValue(value: unknown): string | undefined {
  if (typeof value === "number") {
    return String(value);
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (collapsed.length === 0) {
    return undefined;
  }
  return collapsed.length > MAX_VALUE_LENGTH
    ? `${collapsed.slice(0, MAX_VALUE_LENGTH)}...`
    : collapsed;
}

/**
 * A tag, split into whether it exists and whether its value is readable.
 *
 * Presence and readability are separate questions. exif-parser hands back
 * rational arrays and maker blobs for some tags: those carry identifiers this
 * tool cannot print, but they are still there, so the tag still counts against
 * the file. Dropping them would report a file as clean because the value was
 * unreadable, which is exactly the wrong direction to fail.
 */
function readTag(
  tags: Record<string, unknown>,
  tag: string,
): { present: boolean; value?: string } {
  const raw: unknown = tags[tag];
  if (raw === null || raw === undefined) {
    return { present: false };
  }
  // A whitespace-only string is an EXIF slot that exists but holds nothing.
  if (typeof raw === "string" && raw.trim().length === 0) {
    return { present: false };
  }
  const value = formatTagValue(raw);
  return value === undefined ? { present: true } : { present: true, value };
}

function tagRuleReason(
  rule: TagRule,
  tags: Record<string, unknown>,
): SensitiveReason | undefined {
  const present: Array<{ tag: string; value?: string }> = [];
  for (const tag of rule.tags) {
    const tag_value = readTag(tags, tag);
    if (tag_value.present) {
      present.push({ tag, value: tag_value.value });
    }
  }
  if (present.length === 0) {
    return undefined;
  }

  const exif_tags = present.map((p) => p.tag);
  const label = exif_tags.join(", ");
  const reason: SensitiveReason = {
    kind: rule.kind,
    weight: rule.weight,
    detail: `Stores ${rule.label} in ${label}`,
    exif_tags,
  };
  // Report the first tag whose value could be rendered; an unreadable tag still
  // contributes its weight and its name.
  const firstReadable = present.find((p) => p.value !== undefined);
  return firstReadable ? { ...reason, value: firstReadable.value } : reason;
}

/**
 * Turn one file's EXIF tags into the reasons behind its score.
 *
 * exif-parser hands back already-simplified values, so GPS latitude and
 * longitude arrive as signed decimal degrees. Coordinates are only reported
 * when both are present: a lone hemisphere is a malformed tag, not a location.
 */
export function scoreExifTags(
  tags: Record<string, unknown>,
): SensitiveReason[] {
  const reasons: SensitiveReason[] = [];

  const lat = tags["GPSLatitude"];
  const lng = tags["GPSLongitude"];
  if (typeof lat === "number" && typeof lng === "number") {
    reasons.push({
      kind: "gps_coordinates",
      weight: GPS_COORDINATES_WEIGHT,
      detail: "Stores GPS coordinates, which place the photo on a map",
      exif_tags: ["GPSLatitude", "GPSLongitude"],
      value: `${lat}, ${lng}`,
    });
  }

  const altitude = readTag(tags, "GPSAltitude");
  if (altitude.present) {
    const reason: SensitiveReason = {
      kind: "gps_altitude",
      weight: GPS_ALTITUDE_WEIGHT,
      detail: "Stores GPS altitude, which narrows a location further",
      exif_tags: ["GPSAltitude"],
    };
    reasons.push(
      altitude.value === undefined
        ? reason
        : { ...reason, value: altitude.value },
    );
  }

  const gpsDate = readTag(tags, "GPSDateStamp");
  const gpsTime = readTag(tags, "GPSTimeStamp");
  if (gpsDate.present || gpsTime.present) {
    const source = gpsDate.present ? gpsDate : gpsTime;
    const stamp: SensitiveReason = {
      kind: "gps_timestamp",
      weight: GPS_TIMESTAMP_WEIGHT,
      detail: "Stores the timestamp of the GPS fix",
      exif_tags: gpsDate.present ? ["GPSDateStamp"] : ["GPSTimeStamp"],
    };
    reasons.push(
      source.value === undefined ? stamp : { ...stamp, value: source.value },
    );
  }

  for (const rule of TAG_RULES) {
    const reason = tagRuleReason(rule, tags);
    if (reason) {
      reasons.push(reason);
    }
  }

  return reasons;
}

/** Total weight of a reason list, capped at the score ceiling. */
export function riskScoreFor(reasons: SensitiveReason[]): number {
  const total = reasons.reduce((sum, reason) => sum + reason.weight, 0);
  return Math.min(total, MAX_RISK_SCORE);
}

/**
 * Score a single metadata block. Exposed so the risk logic can be tested
 * against tags without going through the filesystem.
 */
export function assessExifBuffer(
  buffer: Buffer,
): { format: string; reasons: SensitiveReason[] } | undefined {
  const format = detectAnalyzableFormat(buffer);
  if (format === undefined) {
    return undefined;
  }

  let tags: Record<string, unknown>;
  try {
    tags = extractTags(ExifParser.create(buffer).parse() as unknown);
  } catch (error) {
    // Corrupt EXIF is common in the wild and says nothing about the file's
    // safety, so it downgrades to "nothing found" rather than an error.
    logger.debug("Sensitive scan could not parse EXIF", { error });
    return { format, reasons: [] };
  }

  return { format, reasons: scoreExifTags(tags) };
}

/** exif-parser tags sit under an optional `tags` key and may be absent. */
function extractTags(parsed: unknown): Record<string, unknown> {
  if (typeof parsed !== "object" || parsed === null) {
    return {};
  }
  const container = parsed as { tags?: unknown };
  if (typeof container.tags !== "object" || container.tags === null) {
    return {};
  }
  return container.tags as Record<string, unknown>;
}

/**
 * Format of the buffer, when it is one this scan can parse. The extension is
 * not trusted: a `.jpg` holding something else is reported as skipped rather
 * than scored on tags that were never there.
 */
function detectAnalyzableFormat(buffer: Buffer): string | undefined {
  const format = detectImageFormat(buffer);
  return ANALYZABLE_FORMATS.has(format) ? format : undefined;
}

function skip(
  filePath: string,
  reason: SensitiveSkippedFile["reason"],
  detail: string,
): SensitiveSkippedFile {
  return { path: filePath, name: path.basename(filePath), reason, detail };
}

/**
 * Read the head of one candidate file, closing the two windows a plain
 * `stat` + `open` leaves open.
 *
 * The `readdir` entry that named this file is a snapshot. By the time we open
 * it, the entry can have been replaced by a symlink pointing outside the
 * scanned tree, and both `fs.stat` and `fs.open` follow that link. So:
 *
 *  1. Re-resolve the path and check it is still under the scan root — the
 *     same containment check the walker applies before descending into a
 *     directory, for the same reason. Both sides of that comparison are
 *     canonical, so a symlinked parent (`/var` → `/private/var` on macOS)
 *     does not make every file look out of bounds.
 *  2. Open through `openAndValidateFile`, the shared validator idiom: a single
 *     `O_NOFOLLOW` open with no pre-check window, then a post-open `isFile()`
 *     on the handle, a realpath containment check, and an inode/device match
 *     against the path to catch a swap after the open.
 *
 * Returns undefined when the file cannot be read safely, which the caller
 * reports as skipped rather than as a clean file.
 */
async function readHeadForScan(
  filePath: string,
  rootReal: string,
  validator: PathValidatorService,
): Promise<Buffer | undefined> {
  let childReal: string | undefined;
  try {
    const resolved = await resolveExistingAncestor(filePath);
    if (resolved.exists) childReal = resolved.resolvedPath;
  } catch {
    // Unresolvable below this point; the containment check below rejects it.
  }
  if (childReal === undefined || !isSubPath(rootReal, childReal)) {
    return undefined;
  }

  let handle: fs.FileHandle | undefined;
  try {
    // Open the canonical path, not the caller's spelling of it. The walk builds
    // paths from whatever the caller passed, which on macOS is a `/var/...`
    // prefix while the canonical root is `/private/var/...`. Comparing the two
    // directly fails containment and refuses every file. childReal and
    // rootReal are both canonical, so the comparison is spelling-independent.
    handle = await validator.openAndValidateFile(childReal);
    const stats = await handle.stat();
    if (!stats.isFile()) {
      return undefined;
    }
    const readSize = Math.min(stats.size, EXIF_HEADER_BYTES);
    if (readSize === 0) {
      return Buffer.alloc(0);
    }
    const buffer = Buffer.alloc(readSize);
    const { bytesRead } = await handle.read(buffer, 0, readSize, 0);
    return bytesRead === readSize ? buffer : buffer.subarray(0, bytesRead);
  } catch {
    // O_NOFOLLOW raises ELOOP when the entry became a link; the validator also
    // rejects containment and inode mismatches. All of them mean "not a file
    // we may read", not "a file that is clean".
    return undefined;
  } finally {
    await handle?.close().catch(() => {});
  }
}

/**
 * Read one candidate file and score it.
 *
 * A file whose extension says image but whose bytes do not is skipped rather
 * than scored: the format is the claim, the magic number is the evidence.
 */
async function assessFile(
  filePath: string,
  rootReal: string,
  validator: PathValidatorService,
): Promise<
  { finding?: SensitiveFileFinding; skipped?: SensitiveSkippedFile } | undefined
> {
  const buffer = await readHeadForScan(filePath, rootReal, validator);
  if (buffer === undefined) {
    return {
      skipped: skip(
        filePath,
        "unreadable",
        "File was replaced, moved outside the scanned directory, or could not be opened safely, so it was not read",
      ),
    };
  }

  const assessment = assessExifBuffer(buffer);
  if (assessment === undefined) {
    return {
      skipped: skip(
        filePath,
        "format_not_analyzed",
        `Extension suggests an image but the content is not JPEG or TIFF, which are the only formats carrying the EXIF this scan reads`,
      ),
    };
  }

  const risk_score = riskScoreFor(assessment.reasons);
  return {
    finding: {
      path: filePath,
      name: path.basename(filePath),
      format: assessment.format,
      risk_score,
      risk_level: riskLevelFor(risk_score),
      reasons: assessment.reasons,
    },
  };
}

export interface SensitiveScanOptions {
  /** Descend into real subdirectories. Symlinks are never followed. */
  includeSubdirs?: boolean;
}

/**
 * Screen a directory for files carrying personal metadata.
 *
 * Real subdirectories are descended into; symlinks are never followed, because
 * following one would read a file the name no longer names. Before each
 * descent the child's canonical path is re-resolved and checked against the
 * root, so a directory swapped for a link between listing and descent cannot
 * pull the walk outside the directory it was given.
 */
export async function scanForSensitiveData(
  directory: string,
  options: SensitiveScanOptions = {},
): Promise<SensitiveScanResult> {
  const { includeSubdirs = false } = options;

  const files: SensitiveFileFinding[] = [];
  const skipped: SensitiveSkippedFile[] = [];
  const visited = new Set<string>();
  let truncated = false;

  // Canonical root every descent must stay under.
  let rootReal: string;
  try {
    rootReal = (await resolveExistingAncestor(directory)).resolvedPath;
  } catch {
    rootReal = path.resolve(directory);
  }

  // Shared open-and-validate helper: O_NOFOLLOW open plus the post-open
  // containment and inode checks. One instance per scan, reused per file.
  const validator = new PathValidatorService([rootReal]);

  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > CONFIG.security.maxScanDepth) {
      truncated = true;
      return;
    }

    let realDir = dir;
    try {
      realDir = await fs.realpath(dir);
    } catch {
      // Unresolvable root is reported per-entry below; keep walking it.
    }
    if (visited.has(realDir)) return;
    visited.add(realDir);

    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (!isErrnoException(error) || error.code !== "ENOENT") {
        logger.debug(`Unreadable directory ${dir}`, { error });
      }
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isSymbolicLink()) {
        // Reading through a link would re-open a path the link can be retargeted
        // to at any moment. Report it instead of following it.
        skipped.push(
          skip(
            fullPath,
            "unreadable",
            "Symbolic link; this scan does not follow links",
          ),
        );
        continue;
      }

      if (entry.isDirectory()) {
        if (!includeSubdirs || SKIPPED_DIRS.has(entry.name)) continue;

        let childReal: string | undefined;
        try {
          const resolved = await resolveExistingAncestor(fullPath);
          if (resolved.exists) childReal = resolved.resolvedPath;
        } catch (error) {
          logger.debug(`Unresolvable subdirectory ${fullPath}`, { error });
        }
        // Not under the root any more, so the name we hold does not name what
        // it pointed at. Do not descend.
        if (childReal !== undefined && isSubPath(rootReal, childReal)) {
          await walk(fullPath, depth + 1);
        } else {
          skipped.push(
            skip(
              fullPath,
              "unreadable",
              "Subdirectory resolves outside the scanned directory, so it was not walked",
            ),
          );
        }
        continue;
      }

      if (!entry.isFile()) continue;

      const extension = path.extname(entry.name).toLowerCase();
      if (!ANALYZABLE_EXTENSIONS.has(extension)) {
        skipped.push(
          skip(
            fullPath,
            "format_not_analyzed",
            `Only JPEG and TIFF carry the EXIF this scan reads; ${extension || "this file"} does not`,
          ),
        );
        continue;
      }

      const outcome = await assessFile(fullPath, rootReal, validator);
      if (outcome?.finding) {
        files.push(outcome.finding);
      } else if (outcome?.skipped) {
        skipped.push(outcome.skipped);
      }
    }
  };

  await walk(directory, 0);

  // Worst first, then by path, so the same tree always produces the same order.
  files.sort(
    (a, b) => b.risk_score - a.risk_score || a.path.localeCompare(b.path),
  );
  skipped.sort((a, b) => a.path.localeCompare(b.path));

  return {
    directory,
    scanned_count: files.length,
    skipped_count: skipped.length,
    flagged_count: files.filter((f) => f.risk_score > 0).length,
    highest_risk_score: files.reduce(
      (max, f) => Math.max(max, f.risk_score),
      0,
    ),
    truncated,
    files,
    skipped,
    limits: [...SENSITIVE_SCAN_LIMITS],
  };
}
