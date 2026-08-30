/**
 * File Organizer MCP Server v5.0.0
 * Project Detection (core, pure)
 *
 * Detects related files across file types and groups them into projects using
 * deterministic, local-only signals. No ML, no network, no behavioral tracking.
 *
 * Signal model:
 * - Shared rare filename tokens are the strong cross-type anchor (.docx, .tsx,
 *   .png all have names). Tokens are weighted by corpus rarity so generic
 *   prefixes (IMG_, Copy, final) do not group unrelated files.
 * - Shared rare content terms are a moderate recall signal for text-like
 *   files (read via core/io readFile, plain text only), gated by an IDF
 *   floor so shared boilerplate is ignored.
 * - Explicit identifier markers ([A-Z]{2,3}\d{3,7}) are strong edges with a
 *   min-occurrence floor.
 * - A content-blind file (binary, image, failed extraction) only joins via a
 *   shared rare name token or shared marker, never on time alone.
 * - Files are clustered with union-find; a group is rejected if its average
 *   edge weight falls below the configured floor.
 */

import fs from "fs/promises";
import path from "path";
import { readFile } from "../io/read-file.js";
import { logger } from "../../utils/logger.js";
import {
  GENERIC_NAME_TOKENS,
  extractMarkers,
  tokenizeContent,
  tokenizeName,
} from "./tokens.js";
import { buildEdges, cluster } from "./cluster.js";

export interface DetectedProjectFile {
  path: string;
  name: string;
  signal: string;
}

export interface DetectedProject {
  name: string;
  confidence: number;
  files: DetectedProjectFile[];
}

export interface ProjectDetectionOptions {
  /** Maximum edges kept per file before clustering */
  maxEdgeTargets?: number;
  /** Minimum average edge weight for a group to be reported */
  minGroupConfidence?: number;
  /** Maximum document frequency for a name token to count as distinctive */
  nameTokenMaxDf?: number;
  /** Maximum document frequency for a content term to be kept (IDF floor) */
  contentTermMaxDf?: number;
  /** Maximum rare content terms kept per file */
  contentTermLimit?: number;
  /** Time window (ms) used as a weak edge co-factor */
  timeWindowMs?: number;
  /** Skip detection entirely above this many files to bound index cost */
  maxFilesToPair?: number;
}

const DEFAULT_OPTIONS: Required<ProjectDetectionOptions> = {
  maxEdgeTargets: 5,
  minGroupConfidence: 1.0,
  nameTokenMaxDf: 3,
  contentTermMaxDf: 4,
  contentTermLimit: 30,
  timeWindowMs: 24 * 60 * 60 * 1000,
  maxFilesToPair: 2500,
};

/** Extensions whose plain text is read for content terms and markers. */
export const TEXT_EXTENSIONS = new Set([
  ".txt", ".md", ".markdown", ".json", ".csv", ".tsv", ".yml", ".yaml",
  ".xml", ".html", ".htm", ".css", ".js", ".mjs", ".cjs", ".jsx",
  ".ts", ".tsx", ".py", ".rb", ".go", ".rs", ".java", ".kt", ".swift",
  ".c", ".h", ".cpp", ".hpp", ".cs", ".php", ".sh", ".sql", ".toml",
  ".ini", ".cfg", ".log",
]);

/** Cap on how many bytes of text are read per file for term extraction. */
const MAX_TEXT_BYTES = 512 * 1024;

export interface FileSignals {
  index: number;
  path: string;
  name: string;
  nameTokens: Set<string>;
  contentTerms: Set<string> | null;
  markers: Set<string>;
  mtimeMs: number;
  hasText: boolean;
}

/**
 * Read text from a file for content-term extraction. Only text-like
 * extensions are read (no binary parsing, no extra deps); failures return
 * empty text so the file stays content-blind.
 */
export async function extractTextContent(filePath: string): Promise<string> {
  if (!TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
    return "";
  }
  try {
    const result = await readFile(filePath, {
      encoding: "utf-8",
      maxBytes: MAX_TEXT_BYTES,
      checksum: false,
    });
    return typeof result.data === "string" ? result.data : "";
  } catch {
    return "";
  }
}

