#!/usr/bin/env node
// Guards the workflow invariants that branch protection depends on but cannot
// express. Branch protection requires only `Check`, so anything `Check` does not
// ask about can fail while the merge stays green.
//
// This matters here because the `npm audit` step carried `continue-on-error`,
// which made the security gate decorative. The same drift would recur one layer
// up the moment a job is added without editing `check.needs`.
//
// Run by CI on every PR, or locally as `npm run check:ci`.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const workflow = YAML.parse(
  readFileSync(join(root, ".github/workflows/ci.yml"), "utf8"),
);

const jobs = workflow.jobs ?? {};
const gate = jobs.check;
const failures = [];

if (gate === undefined) {
  failures.push('the "check" job is missing, so nothing is gated');
} else {
  // The gate must ask about every other job. A job left out of `needs` runs on
  // its own and its failure never reaches the required status.
  const ungated = Object.keys(jobs).filter(
    (name) => name !== "check" && !(gate.needs ?? []).includes(name),
  );
  if (ungated.length > 0) {
    failures.push(`check.needs does not cover: ${ungated.join(", ")}`);
  }

  // Without always(), a failed or cancelled dependency makes `Check` disappear
  // instead of report, and a required status that never reports blocks the
  // merge rather than failing it.
  if (gate.if !== "${{ always() }}") {
    failures.push(
      `check.if must be "\${{ always() }}", found ${JSON.stringify(gate.if)}`,
    );
  }
}

// A job with no timeout sits on the runner for the six-hour maximum.
const untimed = Object.entries(jobs)
  .filter(([, job]) => job["timeout-minutes"] === undefined)
  .map(([name]) => name);
if (untimed.length > 0) {
  failures.push(`missing timeout-minutes: ${untimed.join(", ")}`);
}

// An unscoped `push` runs the whole pipeline a second time for every PR commit.
if (workflow.on?.push?.branches === undefined) {
  failures.push(
    "on.push must be scoped with branches: it currently fires for every branch push",
  );
}

if (failures.length > 0) {
  console.error("workflow invariants broken:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`workflow invariants hold across ${Object.keys(jobs).length} jobs`);
