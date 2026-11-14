/**
 * Security Gate: Property-Based Path Fuzzing
 *
 * Where path-traversal-fuzz.ts replays a fixed list of 1000+ payloads a human
 * enumerated, this gate generates paths no human enumerated and checks an
 * invariant instead of a blocklist:
 *
 *   1. Containment: for ANY input string, validatePath either throws or
 *      returns a path strictly inside the allowed directory.
 *   2. Traversal bias: same invariant under inputs assembled from traversal
 *      tokens, encodings, reserved names and mixed separators.
 *   3. Symlink: with symlinks disallowed, no accepted path resolves through a
 *      symlink out of the allowed directory.
 *
 * The gate fails on any invariant violation, and on a vacuous run: a run that
 * accepted nothing or rejected nothing proves nothing about the validator.
 *
 * @module scripts/security-gates/property-fuzz
 */

import fc from "fast-check";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { PathValidatorService } from "../../src/services/path-validator.service.js";
import { CONFIG } from "../../src/core/config/defaults.js";

const NUM_RUNS_CONTAINMENT = 1000;
const NUM_RUNS_SYMLINK = 500;

const SECRET_DIR_NAME = "secret-outside";
const SECRET_FILE = "secret.txt";

interface FuzzStats {
  accepted: number;
  rejected: number;
  violations: string[];
}

async function setupSandbox(): Promise<{ base: string; secretFile: string }> {
  const testRoot = await fs.mkdtemp(path.join(os.tmpdir(), "fo-property-fuzz-"));
  const base = path.join(testRoot, "allowed");
  const secretFile = path.join(testRoot, SECRET_DIR_NAME, SECRET_FILE);
  await fs.mkdir(base, { recursive: true });
  await fs.mkdir(path.dirname(secretFile), { recursive: true });
  await fs.writeFile(path.join(base, "real.txt"), "inside\n");
  await fs.writeFile(secretFile, "outside\n");
  return { base, secretFile };
}

async function teardownSandbox(base: string): Promise<void> {
  await fs.rm(path.dirname(base), { recursive: true, force: true });
}

/**
 * Containment check matching checkContainment: the allowed directory itself is
 * inside (a relative "." resolves to it), anything outside is not.
 */
function isContained(parent: string, target: string): boolean {
  const resolved = path.resolve(target);
  const parentResolved = path.resolve(parent);
  return resolved === parentResolved || resolved.startsWith(parentResolved + path.sep);
}

/**
 * Tokens a traversal attempt is assembled from. Encodings and doubled
 * separators included so normalization bugs surface as generated inputs, not
 * as remembered ones.
 */
const TRAVERSAL_TOKENS = [
  "..",
  "../",
  "..\\",
  "....//",
  "..%2f",
  "%2e%2e",
  "%2e%2e%2f",
  "..%252f",
  "CON",
  "NUL.txt",
  "~",
  "$HOME",
  "${HOME}",
  "\x00",
  "/etc/passwd",
  "C:\\Windows",
  ".",
  "real.txt",
  "sub",
];

function traversalInput(): fc.Arbitrary<{ tokens: string[]; sep: string }> {
  return fc.record({
    tokens: fc.array(fc.constantFrom(...TRAVERSAL_TOKENS), { minLength: 1, maxLength: 8 }),
    sep: fc.constantFrom("/", "\\", ""),
  });
}

function arbitraryInput(): fc.Arbitrary<string> {
  // Free-form strings hit the character-class and length layers; capping the
  // length keeps the run inside the gate's time budget.
  return fc.string({ minLength: 0, maxLength: 120, unit: "binary" });
}

async function checkContainmentInvariant(
  label: string,
  validator: PathValidatorService,
  base: string,
  input: string,
  stats: FuzzStats,
): Promise<void> {
  try {
    const resolved = await validator.validatePath(input, { requireExists: false });
    stats.accepted++;
    if (!isContained(base, resolved)) {
      stats.violations.push(
        `${label}: accepted ${JSON.stringify(input)} and resolved it to ${resolved}, outside the allowed directory`,
      );
    }
  } catch {
    stats.rejected++;
  }
}

