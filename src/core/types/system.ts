/**
 * System Types
 * History, rollback, metadata extraction, health and privacy
 */

// ==================== Metadata Extraction Types ====================

// Audio Metadata Types
export interface RollbackAction {
  type: "move" | "copy" | "delete" | "rename";
  originalPath: string;
  currentPath?: string; // For moves/copies
  backupPath?: string; // For deletions (where the file is temporarily stored)
  overwrittenBackupPath?: string; // If a move overwrote a file, this is where the ORIGINAL file is stored
  timestamp: number;
  /**
   * sha256 of the file's content at `manifestActionTarget(action)`, recorded
   * when the operation ran so a later check can detect drift.
   *
   * Optional on purpose: every manifest written before content hashing existed
   * has no digest, and so does any file that could not be read within the
   * manifest's hash budget. `RollbackManifest` therefore stays readable for
   * every user upgrading with a rollback history on disk.
   */
  contentHash?: string;
  /** How `contentHash` was derived. Absent whenever `contentHash` is. */
  hashMethod?: "full" | "sampled";
}

export interface RollbackManifest {
  id: string; // UUID or timestamp
  timestamp: number;
  description: string;
  actions: RollbackAction[];
  version: "1.0";
  hash?: string;
  signature?: string;
}

// ==================== History Logging Types ====================

export interface HistoryEntry {
  id: string;
  timestamp: string;
  operation: string;
  source: "manual" | "scheduled";
  status: "success" | "error" | "partial";
  durationMs: number;
  filesProcessed?: number;
  filesSkipped?: number;
  details?: string;
  error?: {
    message: string;
    code?: string;
  };
}

export interface HistoryQuery {
  limit?: number;
  since?: string;
  until?: string;
  operation?: string;
  status?: "success" | "error" | "partial";
  source?: "manual" | "scheduled";
}

export interface HistoryResult {
  entries: HistoryEntry[];
  total: number;
  hasMore: boolean;
}

export type PrivacyMode = "full" | "redacted" | "none";

// ==================== Smart Suggest Types ====================

export interface DirectoryHealthReport {
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  metrics: {
    fileTypeEntropy: { score: number; details: string };
    namingConsistency: { score: number; details: string };
    depthBalance: { score: number; details: string };
    duplicateRatio: { score: number; details: string };
    misplacedFiles: { score: number; details: string };
  };
  suggestions: Array<{
    priority: "high" | "medium" | "low";
    message: string;
    suggestedTool?: string;
    suggestedArgs?: Record<string, unknown>; // Validated by caller
  }>;
  quickWins?: Array<{
    action: string;
    estimatedScoreImprovement: number;
    tool: string;
    args: Record<string, unknown>; // Validated via Zod schema in tool handlers
  }>;
}

export interface SmartSuggestOptions {
  includeSubdirs?: boolean;
  includeDuplicates?: boolean;
  maxFiles?: number;
  timeoutSeconds?: number;
  sampleRate?: number;
  useCache?: boolean;
}
