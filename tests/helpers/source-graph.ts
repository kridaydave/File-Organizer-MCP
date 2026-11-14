/**
 * A transpiled copy of the source module graph, for a child process to import.
 *
 * The timezone-pinned suites need a real child process: jest's vm sandbox never
 * forwards a runtime `process.env.TZ` to V8's date cache, so an in-process pin
 * silently answers for whatever zone the runner happens to sit in. A child
 * cannot import `.ts`, and importing `dist/src` only works against whatever was
 * built last. `npm test` has no pretest build, so a single-file run on a fresh
 * checkout dies with "does not provide an export named ...", and a stale build
 * can hand a passing test code that no longer exists. Transpiling at call time
 * keeps the child on the source it is meant to prove.
 *
 * Each copy keeps its path under the repository with a `.mjs` extension, and
 * `.js` specifiers are rewritten to match, so relative imports still resolve.
 * Copies must live inside the repository because bare specifiers (`zod`,
 * `node-cron`) are left to node's own lookup, which walks up to node_modules.
 */

import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

/** `import x from "y"`, `import("y")`, `export ... from "y"`, `import "y"`. */
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(["'])([^"']+)\1/g;

export interface SourceGraphCopies {
  /**
   * Path of the transpiled copy of `filePath`.
   *
   * @throws {Error} When `filePath` is not a module the graph reached. A
   * missing copy means the test is importing something the tool under test no
   * longer pulls in, which would otherwise surface as a child-process crash.
   */
  copyOf(filePath: string): string;
}

/**
 * Write the graph reachable from `entryPaths` into `outDir` and return a
 * lookup for the copies.
 */
export function materialiseSourceGraph(
  entryPaths: string[],
  outDir: string,
): SourceGraphCopies {
  const repoRoot = process.cwd();
  const entries = entryPaths.map((entry) => path.resolve(entry));
  const pending = [...entries];
  const copied = new Set<string>();

  const copyFor = (file: string): string => {
    const relative = path.relative(repoRoot, file);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(
        `source graph copy must live inside ${repoRoot}: ${file} does not`,
      );
    }
    return path.join(outDir, relative.replace(/\.ts$/, ".mjs"));
  };

  while (pending.length > 0) {
    const file = pending.pop()!;
    if (copied.has(file)) continue;
    copied.add(file);

    if (!fs.existsSync(file)) {
      throw new Error(`source graph has no such module: ${file}`);
    }

    const source = fs.readFileSync(file, "utf8");
    for (const imported of ts.preProcessFile(source, true, true).importedFiles) {
      const specifier = imported.fileName;
      if (!specifier.startsWith(".")) continue;
      const target = path
        .resolve(path.dirname(file), specifier)
        .replace(/\.js$/, ".ts");
      if (!fs.existsSync(target)) {
        throw new Error(`${file} imports ${specifier}, which is not a .ts file`);
      }
      pending.push(target);
    }

    const js = ts.transpileModule(source, {
      fileName: path.basename(file),
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    const rewritten = js.replace(SPECIFIER, (whole, quote, specifier) => {
      if (!specifier.startsWith(".") || !specifier.endsWith(".js")) return whole;
      return whole.replace(
        `${quote}${specifier}${quote}`,
        `${quote}${specifier.slice(0, -3)}.mjs${quote}`,
      );
    });

    const out = copyFor(file);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, rewritten);
  }

  return {
    copyOf(filePath: string): string {
      const file = path.resolve(filePath);
      if (!copied.has(file)) {
        throw new Error(`${file} is not in the transpiled source graph`);
      }
      return copyFor(file);
    },
  };
}
