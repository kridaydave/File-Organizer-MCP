/**
 * Config — portable export bundle
 *
 * Rules, the conflict strategy and the watch schedule travel between machines;
 * customAllowedDirectories and watchList[].directory do not. They are absolute
 * paths of the machine the bundle was made on, so a bundle copied elsewhere
 * points every root at a directory that does not exist there, and the copy also
 * hands out the exporting machine's directory layout.
 *
 * So the bundle never emits those values silently. Two modes, chosen by the
 * caller:
 *
 *   - "absolute" (no rebaseRoot): values are exported exactly as configured,
 *     every path-bearing field is listed in portability.requires_editing, and
 *     every absolute path is named in portability.non_portable_paths.
 *   - "rebased" (rebaseRoot given, normally the home directory): each path under
 *     that root is rewritten as `~/relative`, which survives a different
 *     username and home location. A value already written as `~/…` is portable
 *     as-is. Anything outside the root cannot be rebased, so it is exported
 *     verbatim and named in portability.non_portable_paths.
 *
 * Everything else in the bundle (customRules, rules, conflictStrategy,
 * autoOrganize, settings, historyLogging, allowExternalVolumes) is
 * machine-independent and needs no editing on the target.
 *
 * The bundle is an envelope around the config: `bundle.config` holds every key
 * the loader understands, so a bundle loaded back yields the source config's
 * shape. The envelope is read through ConfigBundleSchema, which keeps a
 * half-edited file from loading as something it is not.
 */

import fs from "fs";
import os from "os";
import path from "path";
import type { UserConfig } from "./loader.js";
import { KNOWN_CONFIG_KEYS } from "./effective-config.js";
import { isSubPath, expandHomePath } from "../../utils/file-utils.js";
import { ValidationError } from "../../types.js";
import { ConfigBundleSchema } from "../../schemas/system.js";

/** Bumped when the bundle document shape changes incompatibly. */
export const CONFIG_BUNDLE_FORMAT = 1;

export const CONFIG_BUNDLE_PRODUCER = "file_organizer_export_config";

/** Why a single path could not be made portable. */
export type NonPortableReason = "outside_rebase_root";

export interface NonPortablePath {
  /** Where in `config` the value lives, e.g. `watchList[0].directory`. */
  field: string;
  value: string;
  reason: NonPortableReason;
}

export interface BundlePortability {
  mode: "absolute" | "rebased";
  rebase_root: string | null;
  /** Fields a user must edit by hand before the bundle is useful elsewhere. */
  requires_editing: string[];
  non_portable_paths: NonPortablePath[];
  notes: string[];
}

/**
 * The on-disk bundle document. `config` is the exported config subset;
 * loadConfigBundle() casts the parsed `config` record to UserConfig, and the
 * export round-trip test pins that cast against a real config file.
 */
export interface ConfigBundleDocument {
  format_version: number;
  exported_by: string;
  exported_at: string;
  config: UserConfig;
  portability: BundlePortability;
}

export interface BuildBundleOptions {
  /**
   * Directory on this machine that the target machine's home directory is
   * expected to occupy. Paths under it are exported as `~/relative`.
   */
  rebaseRoot?: string | null;
  /** Injectable clock so the exported document stays deterministic in tests. */
  now?: Date;
}

const ALLOWED_DIRS_FIELD = "customAllowedDirectories";
const WATCH_DIRECTORY_FIELD = "watchList[].directory";

/** Config keys the bundle carries. Pinned to UserConfig, like the loader's. */
function exportableConfig(config: UserConfig): UserConfig {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (KNOWN_CONFIG_KEYS.has(key)) result[key] = value;
  }
  return result as UserConfig;
}

/**
 * Rewrite one path so it survives a different home directory.
 *
 * `~/…` is already home-relative and needs nothing. Otherwise the path must sit
 * under rebaseRoot; anything else (an external volume, a system path) has no
 * portable spelling and is reported instead of guessed at.
 */
function rebasePath(
  value: string,
  rebaseRoot: string | null,
): { value: string; portable: boolean } {
  // Only the forms expandHomePath — which the config loader runs on this value —
  // actually expands. `~bob/docs` is left alone by it and resolves against the
  // working directory, so calling that portable would hand the target a path
  // that means nothing there.
  if (value === "~" || value.startsWith("~/") || value.startsWith("~\\")) {
    // Spelling it with a tilde is not enough: `~/../..` leaves the home
    // directory the moment the loader expands it, so the target would resolve it
    // somewhere this bundle never pointed at.
    return { value, portable: isSubPath(os.homedir(), expandHomePath(value)) };
  }
  if (rebaseRoot === null) return { value, portable: false };

  if (!isSubPath(rebaseRoot, value)) return { value, portable: false };

  const relative = path.relative(path.resolve(rebaseRoot), path.resolve(value));
  if (relative === "") return { value: "~", portable: true };
  // The rewrite has to land under the root, not merely start there. isSubPath
  // can accept a path that path.relative then walks out of — a Windows 8.3
  // short name resolves differently from its long form — and `~/../x` is no
  // more portable than the absolute path it replaced.
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return { value, portable: false };
  }
  return { value: `~/${relative.split(path.sep).join("/")}`, portable: true };
}

