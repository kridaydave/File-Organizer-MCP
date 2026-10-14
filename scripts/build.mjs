#!/usr/bin/env node
// Emits dist/ with bun. `bun check` type checks but never emits, so this walks
// the same sources tsconfig.json covers and hands them to `bun build
// --no-bundle`, which transpiles each file where it stands and leaves import
// specifiers untouched. That reproduces tsc's per-file layout: one
// dist/src/... and dist/scripts/... .js per .ts.
//
// `bun build --no-bundle` emits no source maps and ignores `--watch`, which is
// why dist/ has neither and why there is no build:watch script. Nothing read
// the maps tsc wrote either, since no entrypoint passes --enable-source-maps.
//
// Usage: node scripts/build.mjs [--list]
//   --list  print the entrypoints instead of building, one per line

import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_DIRS = ["src", "scripts"];

// tsconfig.json excludes the same things. Naming them here rather than in a glob
// is what keeps a stray .d.ts out of the entrypoint list: bun transpiles one as
// if it were source, writes a useless `foo.d.js` next to it, and crashes on the
// next one.
const SKIPPED_FILES = new Set([path.join("scripts", "benchmark.ts")]);
const SKIPPED_SUFFIXES = [".d.ts", ".test.ts", ".spec.ts"];

async function collectSources(dir) {
  const entries = await readdir(path.join(root, dir), {
    withFileTypes: true,
    recursive: true,
  });
  const sources = [];

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = path.relative(
      root,
      path.join(entry.parentPath, entry.name),
    );
    const isSkipped =
      !entry.isFile() ||
      !relative.endsWith(".ts") ||
      SKIPPED_FILES.has(relative) ||
      SKIPPED_SUFFIXES.some((suffix) => relative.endsWith(suffix));

    if (!isSkipped) sources.push(relative);
  }

  return sources;
}

const sources = (await Promise.all(SOURCE_DIRS.map(collectSources)))
  .flat()
  .sort();

if (process.argv.includes("--list")) {
  console.log(sources.join("\n"));
  process.exit(0);
}

const build = spawn(
  "bun",
  ["build", ...sources, "--outdir", "dist", "--target", "node", "--no-bundle"],
  { cwd: root, stdio: "inherit" },
);

build.on("error", (error) => {
  if (error.code === "ENOENT") {
    console.error(
      "bun is not on PATH. Install it from https://bun.sh, then re-run the build.",
    );
    process.exit(1);
  }
  throw error;
});

build.on("exit", (code, signal) => {
  // A signalled child reports no code at all, so `code ?? 0` would call a build
  // that never finished a success.
  process.exit(code ?? (signal ? 1 : 0));
});
