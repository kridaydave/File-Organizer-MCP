/**
 * Integration tests for file_organizer_doctor.
 *
 * The tool reports the effective config, so these drive the real config
 * layering path: a sandbox home as the user config dir, a seeded sandbox
 * config.json, and a real ToolContext carrying that config.
 *
 * Every path here is derived from getUserConfigPath(), os.homedir() and
 * os.tmpdir() rather than hardcoded, because all three move per platform. A
 * hardcoded fixture path passes on one runner and silently reports an empty
 * config on another.
 */

import fs from "fs/promises";
import fsSync from "fs";
import os from "os";
import path from "path";
import {
  handleDoctor,
  doctorToolDefinition,
} from "../../../src/tools/doctor.js";
import { getEffectiveConfig } from "../../../src/core/config/effective-config.js";
import { createRequestContext } from "../../../src/mcp/context.js";
import type { ToolContext } from "../../../src/mcp/context.js";
import type { UserConfig } from "../../../src/core/config/loader.js";
import { doctorOutputSchema } from "../../../src/schemas/output.js";
import { getUserConfigPath } from "../../../src/core/config/paths.js";
import { loadCustomAllowedDirs } from "../../../src/core/config/loader.js";
import { validateStrictPath } from "../../../src/services/path-validator.service.js";
import { getAlwaysBlockedPatterns } from "../../../src/core/config/security.js";

interface ConfiguredDirEntry {
  configured: string;
  exists: boolean;
  accepted: boolean;
  rejection?: string;
  blocked_by_policy: boolean;
}

/**
 * Pick the entry for one configured path. The report keeps every configured
 * entry in config order, but nothing promises that order survives the loader's
 * filtering, so a test selects by identity and never by position.
 */
function entryFor(
  entries: ConfiguredDirEntry[],
  configured: string,
): ConfiguredDirEntry {
  const entry = entries.find((e) => e.configured === configured);
  expect(entry).toBeDefined();
  return entry!;
}

const blockedPatterns = getAlwaysBlockedPatterns();

function isBlockedByPolicy(dir: string): boolean {
  const resolved = path.resolve(dir);
  return blockedPatterns.some((pattern) => pattern.test(resolved));
}

/**
 * A base directory to build the sandbox home in. The home under test is the
 * sandbox itself (os.homedir is pointed at it), so the only real constraint is
 * that the base must not sit on an always-blocked path, or every fixture under
 * it would report blocked_by_policy and the assertions about ordinary
 * directories would be meaningless.
 *
 * os.tmpdir() needs one correction on macOS. It returns /var/folders/..., and
 * /var is always blocked, but /var is only a symlink to /private/var, which
 * the block list deliberately leaves usable so per-user temp dirs keep
 * working. So the real path is the unblocked one. A repo-relative fallback
 * cannot serve: the checkout itself can sit under a blocked root such as /root
 * or /var, and tests/sandbox is gitignored anyway.
 */
function sandboxBase(): string {
  const usable = (dir: string): boolean =>
    fsSync.existsSync(dir) && !isBlockedByPolicy(dir);

  const candidates = [fsSync.realpathSync(os.tmpdir()), os.tmpdir()];
  for (const candidate of candidates) {
    if (usable(candidate)) return candidate;
  }
  throw new Error(
    `No unblocked base for the sandbox home; os.tmpdir() is ${os.tmpdir()}`,
  );
}

const originalHome = os.homedir;
const originalXdg = process.env.XDG_CONFIG_HOME;
const originalAppData = process.env.APPDATA;
let sandboxHome: string;
let sandboxBaseDir: string;
let configDir: string;
let configPath: string;

async function writeConfig(config: UserConfig): Promise<void> {
  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
}

/** A ToolContext whose config is the file on disk, like a real request. */
async function contextFromDisk(): Promise<ToolContext> {
  await writeConfig(
    JSON.parse(await fs.readFile(configPath, "utf-8")) as UserConfig,
  );
  return createRequestContext();
}

beforeEach(async () => {
  sandboxBaseDir = sandboxBase();
  // Canonicalise: os.tmpdir() is spelled with the Windows 8.3 short name
  // (RUNNER~1) while realpath expands it (runneradmin), so paths built from
  // the raw value disagree with what the validator returns.
  sandboxHome = await fs.realpath(
    await fs.mkdtemp(path.join(sandboxBaseDir, "fom-doctor-")),
  );
  os.homedir = () => sandboxHome;
  process.env.XDG_CONFIG_HOME = path.join(sandboxHome, ".config");
  process.env.APPDATA = path.join(sandboxHome, "AppData", "Roaming");
  // getUserConfigPath() picks the base dir per platform (the home's .config on
  // Linux, Library/Application Support on macOS, %APPDATA% on Windows), so the
  // sandbox config path has to come from it rather than being hardcoded.
  // Deriving it is what makes this suite pass on all three CI platforms.
  configPath = getUserConfigPath();
  configDir = path.dirname(configPath);
});