export async function runPropertyFuzz(): Promise<number> {
  const { base, secretFile } = await setupSandbox();
  // Scoped mode: with the global whitelist on, every sandbox path is rejected
  // at layer 4.5 (the global allowlist does not know this tmpdir) and the run
  // is vacuous. Disabling it routes containment through layer 6 with the
  // scoped allow-list, which is the invariant under test. Process-local: the
  // gate runs in its own node process.
  CONFIG.security.enablePathValidation = false;
  const validator = new PathValidatorService(base, [base]);
  const stats: FuzzStats = { accepted: 0, rejected: 0, violations: [] };

  try {
    // Property 1: arbitrary strings never escape the allowed directory.
    await fc.assert(
      fc.asyncProperty(arbitraryInput(), (input) =>
        checkContainmentInvariant("arbitrary", validator, base, input, stats),
      ),
      { numRuns: NUM_RUNS_CONTAINMENT },
    );

    // Property 2: the same invariant under inputs biased to traversal shapes.
    await fc.assert(
      fc.asyncProperty(traversalInput(), ({ tokens, sep }) =>
        checkContainmentInvariant("traversal", validator, base, tokens.join(sep), stats),
      ),
      { numRuns: NUM_RUNS_CONTAINMENT },
    );

    // Property 3: with symlinks disallowed, no accepted path resolves through
    // a symlink pointing at the secret outside the allowed directory.
    await fs.symlink(path.dirname(secretFile), path.join(base, "symlink-to-secret"), "dir");
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...TRAVERSAL_TOKENS, "symlink-to-secret"),
        fc.constantFrom("/", "\\", ""),
        fc.constantFrom("secret.txt", "real.txt", ""),
        (head, sep, tail) => checkSymlinkInvariant(validator, `${head}${sep}${tail}`, base, stats),
      ),
      { numRuns: NUM_RUNS_SYMLINK },
    );

    const attempted = stats.accepted + stats.rejected;
    console.log(`Property fuzz: ${attempted} generated inputs`);
    console.log(`  accepted: ${stats.accepted}, rejected: ${stats.rejected}`);

    // A run that never accepts or never rejects proves nothing either way.
    if (stats.accepted === 0 || stats.rejected === 0) {
      console.error(`Vacuous run: accepted=${stats.accepted} rejected=${stats.rejected}`);
      return 1;
    }
    if (stats.violations.length > 0) {
      console.error(`Containment invariant violated ${stats.violations.length} time(s):`);
      for (const violation of stats.violations.slice(0, 10)) {
        console.error(`  - ${violation}`);
      }
      return 1;
    }
    console.log("  invariant holds: every accepted path stayed inside the allowed directory");
    return 0;
  } catch (error) {
    // fast-check reports a counterexample on failure; surface it verbatim.
    console.error("Property fuzz failed:", error instanceof Error ? error.message : error);
    return 1;
  } finally {
    await teardownSandbox(base);
  }
}

async function checkSymlinkInvariant(
  validator: PathValidatorService,
  input: string,
  base: string,
  stats: FuzzStats,
): Promise<void> {
  try {
    const resolved = await validator.validatePath(input, {
      requireExists: true,
      allowSymlinks: false,
    });
    stats.accepted++;
    if (!isContained(base, resolved)) {
      stats.violations.push(
        `symlink: accepted ${JSON.stringify(input)} and resolved it to ${resolved}, outside the allowed directory`,
      );
      return;
    }
    const lstat = await fs.lstat(resolved).catch(() => null);
    if (lstat?.isSymbolicLink()) {
      stats.violations.push(`symlink: accepted ${JSON.stringify(input)} which resolved to a symlink at ${resolved}`);
    }
  } catch {
    stats.rejected++;
  }
}

const invoked = process.argv[1]?.endsWith("property-fuzz.js");
if (invoked) {
  process.exit(await runPropertyFuzz());
}
