/**
 * Mutation gate: compare the Stryker score against the committed baseline.
 *
 * Stryker's score answers one question: if a bug were injected into the
 * mutated files, would the test suite notice? A score that drops means a
 * change landed that the tests do not actually pin down, so the gate fails.
 *
 * The baseline is a floor, not a target: raise it after eliminating survivors,
 * never to silence the gate. Run via `npm run test:mutation`, which executes
 * Stryker and then this check. The HTML report is at reports/mutation/html
 * for reading, not for gating.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const REPORT = path.join(REPO, "reports", "mutation", "mutation.json");
const BASELINE = path.join(REPO, "scripts", "mutation-baseline.json");

function fail(message) {
  process.stderr.write(`mutation gate: ${message}\n`);
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(REPORT, "utf8"));
// The json reporter ships raw mutants, not computed metrics, so the score is
// derived here with Stryker's own formula: killed + timeout over all valid
// mutants. NoCoverage counts against the score, which is the point.
let killed = 0, timeout = 0, total = 0;
for (const file of Object.values(report.files)) {
  for (const mutant of file.mutants) {
    if (mutant.status === "Ignored") continue;
    total++;
    if (mutant.status === "Killed") killed++;
    if (mutant.status === "Timeout") timeout++;
  }
}
if (total === 0) fail("Stryker report contains no mutants. Was the run completed?");
const score = ((killed + timeout) / total) * 100;

const baseline = JSON.parse(fs.readFileSync(BASELINE, "utf8"));
const floor = baseline.minScore;
if (typeof floor !== "number") fail(`baseline file ${path.relative(REPO, BASELINE)} has no minScore`);

// A survivor is not a failure by itself; a score below the floor is. Raising
// the floor requires a commit that says which survivors were killed and how.
if (score < floor) {
  fail(
    `mutation score ${score.toFixed(2)} is below the baseline floor ${floor.toFixed(2)}. ` +
      `Read reports/mutation/html/index.html: either kill the surviving mutants with tests or, ` +
      `if a mutant is equivalent, note it in the baseline commit that lowers the floor deliberately.`,
  );
}

process.stdout.write(
  `mutation gate: score ${score.toFixed(2)} >= floor ${floor.toFixed(2)} ` +
    `(${killed} killed + ${timeout} timeout of ${total} mutants)\n`,
);
