/**
 * Organization plan validation.
 *
 * A dry-run check over the plan `organize` would execute, built from the same
 * `generateOrganizationPlan` output. Read-only: it stats paths and reads the
 * plan, and never writes, moves, or opens a file for reading.
 *
 * The point of the tool is a verdict an agent can act on, so every finding
 * states what was checked. `checked` and `not_checked` are part of the result:
 * a clean run must not read as a guarantee.
 */

import fs from "fs/promises";
import path from "path";
import type {
  OrganizationPlan,
  PlanFinding,
  PlanValidationResult,
} from "../types/organize.js";
import { isSensitiveFile } from "../io/sensitive-files.js";
import { isErrnoException } from "../../utils/error-handler.js";

/**
 * What this check looks at. Kept next to the result so a caller that only
 * reads the numbers still sees the scope.
 */
const CHECKED: readonly string[] = [
  "Two or more sources resolving to the same destination name, before the plan renames them apart.",
  "Whether each planned destination already exists on disk.",
  "Whether each move crosses a device boundary, comparing fs.stat device ids.",
  "Whether the sensitive-file gate (src/core/io/sensitive-files.ts) matches each source.",
];

function notChecked(plan: OrganizationPlan): string[] {
  const notes = [
    "Runtime conditions: permissions, free space, write access, and races that happen after this check.",
    "Whether the category assigned to a file is the right one.",
    "Case-insensitive filesystems (macOS, Windows): destinations differing only in case are counted as distinct.",
  ];
  if (plan.skippedFiles.length > 0) {
    notes.push(
      `${plan.skippedFiles.length} file(s) the planner skipped are not validated.`,
    );
  }
  return notes;
}

/**
 * Device id of the closest existing directory at or above `target`.
 * Destinations do not exist yet, so the nearest existing ancestor is the only
 * thing that can be compared with the source.
 */
async function deviceOfNearestExistingDir(
  target: string,
): Promise<number | null> {
  let current = path.resolve(target);
  for (;;) {
    try {
      const stats = await fs.stat(current);
      return stats.isDirectory() ? stats.dev : null;
    } catch (error) {
      const code = isErrnoException(error) ? error.code : undefined;
      if (code !== "ENOENT" && code !== "ENOTDIR") return null;
      const parent = path.dirname(current);
      if (parent === current) return null;
      current = parent;
    }
  }
}

/**
 * True only when the path is positively observed. A stat that fails for any
 * reason — missing, or a parent this process cannot stat — is not reported as
 * an existing destination.
 */
async function existsOnDisk(target: string): Promise<boolean> {
  try {
    await fs.stat(target);
    return true;
  } catch {
    return false;
  }
}

async function deviceOfFile(target: string): Promise<number | null> {
  try {
    return (await fs.stat(target)).dev;
  } catch {
    return null;
  }
}

/**
 * Destination a move would claim before the plan renames it. The planner only
 * ever rewrites the basename (the category folder and metadata subpath are
 * already resolved into `move.destination`), so this reconstruction is exact
 * rather than a guess.
 */
function nominalDestination(move: OrganizationPlan["moves"][number]): string {
  return path.join(path.dirname(move.destination), path.basename(move.source));
}

/**
 * Validate an organization plan. See `CHECKED` / `not_checked` for scope.
 */
export async function validateOrganizationPlan(
  directory: string,
  plan: OrganizationPlan,
): Promise<PlanValidationResult> {
  const findings: PlanFinding[] = [];

  for (const warning of plan.warnings) {
    findings.push({
      kind: "incomplete_plan",
      severity: "error",
      sources: [],
      destinations: [],
      detail: warning,
    });
  }

  // Sources claiming one destination name, keyed on the pre-rename destination.
  const claimants = new Map<string, OrganizationPlan["moves"]>();
  for (const move of plan.moves) {
    const key = path.resolve(nominalDestination(move));
    const group = claimants.get(key);
    if (group) {
      group.push(move);
    } else {
      claimants.set(key, [move]);
    }
  }

  for (const group of claimants.values()) {
    if (group.length < 2) continue;
    const destinations = group.map((m) => m.destination);
    const distinct = new Set(destinations).size;
    findings.push({
      kind: "destination_name_collision",
      severity: distinct === destinations.length ? "warning" : "error",
      sources: group.map((m) => m.source),
      destinations,
      detail:
        distinct === destinations.length
          ? `${group.length} sources claim one destination name; the plan separates them into ${distinct} destinations.`
          : `${group.length} sources claim one destination name and the plan leaves ${distinct} of them on the same path. Depending on the conflict strategy those files are skipped or the last one written wins.`,
    });
  }

  // One stat per distinct planned destination, and one device lookup per
  // destination folder — a plan usually has far fewer of each than moves.
  const existsCache = new Map<string, boolean>();
  const deviceCache = new Map<string, number | null>();

  for (const move of plan.moves) {
    const destination = move.destination;

    let exists = existsCache.get(destination);
    if (exists === undefined) {
      exists = await existsOnDisk(destination);
      existsCache.set(destination, exists);
    }
    if (exists) {
      findings.push({
        kind: "destination_exists",
        severity: "warning",
        sources: [move.source],
        destinations: [destination],
        detail:
          "Destination already exists on disk. The planner does not read the disk for conflicts, so this is resolved at execution time.",
      });
    }

    const folder = path.dirname(destination);
    let destDevice = deviceCache.get(folder);
    if (destDevice === undefined) {
      destDevice = await deviceOfNearestExistingDir(folder);
      deviceCache.set(folder, destDevice);
    }
    if (destDevice !== null) {
      const sourceDevice = await deviceOfFile(move.source);
      if (sourceDevice !== null && sourceDevice !== destDevice) {
        findings.push({
          kind: "cross_device_move",
          severity: "warning",
          sources: [move.source],
          destinations: [destination],
          detail: `Source and destination are on different devices (${sourceDevice} -> ${destDevice}). Organize copies then deletes the source for this move, so an interrupted run can leave a partial copy.`,
        });
      }
    }

    if (isSensitiveFile(move.source)) {
      findings.push({
        kind: "sensitive_source",
        severity: "warning",
        sources: [move.source],
        destinations: [destination],
        detail:
          "The sensitive-file gate matches this path. Organizing does not read content, so the move would still run, but tools that inspect or read this file refuse it.",
      });
    }
  }

  const errors = findings.filter((f) => f.severity === "error").length;

  return {
    directory,
    ok: errors === 0,
    moves_checked: plan.moves.length,
    counts: { error: errors, warning: findings.length - errors },
    findings,
    checked: [...CHECKED],
    not_checked: notChecked(plan),
  };
}