afterEach(async () => {
  os.homedir = originalHome;
  if (originalXdg === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = originalXdg;
  if (originalAppData === undefined) delete process.env.APPDATA;
  else process.env.APPDATA = originalAppData;
  await fs.rm(sandboxHome, { recursive: true, force: true });
});

describe("file_organizer_doctor", () => {
  it("reports the effective config after layering, not the raw file", async () => {
    const good = path.join(sandboxHome, "Downloads");
    await fs.mkdir(good, { recursive: true });
    await writeConfig({
      customAllowedDirectories: [good],
      conflictStrategy: "skip",
    });

    const ctx = await contextFromDisk();
    const result = await handleDoctor({ response_format: "json" }, ctx);
    const report = result.structuredContent as {
      conflict_strategy: string;
      effective_allowed_dirs: string[];
      configured_allowed_dirs: ConfiguredDirEntry[];
    };

    // conflictStrategy is absent from the built-in defaults object and comes
    // only from config.json, so seeing "skip" proves the file was layered in.
    expect(report.conflict_strategy).toBe("skip");
    expect(report.effective_allowed_dirs).toEqual([good]);
    expect(entryFor(report.configured_allowed_dirs, good).accepted).toBe(true);
  });

  it("flags a nonexistent directory as a typo with exists false", async () => {
    const typo = path.join(sandboxHome, "Downlaods");
    await writeConfig({ customAllowedDirectories: [typo] });

    const ctx = await contextFromDisk();
    const result = await handleDoctor({ response_format: "json" }, ctx);
    const report = result.structuredContent as {
      configured_allowed_dirs: ConfiguredDirEntry[];
      problems: string[];
      healthy: boolean;
    };

    const entry = entryFor(report.configured_allowed_dirs, typo);
    expect(entry.exists).toBe(false);
    expect(entry.accepted).toBe(false);
    expect(entry.rejection).toBe("missing");
    expect(entry.blocked_by_policy).toBe(false);
    expect(report.healthy).toBe(false);
    expect(report.problems.join("\n")).toContain("likely a typo");
  });

  it("flags a policy-blocked path and distinguishes it from a typo", async () => {
    const blocked = path.join(sandboxHome, "build", "artifacts");
    const typo = path.join(sandboxHome, "Downlaods");
    await fs.mkdir(blocked, { recursive: true });
    await writeConfig({ customAllowedDirectories: [blocked, typo] });

    const ctx = await contextFromDisk();
    const result = await handleDoctor({ response_format: "json" }, ctx);
    const report = result.structuredContent as {
      configured_allowed_dirs: ConfiguredDirEntry[];
      problems: string[];
    };

    // The always-blocked pattern list is enforced at request time, not by the
    // custom-dir gate, so an existing in-home directory can be accepted here
    // and still be unusable. Both facts are reported independently.
    const blockedEntry = entryFor(report.configured_allowed_dirs, blocked);
    const typoEntry = entryFor(report.configured_allowed_dirs, typo);

    expect(blockedEntry.exists).toBe(true);
    expect(blockedEntry.accepted).toBe(true);
    expect(blockedEntry.blocked_by_policy).toBe(true);
    expect(typoEntry.exists).toBe(false);
    expect(typoEntry.accepted).toBe(false);
    expect(typoEntry.blocked_by_policy).toBe(false);

    // The two failures must read differently so a user knows which is which.
    const blockedProblem = report.problems.find((p) => p.includes(blocked));
    const typoProblem = report.problems.find((p) => p.includes(typo));
    expect(blockedProblem).toContain("security policy always blocks");
    expect(typoProblem).toContain("likely a typo");
  });

  it("reports a directory the security gate drops even when it exists", async () => {
    // A sibling of the sandbox home, so it is outside the sandboxed home on
    // every platform. os.tmpdir() cannot serve here because on Windows it
    // sits under the real home, and the home under test is the sandbox, so the
    // fixture would be accepted instead of rejected.
    const outside = await fs.mkdtemp(
      path.join(sandboxBaseDir, "fom-doctor-outside-home-"),
    );
    await writeConfig({ customAllowedDirectories: [outside] });

    const ctx = await contextFromDisk();
    const result = await handleDoctor({ response_format: "json" }, ctx);
    const report = result.structuredContent as {
      configured_allowed_dirs: ConfiguredDirEntry[];
      effective_allowed_dirs: string[];
    };

    const entry = entryFor(report.configured_allowed_dirs, outside);
    expect(entry.exists).toBe(true);
    expect(entry.accepted).toBe(false);
    expect(entry.rejection).toBe("outside_home");
    expect(report.effective_allowed_dirs).toEqual([]);
    await fs.rm(outside, { recursive: true, force: true });
  });

  it("lists only the directories that survived the gate, by literal value", async () => {
    const good = path.join(sandboxHome, "Documents");
    await fs.mkdir(good, { recursive: true });
    const typo = path.join(sandboxHome, "Documnets");
    await writeConfig({ customAllowedDirectories: [good, typo] });

    const ctx = await contextFromDisk();
    const result = await handleDoctor({ response_format: "json" }, ctx);
    const report = result.structuredContent as {
      effective_allowed_dirs: string[];
    };

    // Literal expectation, not loadCustomAllowedDirs(): comparing the report to
    // the runtime gate proves nothing when both sides run the same verdict
    // function, so a wrong verdict passes both ways. The gate shares
    // inspectAllowedDir with the report, so one fixture pins both.
    expect(report.effective_allowed_dirs).toEqual([good]);
  });

  it("renders markdown naming the missing directory", async () => {
    const typo = path.join(sandboxHome, "Pics");
    await writeConfig({ customAllowedDirectories: [typo] });

    const ctx = await contextFromDisk();
    const result = await handleDoctor({}, ctx);
    const text = result.content[0].text;

    expect(text).toContain("### File Organizer Configuration");
    expect(text).toContain(typo);
    expect(text).toContain("likely a typo");
    expect(text).toContain("needs attention");
  });

  it("structuredContent parses against the declared outputSchema in both formats", async () => {
    const good = path.join(sandboxHome, "Pictures");
    await fs.mkdir(good, { recursive: true });
    const historyLogging = {
      enabled: false,
      maxFileSizeMB: 7,
      keepRotatedFiles: 3,
    };
    const autoOrganize = { enabled: true, schedule: "weekly" as const };
    await writeConfig({
      customAllowedDirectories: [good],
      conflictStrategy: "overwrite",
      historyLogging,
      autoOrganize,
      watchList: [
        {
          directory: good,
          schedule: "0 * * * *",
          rules: { auto_organize: false },
        },
      ],
    });

    const ctx = await contextFromDisk();
    for (const response_format of ["json", "markdown"] as const) {
      const result = await handleDoctor({ response_format }, ctx);
      const parsed = doctorOutputSchema.safeParse(result.structuredContent);
      expect(parsed.success).toBe(true);
      if (!parsed.success) continue;

      // Non-default config in every layer the report carries, so a schema
      // parse cannot pass by matching the empty-config shape.
      expect(parsed.data.history_logging).toEqual(historyLogging);
      expect(parsed.data.auto_organize).toEqual(autoOrganize);
      expect(parsed.data.conflict_strategy).toBe("overwrite");
      expect(parsed.data.effective_allowed_dirs).toEqual([good]);
      expect(parsed.data.default_allowed.length).toBeGreaterThan(0);
      // watchList is read by the loader, so it must not be flagged unknown.
      expect(parsed.data.unknown_config_keys).toEqual([]);
      expect(parsed.data.healthy).toBe(true);
    }
  });

  it("declares honest annotations for a read-only tool", () => {
    expect(doctorToolDefinition.annotations).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
  });

  it("does not write to the config file it reports on", async () => {
    const good = path.join(sandboxHome, "Videos");
    await fs.mkdir(good, { recursive: true });
    await writeConfig({ customAllowedDirectories: [good] });
    const configPath = path.join(configDir, "config.json");
    const before = await fs.readFile(configPath, "utf-8");

    const ctx = await contextFromDisk();
    await handleDoctor({ response_format: "json" }, ctx);

    expect(await fs.readFile(configPath, "utf-8")).toBe(before);
  });

  it("grants access to a '~'-relative directory, the way config.schema.json says it does", async () => {
    // config.schema.json documents customAllowedDirectories as "'~' is expanded
    // to the user home". Before the fix the loader handed the gate the raw
    // "~/..." string, so every tool call against the directory was denied while
    // this report said accepted — and the denial told the user to add the
    // directory that was already in their config.
    //
    // The directory name is deliberately outside the platform defaults, so the
    // access can only have come from the custom entry.
    const custom = path.join(sandboxHome, "client-work");
    await fs.mkdir(custom, { recursive: true });
    const target = path.join(custom, "report.txt");
    await fs.writeFile(target, "contents", "utf-8");
    await writeConfig({ customAllowedDirectories: ["~/client-work"] });

    const ctx = await contextFromDisk();

    // The report's verdict and the runtime gate must agree, which is the whole
    // point of sharing inspectAllowedDir between them.
    const result = await handleDoctor({ response_format: "json" }, ctx);
    const report = result.structuredContent as {
      configured_allowed_dirs: ConfiguredDirEntry[];
      effective_allowed_dirs: string[];
    };
    expect(entryFor(report.configured_allowed_dirs, "~/client-work").accepted).toBe(
      true,
    );
    expect(report.effective_allowed_dirs).toEqual([custom]);

    expect(loadCustomAllowedDirs()).toEqual([custom]);
    await expect(validateStrictPath(target)).resolves.toBe(target);
  });

  it("keeps getEffectiveConfig honest when no config.json exists", () => {
    const effective = getEffectiveConfig({});
    expect(effective.configFilePresent).toBe(false);
    expect(effective.conflictStrategy).toBe("rename");
    expect(effective.configuredAllowedDirs).toEqual([]);
  });
});
