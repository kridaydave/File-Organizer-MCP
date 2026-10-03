/**
 * Cross-platform directory assertions.
 *
 * Tests compare trees RELATIVE to a temp root, sorted, with "/" separators:
 * absolute paths differ per platform (macOS realpath rewrites /var to
 * /private/var, Windows expands 8.3 short names) and readdir order is
 * filesystem order, not alphabetical.
 */

import fs from "fs/promises";
import path from "path";

/** Relative, sorted, "/"-separated paths of every FILE under `root`. */
export async function relativeFiles(root: string): Promise<string[]> {
  const found: string[] = [];

  const walk = async (dir: string): Promise<void> => {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else {
        found.push(toPosixRelative(root, full));
      }
    }
  };

  await walk(root);
  return found.sort();
}

/** Relative, sorted, "/"-separated paths of every DIRECTORY under `root`. */
export async function relativeDirs(root: string): Promise<string[]> {
  const found: string[] = [];

  const walk = async (dir: string): Promise<void> => {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const full = path.join(dir, entry.name);
      found.push(toPosixRelative(root, full));
      await walk(full);
    }
  };

  await walk(root);
  return found.sort();
}

function toPosixRelative(root: string, full: string): string {
  return path.relative(root, full).split(path.sep).join("/");
}