function hasEntries(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

export function buildConfigBundle(
  config: UserConfig,
  options: BuildBundleOptions = {},
): ConfigBundleDocument {
  const rebaseRoot =
    options.rebaseRoot === undefined || options.rebaseRoot === null
      ? null
      : path.resolve(expandHomePath(options.rebaseRoot));
  const source = exportableConfig(config);
  const nonPortablePaths: NonPortablePath[] = [];
  const rebasedDirs: string[] = [];
  const rebasedWatches: string[] = [];

  if (Array.isArray(source.customAllowedDirectories)) {
    source.customAllowedDirectories = source.customAllowedDirectories.map(
      (dir, index) => {
        const rebased = rebasePath(dir, rebaseRoot);
        if (rebased.portable) rebasedDirs.push(dir);
        else {
          nonPortablePaths.push({
            field: `${ALLOWED_DIRS_FIELD}[${index}]`,
            value: dir,
            reason: "outside_rebase_root",
          });
        }
        return rebased.value;
      },
    );
  }

  if (Array.isArray(source.watchList)) {
    source.watchList = source.watchList.map((watch, index) => {
      const rebased = rebasePath(watch.directory, rebaseRoot);
      if (rebased.portable) rebasedWatches.push(watch.directory);
      else {
        nonPortablePaths.push({
          field: `watchList[${index}].directory`,
          value: watch.directory,
          reason: "outside_rebase_root",
        });
      }
      return { ...watch, directory: rebased.value };
    });
  }

  const pathFields: string[] = [];
  if (hasEntries(source.customAllowedDirectories)) {
    pathFields.push(ALLOWED_DIRS_FIELD);
  }
  if (hasEntries(source.watchList)) pathFields.push(WATCH_DIRECTORY_FIELD);

  const mode: BundlePortability["mode"] =
    rebaseRoot === null ? "absolute" : "rebased";
  const notes: string[] = [];
  let requiresEditing: string[];

  if (mode === "absolute") {
    requiresEditing = [...pathFields];
    if (pathFields.length > 0) {
      notes.push(
        `${pathFields.join(" and ")} hold absolute paths from the machine that produced this bundle. They will not exist elsewhere: edit them, or export again with a rebase root to emit ~-relative paths instead.`,
      );
    }
    for (const entry of nonPortablePaths) {
      notes.push(`${entry.field} was exported unchanged and must be edited.`);
    }
  } else {
    const edited = new Set(
      nonPortablePaths.map((entry) =>
        entry.field.startsWith("watchList")
          ? WATCH_DIRECTORY_FIELD
          : ALLOWED_DIRS_FIELD,
      ),
    );
    requiresEditing = [...edited];
    notes.push(
      `Paths under the rebase root were rewritten as ~-relative, so they follow the target machine's home directory. ${rebasedDirs.length} custom allowed director${rebasedDirs.length === 1 ? "y" : "ies"} and ${rebasedWatches.length} watch entr${rebasedWatches.length === 1 ? "y" : "ies"} travelled in that form.`,
    );
    for (const entry of nonPortablePaths) {
      notes.push(
        `${entry.field} is outside the rebase root and was exported unchanged — point it at the target machine's directory by hand.`,
      );
    }
  }

  if (pathFields.length === 0) {
    notes.push(
      "This config names no directories, so it loads unchanged on any machine.",
    );
  }

  return {
    format_version: CONFIG_BUNDLE_FORMAT,
    exported_by: CONFIG_BUNDLE_PRODUCER,
    exported_at: (options.now ?? new Date()).toISOString(),
    config: source,
    portability: {
      mode,
      rebase_root: rebaseRoot,
      requires_editing: requiresEditing,
      non_portable_paths: nonPortablePaths,
      notes,
    },
  };
}

export function serializeConfigBundle(bundle: ConfigBundleDocument): string {
  return `${JSON.stringify(bundle, null, 2)}\n`;
}

/**
 * Write the bundle to a path the caller already validated. The exclusive flag
 * refuses to clobber an existing file: the caller chose this path, and a
 * silent overwrite would destroy whatever was there.
 */
export function writeConfigBundleFile(
  bundle: ConfigBundleDocument,
  outputPath: string,
): number {
  const contents = serializeConfigBundle(bundle);
  fs.writeFileSync(outputPath, contents, { encoding: "utf-8", flag: "wx" });
  return Buffer.byteLength(contents, "utf-8");
}

/**
 * Read a bundle back. Throws ValidationError on anything that is not a bundle
 * of this format, so a half-edited file cannot load as a config.
 */
export function loadConfigBundle(contents: string): ConfigBundleDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new ValidationError("Bundle file does not contain valid JSON");
  }
  const result = ConfigBundleSchema.safeParse(parsed);
  if (!result.success) {
    throw new ValidationError(
      `Bundle file is not a v${CONFIG_BUNDLE_FORMAT} config bundle: ${result.error.issues.map((issue) => issue.path.join(".") || "root").join(", ")}`,
    );
  }
  return result.data as ConfigBundleDocument;
}
