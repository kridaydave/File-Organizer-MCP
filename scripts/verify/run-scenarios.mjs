/**
 * Declarative scenario runner: drives the real built server through the
 * sequences in scenarios/*.mjs and asserts on the responses and the disk.
 *
 * A scenario file exports `name` and `scenarios`, each scenario a list of
 * steps. A step is:
 *
 *   { name?, tool, args?, assert? }
 *
 * - `args` is an object, or a function ({ sb, bodies }) => object for steps
 *   that consume an earlier step's response body.
 * - `assert(body, result, sb)` runs after the call; throw to fail the step.
 *   Without one, the step fails when the tool reports isError.
 *
 * Each scenario runs against its own fresh sandbox. Output is one line per
 * scenario; exit 0 only when every scenario passed.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SANDBOX_ROOT, ensureSandbox, parseBody, session } from "./harness.mjs";

const SCENARIOS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "scenarios");

async function loadScenarios() {
  const files = (await fs.readdir(SCENARIOS_DIR)).filter((f) => f.endsWith(".mjs")).sort();
  const loaded = [];
  for (const file of files) {
    const mod = await import(path.join(SCENARIOS_DIR, file));
    loaded.push({ file, name: mod.name ?? file, scenarios: mod.scenarios ?? [] });
  }
  return loaded;
}

async function runStep(step, sb, bodies) {
  const args = typeof step.args === "function" ? await step.args({ sb, bodies }) : { ...(step.args ?? {}) };
  if (!args.response_format) args.response_format = "json";
  const wireName = step.tool.startsWith("file_organizer_") ? step.tool : `file_organizer_${step.tool}`;
  const result = await session(sb.root, (client) =>
    client.request("tools/call", { name: wireName, arguments: args })
  );
  const body = parseBody(result);
  const failed = result?.isError === true || /^Error\b/.test(String(result?.content?.[0]?.text ?? ""));
  if (step.name) bodies[step.name] = body;
  if (step.assert) {
    await step.assert(body, result, sb);
  } else if (failed) {
    throw new Error(`${wireName} reported isError with body: ${JSON.stringify(body).slice(0, 300)}`);
  }
}

export async function runScenarios({ filter } = {}) {
  const groups = await loadScenarios();
  let passed = 0;
  let failed = 0;

  for (const group of groups) {
    for (const [index, scenario] of group.scenarios.entries()) {
      const label = `${group.name}/${scenario.name}`;
      if (filter && !label.includes(filter)) continue;
      const sb = await ensureSandbox(path.join(SANDBOX_ROOT, `scenario-${group.name}-${index}`), { fresh: true });
      const bodies = {};
      try {
        for (const step of scenario.steps) {
          await runStep(step, sb, bodies);
        }
        passed++;
        process.stdout.write(`ok   ${label}\n`);
      } catch (error) {
        failed++;
        process.stdout.write(`FAIL ${label}: ${error.message}\n`);
      }
    }
  }

  process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
  return failed === 0 ? 0 : 1;
}

const invoked =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invoked) {
  process.exit(await runScenarios({ filter: process.argv[process.argv.indexOf("--filter") + 1] }));
}
