/**
 * Resolution guards (rules 3 and 4 of "Merging and conflicts" in AGENTS.md).
 *
 * scripts/check-resolution-guards.cjs blocks commits whose merge/cherry-pick/
 * revert resolution drops a reg() tool or lands doc-affecting files without
 * docs:check passing, and warns from post-merge/post-rewrite where git can no
 * longer be blocked. These tests drive the real script against throwaway git
 * repositories so the real worktree is never touched.
 *
 * Fixture package.json files give each repo an `npm run docs:check` that
 * records its invocation in `.docs-check-ran`; that is how the tests prove
 * the docs check runs exactly when the resolution touched a doc-affecting
 * file, without depending on the real repo's docs scripts.
 */

import { describe, it, expect } from "@jest/globals";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const SCRIPT = path.join(REPO_ROOT, "scripts", "check-resolution-guards.cjs");
const MARKER = ".docs-check-ran";

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

/** Like git() but tolerates a non-zero exit (conflicted merge, cherry-pick). */
function gitMayConflict(cwd: string, args: string[]): void {
  try {
    execFileSync("git", args, { cwd, stdio: "ignore" });
  } catch {
    // expected for operations that stop on conflicts
  }
}

/**
 * docsExit 0/1 also installs a package.json whose docs:check records the run
 * in MARKER and exits with docsExit. docsExit null installs no package.json.
 */
function makeRepo(docsExit: 0 | 1 | null = null): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fo-resguard-"));
  git(dir, ["init", "-q", "-b", "main"]);
  git(dir, ["config", "user.email", "test@example.com"]);
  git(dir, ["config", "user.name", "test"]);
  git(dir, ["config", "core.hooksPath", ""]); // never inherit the dev's hooks
  if (docsExit !== null) {
    const exit = docsExit === 0 ? "" : "; process.exit(1)";
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify(
        {
          name: "fixture",
          private: true,
          scripts: {
            "docs:check": `node -e "require('fs').writeFileSync('${MARKER}','1')${exit}"`,
          },
        },
        null,
        2,
      ),
    );
  }
  return dir;
}

function writeRegistry(repo: string, names: string[]): void {
  const full = path.join(repo, "src", "mcp", "registry.ts");
  fs.mkdirSync(path.dirname(full), { recursive: true });
  const lines = names.map((n) => `  reg(${n}, handler),`).join("\n");
  fs.writeFileSync(full, `export const TOOLS = [\n${lines}\n];\n`);
}

function writeTxt(repo: string, name: string, contents: string): void {
  const full = path.join(repo, name);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, contents);
}

function runGuard(
  cwd: string,
  mode: string,
  input = "",
): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT, mode], {
      cwd,
      encoding: "utf8",
      input,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { code: 0, stdout: stdout ?? "", stderr: "" };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}

/**
 * Create a conflicted merge of registry.ts on `main` and leave the given
 * resolution staged, exactly as a developer would before `git commit`.
 */
function stageMergeResolution(
  repo: string,
  opts: {
    baseNames: string[];
    mainNames: string[];
    featNames: string[];
    resolvedNames: string[];
  },
): void {
  writeRegistry(repo, opts.baseNames);
  git(repo, ["add", "-A"]);
  git(repo, ["commit", "-qm", "base"]);
  git(repo, ["checkout", "-qb", "feat"]);
  writeRegistry(repo, opts.featNames);
  git(repo, ["commit", "-qam", "feat"]);
  git(repo, ["checkout", "-q", "main"]);
  writeRegistry(repo, opts.mainNames);
  git(repo, ["commit", "-qam", "main"]);
  gitMayConflict(repo, ["merge", "feat"]);
  writeRegistry(repo, opts.resolvedNames);
  git(repo, ["add", "-A"]);
}

async function cleanup(repo: string): Promise<void> {
  await new Promise((r) => setTimeout(r, 100));
  fs.rmSync(repo, { recursive: true, force: true });
}

