#!/usr/bin/env node
// Remove git worktrees whose PR is merged.
//
// Why: a fan-out of N agents creates N worktrees. Nothing removes them on merge,
// so they pile up. After one 24-PR batch, 8 of 14 worktrees were dead weight on
// already-merged PRs.
//
// Safety, because this deletes directories:
//   - dry run unless --force
//   - never a worktree with uncommitted changes
//   - never a branch whose PR is OPEN
//   - never a branch with no PR at all (unknown is not "merged")
//   - never the default branch, and never the directory you are standing in
//   - PR state comes from `gh`, not git. `git rev-list origin/main..HEAD` is WRONG
//     here: squash merges leave branch commits un-ancestored, so a merged PR's branch
//     looks unmerged and a live branch can look exactly like a dead one.
//
// Usage: node scripts/gc-worktrees.mjs [--force]

import { execFileSync } from 'node:child_process'
import path from 'node:path'

const FORCE = process.argv.includes('--force')
const cwd = process.cwd()

function git(args, dir = cwd) {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim()
}

// The default branch name, or null when origin/HEAD is not set. Deliberately no
// fallback guess: a renamed default would otherwise be indistinguishable from an
// ordinary merged branch, and skipReason refuses to remove anything while this
// is unknown.
function defaultBranch() {
  try {
    return git(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']).replace(/^origin\//, '')
  } catch {
    return null
  }
}

// Why this worktree must be kept, or null when it is safe to remove.
function skipReason(wt) {
  // The repo's primary checkout is not always the default branch (someone may have
  // switched it to a feature branch), and "no PR found" would not save it. Never
  // delete the checkout git lists first.
  if (wt.path === primary) return 'primary checkout'
  if (cwd === wt.path || cwd.startsWith(wt.path + path.sep)) return 'contains your working directory'
  if (wt.detached || !wt.branch) return 'detached HEAD, cannot attribute it to a branch'
  // Guessing the default branch would let a renamed default look like an ordinary
  // merged branch. Refuse everything instead.
  if (MAIN === null) return 'default branch unknown, refusing to remove it'
  if (wt.branch === MAIN) return `default branch (${MAIN})`

  const dirty = git(['status', '--porcelain'], wt.path)
  if (dirty) return `${dirty.split('\n').length} uncommitted change(s)`

  const state = prState(wt.branch)
  if (state === 'OPEN') return 'PR still open'
  if (state !== 'MERGED') return 'no PR found, refusing to assume it is safe'
  return null
}

function prState(branch) {
  // 'MERGED' | 'OPEN' | null when unknown. Anything unexpected means do not touch.
  try {
    const out = execFileSync(
      'gh',
      ['pr', 'list', '--head', branch, '--state', 'all', '--json', 'state', '--limit', '1'],
      { encoding: 'utf8' }
    )
    const list = JSON.parse(out || '[]')
    return list.length === 0 ? null : String(list[0].state).toUpperCase()
  } catch {
    return null
  }
}

function listWorktrees() {
  const out = git(['worktree', 'list', '--porcelain'])
  const worktrees = []
  let current = null
  for (const line of out.split('\n')) {
    if (line.startsWith('worktree ')) {
      current = { path: path.resolve(line.slice('worktree '.length).trim()) }
      worktrees.push(current)
    } else if (line.startsWith('branch ') && current) {
      current.branch = line.slice('branch '.length).trim().replace(/^refs\/heads\//, '')
    } else if (line === 'detached' && current) {
      current.detached = true
    }
  }
  return worktrees
}

const MAIN = defaultBranch()
const primary = listWorktrees()[0].path
const doomed = []
const kept = []

for (const wt of listWorktrees()) {
  const name = wt.branch ?? '(detached HEAD)'

  const reason = skipReason(wt)
  if (reason !== null) {
    kept.push({ name, path: wt.path, why: reason })
  } else {
    doomed.push({ ...wt, name })
  }
}

for (const k of kept) console.log(`  keep  ${k.name}\n          ${k.why}`)

if (doomed.length === 0) {
  console.log('\nNothing to remove.')
  process.exit(0)
}

console.log(`\n${doomed.length} removable, all on MERGED PRs:`)
for (const d of doomed) console.log(`  rm    ${d.name}\n          ${d.path}`)

if (!FORCE) {
  console.log('\nDry run. Re-run with --force to remove them.')
  process.exit(0)
}

// One locked or dirty worktree must not stop the rest, so failures collect and
// the exit code reports them at the end.
const failed = []
for (const d of doomed) {
  try {
    git(['worktree', 'remove', d.path])
  } catch (err) {
    failed.push(`${d.name}: ${err.stderr?.trim() ?? err.message}`)
    console.log(`  FAIL  ${d.name}`)
    continue
  }
  try {
    // -d not -D on purpose. Under squash merges the branch is never an ancestor of
    // HEAD, so this usually refuses and the branch is kept. That is the safe
    // outcome, not a failure.
    git(['branch', '-d', d.branch])
  } catch {
    console.log(`  note: kept branch ${d.branch}, not fully merged locally`)
  }
  console.log(`  removed ${d.name}`)
}

git(['worktree', 'prune'])

if (failed.length > 0) {
  console.error(`\n${failed.length} worktree(s) could not be removed:`)
  for (const f of failed) console.error(`  ${f}`)
  process.exit(1)
}

console.log('\nDone.')