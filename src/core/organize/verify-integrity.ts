/**
 * File Organizer MCP Server v5.0.0
 * Manifest Content Verification
 *
 * A rollback manifest records what an operation intended to do. This rechecks
 * the part of that intent that can go stale on its own: whether the files are
 * still where the manifest put them, with the bytes it recorded for them.
 */

import fs from "fs/promises";
import type { RollbackAction, RollbackManifest } from "../../types.js";
import { PathValidatorService } from "../../services/path-validator.service.js";
import {
  sanitizeErrorMessage,
  isErrnoException,
} from "../../utils/error-handler.js";
import { logger } from "../../utils/logger.js";
import { HashCalculatorService } from "../hash/hasher.js";
import { manifestActionTarget } from "./manifest-integrity.js";

/**
 * What a rehash found for one file.
 *
 * `unverifiable` is deliberately distinct from `unchanged`: a manifest written
 * before content hashing existed, or one that ran out of hash budget, cannot
 * answer the question at all, and must never be reported as if it did.
 */
export type FileIntegrityStatus =
  "unchanged" | "modified" | "missing" | "unverifiable";

export interface FileIntegrityEntry {
  path: string;
  status: FileIntegrityStatus;
  /** Why the file could not be checked. Only set on `unverifiable`. */
  reason?: string;
  expected_hash?: string;
  actual_hash?: string;
}

export interface IntegrityReport {
  manifest_id: string;
  description: string;
  /** When the operation ran, from the manifest. */
  recorded_at: number;
  total_files: number;
  /** Files actually rehashed and compared against a recorded digest. */
  checked: number;
  unchanged: number;
  modified: number;
  missing: number;
  unverifiable: number;
  drift_detected: boolean;
  /** True only when every file named by the manifest was rechecked and matched. */
  verified: boolean;
  files: FileIntegrityEntry[];
}

export interface VerifyIntegrityOptions {
  /** Injectable so a caller can pin the allowed roots; defaults to the global policy. */
  pathValidator?: PathValidatorService;
}

/** Wording reused for every action whose manifest holds no digest for it. */
const NO_RECORDED_HASH =
  "No content hash was recorded for this file, so its contents cannot be compared.";

export async function verifyManifestFiles(
  manifest: RollbackManifest,
  options: VerifyIntegrityOptions = {},
): Promise<IntegrityReport> {
  const pathValidator = options.pathValidator ?? new PathValidatorService();
  const hasher = new HashCalculatorService();

  const files: FileIntegrityEntry[] = [];
  for (const action of manifest.actions) {
    files.push(await checkAction(action, pathValidator, hasher));
  }

  const count = (status: FileIntegrityStatus): number =>
    files.filter((f) => f.status === status).length;

  const unchanged = count("unchanged");
  const modified = count("modified");
  const missing = count("missing");
  const unverifiable = count("unverifiable");
  const checked = unchanged + modified + missing;

  return {
    manifest_id: manifest.id,
    description: manifest.description,
    recorded_at: manifest.timestamp,
    total_files: files.length,
    checked,
    unchanged,
    modified,
    missing,
    unverifiable,
    drift_detected: modified > 0 || missing > 0,
    // A manifest that could only be partly checked has not been verified, so
    // the flag stays false even when every file that was checked matched.
    verified:
      files.length > 0 &&
      checked === files.length &&
      modified === 0 &&
      missing === 0,
    files,
  };
}

async function checkAction(
  action: RollbackAction,
  pathValidator: PathValidatorService,
  hasher: HashCalculatorService,
): Promise<FileIntegrityEntry> {
  const target = manifestActionTarget(action);
  if (!target) {
    return {
      path: action.originalPath,
      status: "unverifiable",
      reason: "The manifest records no path this action left the file at.",
    };
  }

  if (!action.contentHash) {
    return { path: target, status: "unverifiable", reason: NO_RECORDED_HASH };
  }

  // Same rule the undo path applies: a manifest may name a directory that was
  // permitted when the operation ran, and the global whitelist decides now.
  if (!pathValidator.isPathAllowed(target)) {
    return {
      path: target,
      status: "unverifiable",
      reason: "Outside the allowed directories, so it was not read.",
    };
  }

  try {
    await fs.stat(target);
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return { path: target, status: "missing" };
    }
    return {
      path: target,
      status: "unverifiable",
      reason: sanitizeErrorMessage(error as Error),
    };
  }

  let actual;
  try {
    actual = await hasher.calculateContentIdentity(target);
  } catch (error) {
    logger.warn(
      `Integrity check could not rehash one file: ${(error as Error).message}`,
    );
    return {
      path: target,
      status: "unverifiable",
      reason: sanitizeErrorMessage(error as Error),
      expected_hash: action.contentHash,
    };
  }

  // A full digest and a sampled one are not comparable values, so a file that
  // crossed the size cap since the operation ran is unanswerable, not changed.
  if (actual.method !== action.hashMethod) {
    return {
      path: target,
      status: "unverifiable",
      reason: `Recorded as a ${action.hashMethod} hash; the file can now only be compared by ${actual.method} content.`,
      expected_hash: action.contentHash,
      actual_hash: actual.digest,
    };
  }

  if (actual.digest === action.contentHash) {
    return {
      path: target,
      status: "unchanged",
      expected_hash: action.contentHash,
      actual_hash: actual.digest,
    };
  }

  return {
    path: target,
    status: "modified",
    expected_hash: action.contentHash,
    actual_hash: actual.digest,
  };
}