describe("check-resolution-guards pre-commit", () => {
  it("skips entirely on an ordinary commit, even when a reg() tool disappears", async () => {
    const repo = makeRepo(null);
    try {
      writeRegistry(repo, ["alpha", "beta"]);
      git(repo, ["add", "-A"]);
      git(repo, ["commit", "-qm", "base"]);
      writeRegistry(repo, ["alpha"]); // deliberate edit, no resolution in progress
      git(repo, ["add", "-A"]);
      const r = runGuard(repo, "pre-commit");
      expect(r.code).toBe(0);
      expect(r.stdout).toMatch(/skipping resolution guards/);
      expect(fs.existsSync(path.join(repo, MARKER))).toBe(false);
    } finally {
      await cleanup(repo);
    }
  });

  it("blocks a merge resolution that drops an ORIG_HEAD reg() tool", async () => {
    const repo = makeRepo(null);
    try {
      stageMergeResolution(repo, {
        baseNames: ["alpha", "beta"],
        mainNames: ["alpha", "beta", "delta"], // delta merged into main
        featNames: ["alpha", "beta", "gamma"],
        resolvedNames: ["alpha", "beta"], // one-sided: delta silently gone
      });
      const r = runGuard(repo, "pre-commit");
      expect(r.code).not.toBe(0);
      expect(r.stderr).toMatch(/merge resolution removes reg\(\) tool/);
      expect(r.stderr).toMatch(/delta/);
      expect(r.stderr).toMatch(/--no-verify/);
    } finally {
      await cleanup(repo);
    }
  });

  it("allows a merge resolution that only adds a tool ORIG_HEAD did not have", async () => {
    // AGENTS.md's reference `comm -3` check would block this: gamma is unique
    // to the current side. Only deletions block.
    const repo = makeRepo(0);
    try {
      stageMergeResolution(repo, {
        baseNames: ["alpha", "beta"],
        mainNames: ["alpha", "beta", "delta"],
        featNames: ["alpha", "beta", "gamma"],
        resolvedNames: ["alpha", "beta", "delta", "gamma"], // kept both sides
      });
      const r = runGuard(repo, "pre-commit");
      expect(r.code).toBe(0);
      // registry.ts is doc-affecting, so docs:check must have run and passed
      expect(fs.existsSync(path.join(repo, MARKER))).toBe(true);
    } finally {
      await cleanup(repo);
    }
  });

  it("runs docs:check when the resolution touches README.md", async () => {
    const repo = makeRepo(0);
    try {
      writeTxt(repo, "README.md", "v1\n");
      writeTxt(repo, "f.txt", "base\n");
      git(repo, ["add", "-A"]);
      git(repo, ["commit", "-qm", "base"]);
      git(repo, ["checkout", "-qb", "feat"]);
      writeTxt(repo, "f.txt", "feat\n");
      writeTxt(repo, "README.md", "v2\n"); // doc change rides in with the merge
      git(repo, ["commit", "-qam", "feat"]);
      git(repo, ["checkout", "-q", "main"]);
      writeTxt(repo, "f.txt", "main\n");
      git(repo, ["commit", "-qam", "main"]);
      gitMayConflict(repo, ["merge", "feat"]);
      writeTxt(repo, "f.txt", "resolved\n");
      git(repo, ["add", "-A"]);
      const r = runGuard(repo, "pre-commit");
      expect(r.code).toBe(0);
      expect(fs.existsSync(path.join(repo, MARKER))).toBe(true);
    } finally {
      await cleanup(repo);
    }
  });

  it("does not run docs:check when the resolution touches no doc-affecting file", async () => {
    const repo = makeRepo(0);
    try {
      writeTxt(repo, "src/thing.ts", "1\n");
      writeTxt(repo, "f.txt", "base\n");
      git(repo, ["add", "-A"]);
      git(repo, ["commit", "-qm", "base"]);
      git(repo, ["checkout", "-qb", "feat"]);
      writeTxt(repo, "f.txt", "feat\n");
      git(repo, ["commit", "-qam", "feat"]);
      git(repo, ["checkout", "-q", "main"]);
      writeTxt(repo, "f.txt", "main\n");
      writeTxt(repo, "src/thing.ts", "2\n");
      git(repo, ["commit", "-qam", "main"]);
      gitMayConflict(repo, ["merge", "feat"]);
      writeTxt(repo, "f.txt", "resolved\n");
      git(repo, ["add", "-A"]);
      const r = runGuard(repo, "pre-commit");
      expect(r.code).toBe(0);
      expect(fs.existsSync(path.join(repo, MARKER))).toBe(false);
    } finally {
      await cleanup(repo);
    }
  });

  it("blocks when docs:check fails for the resolution", async () => {
    const repo = makeRepo(1);
    try {
      writeTxt(repo, "ARCHITECTURE.md", "v1\n");
      writeTxt(repo, "f.txt", "base\n");
      git(repo, ["add", "-A"]);
      git(repo, ["commit", "-qm", "base"]);
      git(repo, ["checkout", "-qb", "feat"]);
      writeTxt(repo, "f.txt", "feat\n");
      writeTxt(repo, "ARCHITECTURE.md", "v2\n"); // doc change rides in with the merge
      git(repo, ["commit", "-qam", "feat"]);
      git(repo, ["checkout", "-q", "main"]);
      writeTxt(repo, "f.txt", "main\n");
      git(repo, ["commit", "-qam", "main"]);
      gitMayConflict(repo, ["merge", "feat"]);
      writeTxt(repo, "f.txt", "resolved\n");
      git(repo, ["add", "-A"]);
      const r = runGuard(repo, "pre-commit");
      expect(r.code).not.toBe(0);
      expect(r.stderr).toMatch(/docs:check failed/);
      expect(r.stderr).toMatch(/--no-verify/);
    } finally {
      await cleanup(repo);
    }
  });

  it("blocks a squash-merge resolution that drops an ORIG_HEAD reg() tool", async () => {
    const repo = makeRepo(null);
    try {
      writeRegistry(repo, ["alpha", "beta"]);
      git(repo, ["add", "-A"]);
      git(repo, ["commit", "-qm", "base"]);
      git(repo, ["checkout", "-qb", "feat"]);
      writeRegistry(repo, ["alpha", "beta", "gamma"]);
      git(repo, ["commit", "-qam", "feat"]);
      git(repo, ["checkout", "-q", "main"]);
      writeRegistry(repo, ["alpha", "beta", "delta"]);
      git(repo, ["commit", "-qam", "main"]);
      gitMayConflict(repo, ["merge", "--squash", "feat"]);
      writeRegistry(repo, ["alpha", "beta"]);
      git(repo, ["add", "-A"]);
      const r = runGuard(repo, "pre-commit");
      expect(r.code).not.toBe(0);
      expect(r.stderr).toMatch(/delta/);
    } finally {
      await cleanup(repo);
    }
  });

  it("blocks a cherry-pick resolution that drops a reg() tool from HEAD", async () => {
    // cherry-pick sets CHERRY_PICK_HEAD, not ORIG_HEAD (and any leftover
    // ORIG_HEAD from an earlier operation would be stale), so HEAD is the base.
    const repo = makeRepo(null);
    try {
      writeRegistry(repo, ["alpha", "beta"]);
      writeTxt(repo, "f.txt", "base\n");
      git(repo, ["add", "-A"]);
      git(repo, ["commit", "-qm", "base"]);
      git(repo, ["checkout", "-qb", "src"]);
      writeRegistry(repo, ["alpha", "beta", "gamma"]);
      writeTxt(repo, "f.txt", "src\n");
      git(repo, ["commit", "-qam", "srcchange"]);
      const picked = git(repo, ["rev-parse", "HEAD"]).trim();
      git(repo, ["checkout", "-q", "main"]);
      writeRegistry(repo, ["alpha", "beta", "delta"]);
      writeTxt(repo, "f.txt", "main\n");
      git(repo, ["commit", "-qam", "main"]);
      gitMayConflict(repo, ["cherry-pick", picked]);
      writeRegistry(repo, ["alpha", "gamma"]); // dropped beta (and delta)
      git(repo, ["add", "-A"]);
      const r = runGuard(repo, "pre-commit");
      expect(r.code).not.toBe(0);
      expect(r.stderr).toMatch(/cherry-pick\/revert resolution removes reg\(\) tool/);
      expect(r.stderr).toMatch(/beta/);
      expect(r.stderr).toMatch(/--no-verify/);
    } finally {
      await cleanup(repo);
    }
  });

  it("blocks a revert that removes a reg() tool (deliberate ones need --no-verify)", async () => {
    const repo = makeRepo(null);
    try {
      writeRegistry(repo, ["alpha"]);
      git(repo, ["add", "-A"]);
      git(repo, ["commit", "-qm", "base"]);
      writeRegistry(repo, ["alpha", "beta"]);
      git(repo, ["commit", "-qam", "add beta"]);
      const added = git(repo, ["rev-parse", "HEAD"]).trim();
      gitMayConflict(repo, ["revert", "--no-commit", added]);
      git(repo, ["add", "-A"]);
      const r = runGuard(repo, "pre-commit");
      expect(r.code).not.toBe(0);
      expect(r.stderr).toMatch(/beta/);
      expect(r.stderr).toMatch(/--no-verify/);
    } finally {
      await cleanup(repo);
    }
  });

  it("blocks a merge resolution that deletes registry.ts outright", async () => {
    const repo = makeRepo(null);
    try {
      stageMergeResolution(repo, {
        baseNames: ["alpha", "beta"],
        mainNames: ["alpha", "beta", "delta"],
        featNames: ["alpha", "beta", "gamma"],
        resolvedNames: [],
      });
      // resolvedNames: [] writes an empty TOOLS list; go one step further and
      // remove the file, which parses as "no registry" rather than "no tools".
      fs.rmSync(path.join(repo, "src", "mcp", "registry.ts"));
      git(repo, ["add", "-A"]);
      const r = runGuard(repo, "pre-commit");
      expect(r.code).not.toBe(0);
      expect(r.stderr).toMatch(/delta/);
    } finally {
      await cleanup(repo);
    }
  });

  it("blocks a merge resolution detected from a linked worktree (.git is a file)", async () => {
    const repo = makeRepo(null);
    try {
      writeRegistry(repo, ["alpha", "beta"]);
      git(repo, ["add", "-A"]);
      git(repo, ["commit", "-qm", "base"]);
      const wt = path.join(repo, "wt");
      git(repo, ["worktree", "add", "-q", wt, "-b", "wtb"]);
      // The merge flow stays on branches exclusive to this worktree; `main`
      // is checked out in the parent worktree and cannot move here.
      git(wt, ["checkout", "-qb", "feat"]);
      writeRegistry(wt, ["alpha", "beta", "gamma"]);
      git(wt, ["commit", "-qam", "feat"]);
      git(wt, ["checkout", "-q", "wtb"]);
      writeRegistry(wt, ["alpha", "beta", "delta"]);
      git(wt, ["commit", "-qam", "main-side"]);
      gitMayConflict(wt, ["merge", "feat"]);
      writeRegistry(wt, ["alpha", "beta"]);
      git(wt, ["add", "-A"]);
      const r = runGuard(wt, "pre-commit");
      expect(r.code).not.toBe(0);
      expect(r.stderr).toMatch(/delta/);
    } finally {
      await cleanup(repo);
    }
  });

  it("blocks a merge resolution when invoked from a subdirectory", async () => {
    const repo = makeRepo(null);
    try {
      stageMergeResolution(repo, {
        baseNames: ["alpha", "beta"],
        mainNames: ["alpha", "beta", "delta"],
        featNames: ["alpha", "beta", "gamma"],
        resolvedNames: ["alpha", "beta"],
      });
      const sub = path.join(repo, "nested", "deep");
      fs.mkdirSync(sub, { recursive: true });
      const r = runGuard(sub, "pre-commit");
      expect(r.code).not.toBe(0);
      expect(r.stderr).toMatch(/delta/);
    } finally {
      await cleanup(repo);
    }
  });
});

