/**
 * Config bundle — portable export logic.
 *
 * The bundle carries two kinds of value: rules and strategies, which mean the
 * same thing on any machine, and absolute directory paths, which do not. These
 * tests pin how each kind is exported, and pin that the machine-bound half is
 * always reported rather than silently handed over.
 *
 * No assertion compares a raw absolute path literal: the sandbox root and every
 * path under it are derived at runtime, and rebased values are checked by
 * re-expanding them, so macOS (/var -> /private/var) and Windows (8.3 short
 * names, different separators) cannot make these fail.
 */

import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  buildConfigBundle,
  loadConfigBundle,
  serializeConfigBundle,
  writeConfigBundleFile,
  CONFIG_BUNDLE_FORMAT,
} from "../../../../src/core/config/portable-bundle.js";
import { ValidationError } from "../../../../src/types.js";
import type { UserConfig } from "../../../../src/core/config/loader.js";

const NOW = new Date("2026-01-02T03:04:05.000Z");

let sandbox: string;
let outDir: string;

beforeEach(async () => {
  sandbox = await fs.mkdtemp(
    path.join(await fs.realpath(os.tmpdir()), "fom-bundle-"),
  );
  outDir = path.join(sandbox, "out");
  await fs.mkdir(outDir, { recursive: true });
});

afterEach(async () => {
  // Windows holds file handles briefly after a write.
  await new Promise((resolve) => setTimeout(resolve, 100));
  await fs.rm(sandbox, { recursive: true, force: true });
});

describe("buildConfigBundle", () => {
  it("exports the machine-independent config verbatim", () => {
    const config: UserConfig = {
      conflictStrategy: "skip",
      customRules: [
        { category: "Widgets", filenamePattern: "\\.widget$", priority: 100 },
      ],
      allowExternalVolumes: true,
      historyLogging: { enabled: true, maxFileSizeMB: 3 },
    };

    const bundle = buildConfigBundle(config, { now: NOW });

    expect(bundle.format_version).toBe(CONFIG_BUNDLE_FORMAT);
    expect(bundle.exported_at).toBe(NOW.toISOString());
    expect(bundle.exported_by).toBe("file_organizer_export_config");
    expect(bundle.config.conflictStrategy).toBe("skip");
    expect(bundle.config.customRules).toEqual(config.customRules);
    expect(bundle.config.allowExternalVolumes).toBe(true);
    expect(bundle.config.historyLogging).toEqual({ enabled: true, maxFileSizeMB: 3 });
    // No directories in this config, so nothing on the target needs editing.
    expect(bundle.portability.requires_editing).toEqual([]);
    expect(bundle.portability.non_portable_paths).toEqual([]);
  });

  it("keeps absolute paths verbatim and says they must be edited", async () => {
    const docs = path.join(sandbox, "Documents");
    const config: UserConfig = { customAllowedDirectories: [docs] };

    const bundle = buildConfigBundle(config, { now: NOW });

    expect(bundle.portability.mode).toBe("absolute");
    expect(bundle.portability.rebase_root).toBeNull();
    expect(bundle.config.customAllowedDirectories).toEqual([docs]);
    expect(bundle.portability.requires_editing).toEqual(["customAllowedDirectories"]);
    expect(bundle.portability.notes.join("\n")).toContain("will not exist elsewhere");
  });

  it("rebases paths under the root into ~-relative values that re-expand", async () => {
    const home = path.join(sandbox, "home");
    const docs = path.join(home, "Documents");
    await fs.mkdir(home, { recursive: true });
    const config: UserConfig = {
      customAllowedDirectories: [path.join(home, "Pictures")],
      watchList: [
        {
          directory: docs,
          schedule: "0 * * * *",
          rules: { auto_organize: true, max_files_per_run: 10 },
        },
      ],
    };

    const bundle = buildConfigBundle(config, { rebaseRoot: home, now: NOW });

    expect(bundle.portability.mode).toBe("rebased");
    expect(bundle.portability.rebase_root).toBe(path.resolve(home));
    expect(bundle.portability.requires_editing).toEqual([]);

    // A rebased value is correct when re-expanding it against the target
    // machine's home lands on the original directory, so compare resolved
    // paths rather than the exported strings or the raw fixture paths.
    const exportedDirs = bundle.config.customAllowedDirectories ?? [];
    const exportedWatchDir = bundle.config.watchList?.[0]?.directory ?? "";
    expect(exportedDirs.every((dir) => dir.startsWith("~"))).toBe(true);
    expect(exportedWatchDir.startsWith("~")).toBe(true);
    expect(
      path.resolve(path.join(home, (exportedDirs[0] ?? "").slice(1))),
    ).toBe(path.resolve(path.join(home, "Pictures")));
    expect(path.resolve(path.join(home, exportedWatchDir.slice(1)))).toBe(
      path.resolve(docs),
    );
  });

  it("reports a path it cannot rebase instead of rewriting it", async () => {
    const home = path.join(sandbox, "home");
    const external = path.join(sandbox, "external-volume");
    const config: UserConfig = {
      customAllowedDirectories: [path.join(home, "Documents"), external],
      watchList: [
        {
          directory: external,
          schedule: "@daily",
          rules: { auto_organize: false },
        },
      ],
    };

    const bundle = buildConfigBundle(config, { rebaseRoot: home, now: NOW });

    expect(bundle.portability.non_portable_paths).toEqual([
      { field: "customAllowedDirectories[1]", value: external, reason: "outside_rebase_root" },
      { field: "watchList[0].directory", value: external, reason: "outside_rebase_root" },
    ]);
    expect(bundle.portability.requires_editing).toEqual([
      "customAllowedDirectories",
      "watchList[].directory",
    ]);
    expect(bundle.portability.notes.join("\n")).toContain("outside the rebase root");
  });

  it("leaves an already home-relative value alone", () => {
    const bundle = buildConfigBundle(
      { customAllowedDirectories: ["~/Documents"] },
      { rebaseRoot: path.join(sandbox, "home"), now: NOW },
    );

    expect(bundle.config.customAllowedDirectories).toEqual(["~/Documents"]);
    expect(bundle.portability.requires_editing).toEqual([]);
  });

  it("reports a tilde value the loader cannot expand instead of calling it portable", () => {
    // expandHomePath only expands "~", "~/" and "~\". "~bob/docs" passes
    // through it untouched and resolves against the working directory, so it is
    // not a home-relative path and must not be reported as portable.
    const bundle = buildConfigBundle(
      { customAllowedDirectories: ["~bob/docs", "~/Documents"] },
      { rebaseRoot: path.join(sandbox, "home"), now: NOW },
    );

    expect(bundle.portability.non_portable_paths).toEqual([
      {
        field: "customAllowedDirectories[0]",
        value: "~bob/docs",
        reason: "outside_rebase_root",
      },
    ]);
    expect(bundle.portability.requires_editing).toEqual([
      "customAllowedDirectories",
    ]);
    // The genuinely home-relative value still travels untouched.
    expect(bundle.config.customAllowedDirectories?.[1]).toBe("~/Documents");
  });

  it("exports watch rules and schedule untouched while rebasing the directory", async () => {
    const home = path.join(sandbox, "home");
    const bundle = buildConfigBundle(
      {
        watchList: [
          {
            directory: path.join(home, "Downloads"),
            schedule: "0 10 * * *",
            rules: { auto_organize: true, catchup_mode: "smart" },
          },
        ],
      },
      { rebaseRoot: home, now: NOW },
    );

    expect(bundle.config.watchList?.[0]?.schedule).toBe("0 10 * * *");
    expect(bundle.config.watchList?.[0]?.rules).toEqual({
      auto_organize: true,
      catchup_mode: "smart",
    });
  });

  it("drops config keys the loader does not understand", () => {
    const bundle = buildConfigBundle(
      {
        conflictStrategy: "rename",
        somethingFromTheFuture: { nested: true },
      } as unknown as UserConfig,
      { now: NOW },
    );

    expect(bundle.config).toEqual({ conflictStrategy: "rename" });
  });
});

