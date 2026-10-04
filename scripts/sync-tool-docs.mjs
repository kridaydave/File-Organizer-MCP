#!/usr/bin/env node
/**
 * Sync the tool-derived facts in README.md and ARCHITECTURE.md with the registry.
 *
 * Why this exists: three numbers used to be maintained by hand — the count in the
 * README heading, the tool list beneath it, and the count in ARCHITECTURE.md.
 * Every PR that added a tool had to remember all three, from a base that went
 * stale the moment a sibling tool PR merged. tests/unit/docs-tool-list.test.ts
 * caught the drift, so the failure was loud, but it was still a per-PR chore
 * that made unrelated tool PRs collide.
 *
 * The registry is the only source of truth here. Run this instead of editing
 * those three places by hand:
 *
 *   npm run docs:sync     rewrite the docs to match the registry
 *   npm run docs:check    exit non-zero if they are out of sync (used in CI)
 *
 * `--check` is what CI wants; it makes no edits.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const README = path.join(ROOT, 'README.md');
const ARCHITECTURE = path.join(ROOT, 'ARCHITECTURE.md');

const BEGIN = '<!-- BEGIN GENERATED TOOL LIST -->';
const END = '<!-- END GENERATED TOOL LIST -->';

const checkOnly = process.argv.includes('--check');

/** Pull the tool names out of the built registry, which is the real source. */
async function loadToolNames() {
  const registry = await import('../dist/src/mcp/registry.js');
  if (!Array.isArray(registry.TOOLS) || registry.TOOLS.length === 0) {
    throw new Error('registry exported no TOOLS — run `npm run build` first');
  }
  return registry.TOOLS.map((t) => t.name).sort((a, b) => a.localeCompare(b));
}

function renderList(names) {
  return names.map((n) => `- \`${n}\``).join('\n');
}

/** Replace text between the markers, or report that the markers are missing. */
function replaceBlock(text, body, label) {
  const start = text.indexOf(BEGIN);
  const end = text.indexOf(END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`${label}: generated tool-list markers not found`);
  }
  return text.slice(0, start + BEGIN.length) + '\n' + body + '\n' + text.slice(end);
}

function replaceHeading(text, count, label) {
  const next = text.replace(
    /(### Full tool list\s*\()\s*\d+\s*(tools\))/,
    `$1${count} $2`,
  );
  if (next === text && !/### Full tool list\s*\(\s*\d+\s*tools\)/.test(text)) {
    throw new Error(`${label}: "### Full tool list (N tools)" heading not found`);
  }
  return next;
}

function replaceArchitecture(text, count) {
  const next = text.replace(/exposes\s+\d+\s+typed\s+tools/, `exposes ${count} typed tools`);
  if (next === text && !/exposes\s+\d+\s+typed\s+tools/.test(text)) {
    throw new Error('ARCHITECTURE.md: "exposes N typed tools" not found');
  }
  return next;
}

const names = await loadToolNames();
const count = names.length;
const body = renderList(names);

const originalReadme = await fs.readFile(README, 'utf-8');
const originalArch = await fs.readFile(ARCHITECTURE, 'utf-8');

let nextReadme = replaceBlock(originalReadme, body, 'README.md');
nextReadme = replaceHeading(nextReadme, count, 'README.md');
const nextArch = replaceArchitecture(originalArch, count);

if (checkOnly) {
  // The generator emits \n. On a checkout with autocrlf, the file on disk is
  // \r\n, so a byte comparison reports drift on Windows for a document that is
  // already correct. Compare with line endings normalised; the write path keeps
  // whatever the checkout already uses.
  const normalizeEol = (s) => s.replace(/\r\n/g, '\n');
  const drift = [];
  if (normalizeEol(nextReadme) !== normalizeEol(originalReadme)) drift.push('README.md');
  if (normalizeEol(nextArch) !== normalizeEol(originalArch)) drift.push('ARCHITECTURE.md');
  if (drift.length > 0) {
    console.error(
      `✗ Tool docs out of sync with the registry (${count} tools): ${drift.join(', ')}\n` +
        '  Run `npm run docs:sync` and commit the result.',
    );
    process.exit(1);
  }
  console.log(`✓ Tool docs in sync (${count} tools)`);
} else {
  await fs.writeFile(README, nextReadme);
  await fs.writeFile(ARCHITECTURE, nextArch);
  console.log(`✓ Synced tool docs (${count} tools)`);
}