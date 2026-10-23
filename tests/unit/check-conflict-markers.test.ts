/**
 * Pre-commit conflict-marker / em-dash guard.
 *
 * scripts/check-conflict-markers.cjs scans the staged diff and blocks commits
 * that introduce conflict markers or em-dashes in source/docs files. These tests
 * drive it against a throwaway git repository so the real worktree is never
 * touched.
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
const SCRIPT = path.join(REPO_ROOT, "scripts", "check-conflict-markers.cjs");

function git(cwd: string, args: string[]): void {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

function makeRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fo-hook-"));
  git(dir, ["init", "-q"]);
  git(dir, ["config", "user.email", "test@example.com"]);
  git(dir, ["config", "user.name", "test"]);
  return dir;
}

function stageFile(repo: string, name: string, contents: string): void {
  const full = path.join(repo, name);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, contents);
  git(repo, ["add", name]);
}

function runScript(repo: string): { code: number; stderr: string } {
  try {
    const stderr = execFileSync(process.execPath, [SCRIPT], {
      cwd: repo,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, stderr: stderr ?? "" };
  } catch (err) {
    const e = err as { status?: number; stderr?: string };
    return { code: e.status ?? 1, stderr: e.stderr ?? "" };
  }
}

describe("check-conflict-markers pre-commit guard", () => {
  it("passes when the staged change is clean", async () => {
    const repo = makeRepo();
    try {
      stageFile(repo, "src/clean.ts", "export const x = 1;\n");
      const r = runScript(repo);
      expect(r.code).toBe(0);
    } finally {
      await new Promise((r) => setTimeout(r, 100));
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it("blocks a staged conflict marker in a covered extension", async () => {
    const repo = makeRepo();
    try {
      stageFile(repo, "src/bad.ts", "<<<<<<< HEAD\nexport const x = 1;\n");
      const r = runScript(repo);
      expect(r.code).not.toBe(0);
      expect(r.stderr).toMatch(/Conflict marker/);
    } finally {
      await new Promise((r) => setTimeout(r, 100));
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it("blocks a staged em-dash in a covered extension", async () => {
    const repo = makeRepo();
    try {
      stageFile(repo, "docs/note.md", "an em\u2014dash here\n");
      const r = runScript(repo);
      expect(r.code).not.toBe(0);
      expect(r.stderr).toMatch(/Em-dash/);
    } finally {
      await new Promise((r) => setTimeout(r, 100));
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it("ignores files whose extension is not covered", async () => {
    const repo = makeRepo();
    try {
      stageFile(repo, "notes.txt", "<<<<<<< HEAD\n=======\n>>>>>>> x\n");
      const r = runScript(repo);
      expect(r.code).toBe(0);
    } finally {
      await new Promise((r) => setTimeout(r, 100));
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it("passes when nothing is staged", async () => {
    const repo = makeRepo();
    try {
      const r = runScript(repo);
      expect(r.code).toBe(0);
    } finally {
      await new Promise((r) => setTimeout(r, 100));
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });
});