describe("check-resolution-guards post-merge", () => {
  it("warns after a clean merge removes a reg() tool, and runs docs:check", async () => {
    const repo = makeRepo(0);
    try {
      writeRegistry(repo, ["alpha", "beta"]);
      writeTxt(repo, "f.txt", "base\n");
      git(repo, ["add", "-A"]);
      git(repo, ["commit", "-qm", "base"]);
      git(repo, ["checkout", "-qb", "feat"]);
      writeRegistry(repo, ["alpha"]); // branch deletes beta
      writeTxt(repo, "g.txt", "g\n");
      git(repo, ["add", "-A"]);
      git(repo, ["commit", "-qam", "remove beta"]);
      git(repo, ["checkout", "-q", "main"]);
      writeTxt(repo, "f.txt", "main\n");
      git(repo, ["commit", "-qam", "main"]); // main must not touch registry.ts
      git(repo, ["merge", "-q", "feat"]);
      const r = runGuard(repo, "post-merge");
      expect(r.code).not.toBe(0); // git ignores this exit code; see the hook
      expect(r.stderr).toMatch(/beta/);
      expect(r.stderr).toMatch(/already completed/);
      expect(fs.existsSync(path.join(repo, MARKER))).toBe(true); // registry is doc-affecting
    } finally {
      await cleanup(repo);
    }
  });

  it("passes a clean merge that changes no reg() tool and no doc-affecting file", async () => {
    const repo = makeRepo(0);
    try {
      writeTxt(repo, "f.txt", "base\n");
      git(repo, ["add", "-A"]);
      git(repo, ["commit", "-qm", "base"]);
      git(repo, ["checkout", "-qb", "feat"]);
      writeTxt(repo, "g.txt", "g\n");
      git(repo, ["add", "-A"]);
      git(repo, ["commit", "-qam", "g"]);
      git(repo, ["checkout", "-q", "main"]);
      writeTxt(repo, "f.txt", "main\n");
      git(repo, ["commit", "-qam", "main"]);
      git(repo, ["merge", "-q", "feat"]);
      const r = runGuard(repo, "post-merge");
      expect(r.code).toBe(0);
      expect(fs.existsSync(path.join(repo, MARKER))).toBe(false);
    } finally {
      await cleanup(repo);
    }
  });
});