/**
 * Detect project groups from a flat file list.
 * @param files - scanned files with absolute path and name
 * @param options - detection tuning knobs (see DEFAULT_OPTIONS)
 * @param deps - injectable IO for tests; defaults use core/io readFile
 * @returns detected projects, each with a folder name, confidence, and files
 */
export async function detectProjects(
  files: Array<{ path: string; name: string }>,
  options?: ProjectDetectionOptions,
  deps?: {
    extractText?: (filePath: string) => Promise<string>;
    getMtime?: (filePath: string) => Promise<number>;
  },
): Promise<DetectedProject[]> {
  const opts: Required<ProjectDetectionOptions> = {
    ...DEFAULT_OPTIONS,
    ...options,
  };
  const extractText = deps?.extractText ?? extractTextContent;
  const getMtime = deps?.getMtime ?? (async (p) => (await fs.stat(p)).mtimeMs);

  if (files.length < 2) {
    return [];
  }
  if (files.length > opts.maxFilesToPair) {
    logger.warn(
      `Project detection skipped for ${files.length} files (max ${opts.maxFilesToPair})`,
    );
    return [];
  }

  const signals = await collectSignals(files, opts, extractText, getMtime);
  const edges = buildEdges(signals, opts);
  return cluster(signals, edges, opts);
}

async function collectSignals(
  files: Array<{ path: string; name: string }>,
  opts: Required<ProjectDetectionOptions>,
  extractText: (filePath: string) => Promise<string>,
  getMtime: (filePath: string) => Promise<number>,
): Promise<FileSignals[]> {
  const nameDf = new Map<string, number>();
  const rawNameTokens: Set<string>[] = [];

  for (const file of files) {
    const tokens = new Set(
      tokenizeName(file.name).filter((t) => !GENERIC_NAME_TOKENS.has(t)),
    );
    rawNameTokens.push(tokens);
    for (const token of tokens) {
      nameDf.set(token, (nameDf.get(token) ?? 0) + 1);
    }
  }

  const signals: FileSignals[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    const nameTokens = new Set(
      Array.from(rawNameTokens[i]!).filter(
        (t) => (nameDf.get(t) ?? 0) <= opts.nameTokenMaxDf,
      ),
    );

    const markers = new Set<string>();
    for (const marker of extractMarkers(file.name)) {
      markers.add(marker);
    }

    let contentTerms: Set<string> | null = null;
    let mtimeMs = 0;
    let extracted = "";
    try {
      mtimeMs = await getMtime(file.path);
    } catch {
      // keep default mtime 0
    }
    try {
      extracted = await extractText(file.path);
    } catch {
      // keep default extracted text ""
    }

    if (extracted && extracted.trim().length >= 30) {
      contentTerms = new Set(tokenizeContent(extracted));
      for (const marker of extractMarkers(extracted)) {
        markers.add(marker);
      }
    }

    signals.push({
      index: i,
      path: file.path,
      name: file.name,
      nameTokens,
      contentTerms,
      markers,
      mtimeMs,
      hasText: contentTerms !== null,
    });
  }

  const contentFileCount = signals.filter((s) => s.hasText).length;
  if (contentFileCount > 0) {
    const termDf = new Map<string, number>();
    for (const s of signals) {
      if (!s.contentTerms) continue;
      for (const term of s.contentTerms) {
        termDf.set(term, (termDf.get(term) ?? 0) + 1);
      }
    }
    const maxDf = opts.contentTermMaxDf;
    for (const s of signals) {
      if (!s.contentTerms) continue;
      const rare = Array.from(s.contentTerms).filter(
        (t) => (termDf.get(t) ?? 0) <= maxDf,
      );
      s.contentTerms = new Set(rare.slice(0, opts.contentTermLimit));
    }
  }

  const markerDf = new Map<string, number>();
  for (const s of signals) {
    for (const marker of s.markers) {
      markerDf.set(marker, (markerDf.get(marker) ?? 0) + 1);
    }
  }
  for (const s of signals) {
    s.markers = new Set(
      Array.from(s.markers).filter((m) => (markerDf.get(m) ?? 0) >= 2),
    );
  }

  return signals;
}
