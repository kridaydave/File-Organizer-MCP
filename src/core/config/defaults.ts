/**
 * Config — defaults / constants
 * Extracted from src/config.ts (no behavior change)
 */

import { getDefaultAllowedDirs } from "./paths.js";
import { loadCustomAllowedDirs } from "./loader.js";
import { getAlwaysBlockedPatterns } from "./security.js";
import type { PrivacyMode } from "../../types.js";

export const CONFIG = {
  VERSION: "5.0.0",

  // Security Settings
  security: {
    enablePathValidation: true,
    allowCustomDirectories: true,
    logAccess: true,
    maxScanDepth: 10,
    maxFilesPerOperation: 10000,
  },

  // Path Access Control
  paths: {
    defaultAllowed: getDefaultAllowedDirs(),
    _overrideCustomAllowed: undefined as string[] | undefined,
    get customAllowed(): string[] {
      return this._overrideCustomAllowed ?? loadCustomAllowedDirs();
    },
    set customAllowed(val: string[] | undefined) {
      this._overrideCustomAllowed = val;
    },
    alwaysBlocked: getAlwaysBlockedPatterns(),
  },
};

export const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
export const MAX_FILES = CONFIG.security.maxFilesPerOperation;
export const MAX_DEPTH = CONFIG.security.maxScanDepth;

export const SKIP_DIRECTORIES = [
  "node_modules",
  ".git",
  "__pycache__",
  ".venv",
] as const;
