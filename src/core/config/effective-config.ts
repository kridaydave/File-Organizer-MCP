/**
 * Config — the effective configuration after every layer is applied
 *
 * A tool call sees CONFIG.paths (defaults + filtered custom dirs) and
 * ctx.config (the raw config.json). Neither one alone explains why a call
 * failed, which is the whole reason file_organizer_doctor exists. This module
 * is the single place that layers defaults and config.json so the doctor
 * report and any future consumer read the same values.
 *
 * No config value comes from the environment. APPDATA, XDG_CONFIG_HOME and
 * OneDrive only steer where config.json is read from (see paths.ts).
 */

import fs from "fs";
import os from "os";
import { CONFIG } from "./defaults.js";
import { getUserConfigPath } from "./paths.js";
import { inspectAllowedDirs, type AllowedDirVerdict } from "./allowed-dirs.js";
import type { UserConfig } from "./loader.js";

export interface EffectiveSecurityConfig {
  enablePathValidation: boolean;
  allowCustomDirectories: boolean;
  logAccess: boolean;
  maxScanDepth: number;
  maxFilesPerOperation: number;
}

export interface EffectiveConfig {
  version: string;
  platform: NodeJS.Platform;
  configFilePresent: boolean;
  security: EffectiveSecurityConfig;
  conflictStrategy: NonNullable<UserConfig["conflictStrategy"]>;
  allowExternalVolumes: boolean;
  customRuleCount: number;
  historyLogging: UserConfig["historyLogging"];
  autoOrganize: UserConfig["autoOrganize"];
  /** Default allowed roots for this platform, after existence filtering. */
  defaultAllowed: string[];
  /** Every customAllowedDirectories entry with its verdict. */
  configuredAllowedDirs: AllowedDirVerdict[];
  /** The custom dirs that survived the security gate. */
  effectiveAllowedDirs: string[];
  /** config.json keys the loader does not understand. */
  unknownConfigKeys: string[];
}

/**
 * Keys loadUserConfig() actually reads, reported as unknown when a config.json
 * carries anything else.
 *
 * The set is pinned to UserConfig with `satisfies`, so adding or removing a
 * field there is a compile error here instead of a false "unrecognized key"
 * report at runtime. The literal list is the only copy in src; config.schema.json
 * is deliberately not the source: it still describes a retired shape
 * (watchFolders, debounceTime) that nothing reads, and package.json "files"
 * does not ship it, so it is not available at runtime.
 */
const KNOWN_CONFIG_KEYS: ReadonlySet<string> = new Set(
  Object.keys({
    customAllowedDirectories: undefined,
    allowExternalVolumes: undefined,
    conflictStrategy: undefined,
    autoOrganize: undefined,
    settings: undefined,
    rules: undefined,
    customRules: undefined,
    watchList: undefined,
    historyLogging: undefined,
  } satisfies { [K in keyof Required<UserConfig>]: undefined }),
);

export function getEffectiveConfig(config: UserConfig): EffectiveConfig {
  const allowExternalVolumes = config.allowExternalVolumes === true;
  const configuredAllowedDirs = Array.isArray(config.customAllowedDirectories)
    ? inspectAllowedDirs(config.customAllowedDirectories, allowExternalVolumes)
    : [];

  return {
    version: CONFIG.VERSION,
    platform: os.platform(),
    configFilePresent: fs.existsSync(getUserConfigPath()),
    security: {
      enablePathValidation:
        config.settings?.enablePathValidation ??
        CONFIG.security.enablePathValidation,
      allowCustomDirectories:
        config.settings?.allowCustomDirectories ??
        CONFIG.security.allowCustomDirectories,
      logAccess: config.settings?.logAccess ?? CONFIG.security.logAccess,
      maxScanDepth:
        config.settings?.maxScanDepth ?? CONFIG.security.maxScanDepth,
      maxFilesPerOperation: CONFIG.security.maxFilesPerOperation,
    },
    conflictStrategy: config.conflictStrategy ?? "rename",
    allowExternalVolumes,
    customRuleCount: Array.isArray(config.customRules)
      ? config.customRules.length
      : 0,
    historyLogging: config.historyLogging,
    autoOrganize: config.autoOrganize,
    defaultAllowed: [...CONFIG.paths.defaultAllowed],
    configuredAllowedDirs,
    effectiveAllowedDirs: configuredAllowedDirs
      .filter((verdict) => verdict.accepted)
      .map((verdict) => verdict.configured),
    unknownConfigKeys: Object.keys(config).filter(
      (key) => !KNOWN_CONFIG_KEYS.has(key),
    ),
  };
}
