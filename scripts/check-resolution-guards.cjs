#!/usr/bin/env node
// Guards for the two conflict-resolution rules that used to be manual
// (AGENTS.md, "Merging and conflicts"):
//   rule 3 - resolving src/mcp/registry.ts must not silently delete a reg()
//            tool that existed before the resolution;
//   rule 4 - a resolution that lands doc-affecting files must pass
//            `npm run docs:check`.
//
// Modes, wired from .githooks/:
//   pre-commit   blocks. Fires on every commit, but the guards only engage
//                when a resolution is actually in progress, detected via the
//                per-operation state refs (MERGE_HEAD / SQUASH_MSG for merges,
//                CHERRY_PICK_HEAD / REVERT_HEAD for picks and reverts). An
//                ordinary commit pays one `git rev-parse` round-trip and
//                nothing else. `git commit --no-verify` bypasses.
//   post-merge   warns. `git merge` already completed, so the exit code cannot
//                un-land anything; findings are loud but informational.
//   post-rewrite warns, like post-merge. Fires after rebase and after
//                `git commit --amend`; the old..new sha pairs arrive on stdin.
//                pre-commit does NOT run during `git rebase --continue`, so a
//                rebase resolution is only observable here.
//
// reg() semantics: AGENTS.md's reference command pipes both sides through
// `comm -3` and demands an empty result, which would also block legitimate
// tool *additions* (a new tool in the PR). Only deletions block here: a name
// present before the resolution and missing after it.
//
// Cherry-pick and revert resolutions compare against HEAD, not ORIG_HEAD:
// cherry-pick does not set ORIG_HEAD, and a leftover ORIG_HEAD from an earlier
// merge/rebase would be stale. A deliberate tool removal that is picked or
// reverted across branches blocks like any other deletion; commit with
// --no-verify when that is intended.
//
// State refs are resolved with `git rev-parse --git-path`, never by joining
// ".git/..." by hand: in a linked worktree `.git` is a file and the per-
// worktree state refs live elsewhere (and --git-path already returns an
// absolute path there).

