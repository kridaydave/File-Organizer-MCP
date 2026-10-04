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

// 'main' unless origin/HEAD says otherwise. A wrong guess here would only make us
// skip a worktree, never delete the default branch, because the path and cwd checks
// catch the checkout we are standing in.
function defaultBranch() {
  try {
    return git(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']).replace(/^origin\//, '')
  } catch {
    return 'main'
  }
}

// Why this worktree must be kept, or null when it is safe to remove.
function skipReason(wt) {
  if (wt.path === cwd) return 'you are standing in it'
  if (cwd === wt.path || cwd.startsWith(wt.path + path.sep)) return 'contains your working directory'
  if (wt.detached || !wt.branch) return 'detached HEAD, cannot attribute it to a branch'
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

for (const d of doomed) {
  git(['worktree', 'remove', d.path])
  try {
    git(['branch', '-d', d.branch])
  } catch {
    console.log(`  note: kept branch ${d.branch}, not fully merged locally`)
  }
  console.log(`  removed ${d.name}`)
}

git(['worktree', 'prune'])
console.log('\nDone.')