describe("check-resolution-guards post-rewrite", () => {
  it("warns when a rebase dropped a reg() tool that the new base had", async () => {
    // pre-commit never runs during `git rebase --continue`; post-rewrite sees
    // the old..new pairs on stdin. The dropped tool lived in the merge-base
    // of the old tip and HEAD (the commit rebased onto), not in the old tip.
    const repo = makeRepo(0);
    try {
      writeRegistry(repo, ["alpha", "beta"]); // common base: both tools
      writeTxt(repo, "f.txt", "base\n");
      git(repo, ["add", "-A"]);
      git(repo, ["commit", "-qm", "base"]);
      git(repo, ["checkout", "-qb", "feature"]);
      writeTxt(repo, "f.txt", "feature\n");
      git(repo, ["commit", "-qam", "tip"]); // old tip: registry untouched
      const oldTip = git(repo, ["rev-parse", "HEAD"]).trim();
      git(repo, ["checkout", "-q", "main"]);
      writeRegistry(repo, ["alpha"]); // rewritten HEAD: beta silently gone
      writeTxt(repo, "f.txt", "rewritten\n");
      git(repo, ["commit", "-qam", "rewritten"]);
      const newTip = git(repo, ["rev-parse", "HEAD"]).trim();
      const r = runGuard(repo, "post-rewrite", `${oldTip} ${newTip}\n`);
      expect(r.code).not.toBe(0);
      expect(r.stderr).toMatch(/beta/);
      expect(r.stderr).toMatch(/already completed/);
    } finally {
      await cleanup(repo);
    }
  });

  it("passes a rewrite that kept every tool the merge-base had", async () => {
    const repo = makeRepo(0);
    try {
      writeRegistry(repo, ["alpha", "beta"]);
      writeTxt(repo, "f.txt", "base\n");
      git(repo, ["add", "-A"]);
      git(repo, ["commit", "-qm", "base"]);
      git(repo, ["checkout", "-qb", "feature"]);
      writeTxt(repo, "f.txt", "feature\n");
      git(repo, ["commit", "-qam", "tip"]);
      const oldTip = git(repo, ["rev-parse", "HEAD"]).trim();
      git(repo, ["checkout", "-q", "main"]);
      writeRegistry(repo, ["alpha", "beta", "gamma"]); // rewrite adds a tool
      git(repo, ["commit", "-qam", "rewritten"]);
      const newTip = git(repo, ["rev-parse", "HEAD"]).trim();
      const r = runGuard(repo, "post-rewrite", `${oldTip} ${newTip}\n`);
      expect(r.code).toBe(0);
    } finally {
      await cleanup(repo);
    }
  });

  it("flags a tool dropped from the commit rebased onto, invisible at the fork point", async () => {
    // The AGENTS.md scenario: delta merged into main between the fork and the
    // rebase, and a one-sided resolution of registry.ts dropped it. Neither
    // the old tip nor the fork point ever had delta, so only comparing
    // against the commit rebased onto (HEAD~1 for one rewritten commit)
    // catches it. This test is the regression pin for that base choice.
    const repo = makeRepo(0);
    try {
      writeRegistry(repo, ["alpha", "beta"]);
      writeTxt(repo, "f.txt", "base\n");
      git(repo, ["add", "-A"]);
      git(repo, ["commit", "-qm", "fork point"]);
      git(repo, ["checkout", "-qb", "feature"]);
      writeRegistry(repo, ["alpha", "beta", "gamma"]); // branch's own tool
      git(repo, ["commit", "-qam", "tip"]);
      const oldTip = git(repo, ["rev-parse", "HEAD"]).trim();
      git(repo, ["checkout", "-q", "main"]);
      writeRegistry(repo, ["alpha", "beta", "delta"]); // merged in between
      git(repo, ["commit", "-qam", "add delta"]);
      // The rewritten tip: resolution kept the branch side and dropped delta.
      writeRegistry(repo, ["alpha", "beta", "gamma"]);
      git(repo, ["commit", "-qam", "rewritten"]);
      const newTip = git(repo, ["rev-parse", "HEAD"]).trim();
      const r = runGuard(repo, "post-rewrite", `${oldTip} ${newTip}\n`);
      expect(r.code).not.toBe(0);
      expect(r.stderr).toMatch(/delta/);
    } finally {
      await cleanup(repo);
    }
  });
});