const { execSync, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REGISTRY_PATH = 'src/mcp/registry.ts';
const REG_LINE = /^\s*reg\(\s*([A-Za-z0-9_]+)/;
// Rule 4 scope: a resolution touching any of these requires the full docs:check.
const DOC_FILES = new Set(['README.md', 'ARCHITECTURE.md', 'API.md', REGISTRY_PATH]);
const DOC_PREFIX = 'docs/';

let repoRoot = '';
try {
  repoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
} catch {
  process.exit(0);
}

// Run git at the repo root so the guard works from any cwd (see 6709bd2).
function gitOk(args) {
  try {
    return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  } catch {
    return null;
  }
}

function stateRefExists(name) {
  const printed = gitOk(['rev-parse', '--git-path', name]);
  if (printed === null) return false;
  const file = printed.trim();
  return fs.existsSync(path.isAbsolute(file) ? file : path.join(repoRoot, file));
}

function revExists(rev) {
  return gitOk(['rev-parse', '--verify', '--quiet', rev]) !== null;
}

// reg() tool names recorded in the registry at some revision. spec is a
// revision ('ORIG_HEAD', 'HEAD', a sha) or '' for the staged (index) copy.
// Returns null when the file does not exist there, which skips the check.
function registryNames(spec) {
  const content = gitOk(['show', `${spec}:${REGISTRY_PATH}`]);
  if (content === null) return null;
  const names = [];
  for (const line of content.split('\n')) {
    const m = line.match(REG_LINE);
    if (m) names.push(m[1]);
  }
  return [...new Set(names)];
}

function deletedTools(beforeSpec, afterSpec) {
  const before = registryNames(beforeSpec);
  const after = registryNames(afterSpec);
  if (before === null || before.length === 0) return [];
  // A resolution that deletes registry.ts outright drops every tool at once.
  if (after === null) return before;
  const have = new Set(after);
  return before.filter((n) => !have.has(n));
}

function changedDocFiles(diffArgs) {
  const out = gitOk(['diff', ...diffArgs, '--name-only']);
  if (out === null) return [];
  return out
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((f) => DOC_FILES.has(f) || f.startsWith(DOC_PREFIX));
}

function listTools(names) {
  for (const n of names) console.error(`  - ${n}`);
}

function reportDeletedTools(flow, baseLabel, names, remediation) {
  console.error(
    `resolution guard: this ${flow} resolution removes reg() tool(s) that existed in ${baseLabel}:`,
  );
  listTools(names);
  console.error(
    'A one-sided conflict resolution can silently delete tools that merged in between',
    `(rule 3 of "Merging and conflicts" in AGENTS.md).`,
  );
  console.error(remediation);
}

function runDocsCheck(bypassHint) {
  console.error('resolution guard: resolution touched docs-affecting files; running npm run docs:check (rule 4)...');
  if (!fs.existsSync(path.join(repoRoot, 'package.json'))) {
    // No package.json means no docs:check contract (e.g. a foreign checkout
    // that only vendors the hooks). Nothing to verify; do not cry wolf.
    console.error('resolution guard: no package.json at the repo root; skipping docs:check.');
    return true;
  }
  let ok = true;
  try {
    execSync('npm run docs:check', { cwd: repoRoot, stdio: 'inherit' });
  } catch {
    ok = false;
  }
  if (!ok) {
    console.error(
      'resolution guard: npm run docs:check failed for this resolution (output above).',
    );
    console.error(bypassHint);
  }
  return ok;
}

const PRE_COMMIT_BYPASS =
  'Restore the reg() lines or fix the docs, then commit again, or, if the change is ' +
  'intentional (e.g. a deliberate tool removal), re-run the commit with --no-verify.';
const ALREADY_LANDED =
  'The merge/rebase has already completed, so this cannot block it. If the finding is ' +
  'unintended, repair the branch (e.g. git commit --amend); if it is intended, no action is needed.';

function preCommit() {
  const inMerge = stateRefExists('MERGE_HEAD') || stateRefExists('SQUASH_MSG');
  const inPick = stateRefExists('CHERRY_PICK_HEAD') || stateRefExists('REVERT_HEAD');
  if (!inMerge && !inPick) {
    console.log('No merge/cherry-pick/revert resolution in progress; skipping resolution guards.');
    return 0;
  }
  const flow = inMerge ? 'merge' : 'cherry-pick/revert';
  const useOrigHead = inMerge && revExists('ORIG_HEAD');
  const base = useOrigHead ? 'ORIG_HEAD' : 'HEAD';
  const baseLabel = useOrigHead ? 'ORIG_HEAD (the pre-merge HEAD)' : 'HEAD (before this commit)';

  const dropped = deletedTools(base, '');
  if (dropped.length > 0) {
    reportDeletedTools(flow, baseLabel, dropped, PRE_COMMIT_BYPASS);
    return 1;
  }

  if (changedDocFiles(['--cached', base]).length > 0) {
    if (!runDocsCheck(PRE_COMMIT_BYPASS)) return 1;
  }
  return 0;
}

function postMerge() {
  if (!revExists('ORIG_HEAD')) return 0;
  let failed = false;

  const dropped = deletedTools('ORIG_HEAD', 'HEAD');
  if (dropped.length > 0) {
    reportDeletedTools('merge', 'ORIG_HEAD (the pre-merge HEAD)', dropped, ALREADY_LANDED);
    failed = true;
  }

  if (changedDocFiles(['ORIG_HEAD', 'HEAD']).length > 0) {
    if (!runDocsCheck(ALREADY_LANDED)) failed = true;
  }
  return failed ? 1 : 0;
}

function postRewrite() {
  let input = '';
  try {
    input = fs.readFileSync(0, 'utf8');
  } catch {
    return 0;
  }
  const pairs = input
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split(/\s+/));
  if (pairs.length === 0) return 0;
  const oldTip = pairs[0][0];
  if (!revExists(oldTip)) return 0;

  let failed = false;
  // Two bases, because a rebase can drop a reg() tool from either side:
  //  - HEAD~<rewritten count> is the commit that was rebased ONTO. Tools that
  //    "merged in between" live here, and neither the old tip nor any of its
  //    ancestors ever had them, so only this base sees a one-sided resolution
  //    that dropped the upstream side.
  //  - the old tip itself. A one-sided resolution can also drop a tool the
  //    branch added before the rewrite, which neither the commit rebased onto
  //    nor the fork point ever had. The old tip subsumes the fork point (an
  //    ancestor of it), so it covers both in one base.
  const onto = gitOk(['rev-parse', '--verify', '--quiet', `HEAD~${pairs.length}`]);
  const bases = [onto?.trim(), oldTip.trim()].filter(Boolean);
  const dropped = new Set();
  for (const b of bases) {
    for (const n of deletedTools(b, 'HEAD')) dropped.add(n);
  }
  if (dropped.size > 0) {
    reportDeletedTools(
      'rebase',
      'the pre-rewrite history (the old tip and/or the commit rebased onto)',
      [...dropped],
      ALREADY_LANDED,
    );
    failed = true;
  }

  if (changedDocFiles([oldTip, 'HEAD']).length > 0) {
    if (!runDocsCheck(ALREADY_LANDED)) failed = true;
  }
  return failed ? 1 : 0;
}

const mode = process.argv[2];
let code;
if (mode === 'pre-commit') code = preCommit();
else if (mode === 'post-merge') code = postMerge();
else if (mode === 'post-rewrite') code = postRewrite();
else {
  console.error('usage: check-resolution-guards.cjs <pre-commit|post-merge|post-rewrite>');
  code = 2;
}
process.exit(code);