describe("bundle file IO", () => {
  it("round-trips through disk into the same config shape", async () => {
    const config: UserConfig = {
      customAllowedDirectories: [path.join(sandbox, "Documents")],
      conflictStrategy: "overwrite",
      customRules: [
        { category: "Widgets", extensions: [".widget"], priority: 7 },
      ],
      rules: [{ pattern: "*.tmp", destination: "Temp" }],
      watchList: [
        { directory: path.join(sandbox, "Downloads"), schedule: "@daily", rules: { auto_organize: false } },
      ],
      settings: { maxScanDepth: 4 },
    };
    const bundle = buildConfigBundle(config, { now: NOW });
    const file = path.join(outDir, "bundle.json");

    const bytes = writeConfigBundleFile(bundle, file);

    expect(bytes).toBeGreaterThan(0);
    const loaded = loadConfigBundle(await fs.readFile(file, "utf-8"));
    expect(loaded.config).toEqual(config);
    expect(loaded.format_version).toBe(CONFIG_BUNDLE_FORMAT);
    expect(loaded.portability.mode).toBe("absolute");
  });

  it("refuses to overwrite an existing file", async () => {
    const file = path.join(outDir, "bundle.json");
    await fs.writeFile(file, "keep me", "utf-8");
    const bundle = buildConfigBundle({ conflictStrategy: "skip" }, { now: NOW });

    expect(() => writeConfigBundleFile(bundle, file)).toThrow(
      expect.objectContaining({ code: "EEXIST" }),
    );
    expect(await fs.readFile(file, "utf-8")).toBe("keep me");
  });

  it("rejects a file that is not a bundle", () => {
    expect(() => loadConfigBundle("{ not json")).toThrow(ValidationError);
    expect(() => loadConfigBundle(JSON.stringify({ hello: "world" }))).toThrow(
      ValidationError,
    );
  });

  it("rejects a bundle written by a format it does not implement", () => {
    const bundle = buildConfigBundle({ conflictStrategy: "skip" }, { now: NOW });
    const future = JSON.stringify({
      ...bundle,
      format_version: CONFIG_BUNDLE_FORMAT + 1,
    });

    // The error names the version it supports, so the check has to be real:
    // a future format must fail rather than load as this one.
    expect(() => loadConfigBundle(future)).toThrow(ValidationError);
    expect(() => loadConfigBundle(future)).toThrow(
      `v${CONFIG_BUNDLE_FORMAT} config bundle`,
    );
    expect(loadConfigBundle(JSON.stringify(bundle)).config.conflictStrategy).toBe(
      "skip",
    );
  });

  it("serializes to JSON with a trailing newline", () => {
    const bundle = buildConfigBundle({ conflictStrategy: "rename" }, { now: NOW });
    const text = serializeConfigBundle(bundle);

    expect(text.endsWith("\n")).toBe(true);
    expect(JSON.parse(text).format_version).toBe(CONFIG_BUNDLE_FORMAT);
  });
});