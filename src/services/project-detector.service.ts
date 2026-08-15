/**
 * File Organizer MCP Server v3.5.0
 * Project Detector Service
 *
 * Phase 3 (Project/Context-Based Organization): detects related files across
 * file types and groups them into projects using deterministic, local-only
 * signals. No ML, no network, no behavioral tracking.
 *
 * Signal model (see CD_res/implementation/project-based-organization):
 * - Shared rare filename tokens are the strong cross-type anchor (.docx, .tsx,
 *   .png all have names). Tokens are weighted by corpus rarity so generic
 *   prefixes (IMG_, Copy, final) do not group unrelated files.
 * - Shared rare content terms are a moderate recall signal for text-bearing
 *   files, gated by an IDF floor so shared boilerplate is ignored.
 * - Explicit identifier markers ([A-Z]{2,3}\d{3,7}) are strong edges with a
 *   min-occurrence floor.
 * - A content-blind file (binary, image, failed extraction) only joins via a
 *   shared rare name token or shared marker, never on time alone.
 * - Files are clustered with union-find; a group is rejected if its average
 *   edge weight falls below the configured floor.
 */

import fs from "fs/promises";
import path from "path";
import { STOP_WORDS } from "./topic-extractor.service.js";
import { textExtractionService } from "./text-extraction.service.js";
import { logger } from "../utils/logger.js";

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

export const GENERIC_NAME_TOKENS = new Set([
  "img",
  "image",
  "photo",
  "pic",
  "screenshot",
  "screen",
  "capture",
  "copy",
  "final",
  "new",
  "tmp",
  "temp",
  "backup",
  "draft",
  "old",
  "file",
  "document",
  "doc",
  "pdf",
  "txt",
  "md",
  "docx",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "csv",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "zip",
  "tar",
  "gz",
  "rar",
  "7z",
  "mp3",
  "mp4",
  "wav",
  "test",
  "untitled",
  "unknown",
  "download",
  "downloads",
  "export",
  "import",
]);

export const MARKER_PATTERN = /\b[A-Z]{2,3}[-_]?\d{3,7}\b/g;

interface FileSignals {
  index: number;
  path: string;
  name: string;
  nameTokens: Set<string>;
  contentTerms: Set<string> | null;
  markers: Set<string>;
  mtimeMs: number;
  hasText: boolean;
}

interface Edge {
  from: number;
  to: number;
  weight: number;
}

export function tokenizeName(name: string): string[] {
  const stem = name.replace(/\.[^.]+$/, "");
  let s = stem;
  s = s.replace(/([a-z\d])([A-Z])/g, "$1 $2");
  s = s.replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
  s = s.replace(/([a-zA-Z])(\d)/g, "$1 $2");
  s = s.replace(/(\d)([a-zA-Z])/g, "$1 $2");
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2 && !/^\d+$/.test(token));
}

export function tokenizeContent(text: string): string[] {
  const words = text.toLowerCase().match(/[a-z][a-z0-9]{2,}/g) ?? [];
  return words.filter((word) => !STOP_WORDS.has(word));
}

function pushIndex(
  postings: Map<string, number[]>,
  key: string,
  index: number,
): void {
  const list = postings.get(key);
  if (list) {
    list.push(index);
  } else {
    postings.set(key, [index]);
  }
}

function recordPostingPairs(
  pairCounts: Map<string, { name: number; marker: number; content: number }>,
  postings: Map<string, number[]>,
  field: "name" | "marker" | "content",
): void {
  for (const indices of postings.values()) {
    if (indices.length < 2) continue;
    for (let p = 0; p < indices.length - 1; p++) {
      for (let q = p + 1; q < indices.length; q++) {
        const x = indices[p]!;
        const y = indices[q]!;
        const lo = x < y ? x : y;
        const hi = x < y ? y : x;
        const key = `${lo}-${hi}`;
        let entry = pairCounts.get(key);
        if (!entry) {
          entry = { name: 0, marker: 0, content: 0 };
          pairCounts.set(key, entry);
        }
        entry[field]++;
      }
    }
  }
}

function extractMarkers(text: string): string[] {
  return text.toUpperCase().match(MARKER_PATTERN) ?? [];
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Sanitize a detected project name into a safe folder name.
 * Handles Windows reserved names, illegal characters, trailing dots/spaces,
 * and length limits.
 */
export function sanitizeProjectName(raw: string): string {
  let name = raw
    .trim()
    .replace(/[<>:"/\\|?*]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[.\s]+$/g, "")
    .trim();

  if (!name) {
    name = "Project";
  }

  const reserved = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
  if (reserved.test(name)) {
    name = `${name}_folder`;
  }

  if (name.length > 40) {
    name = name.slice(0, 40).trim();
  }

  return name;
}

export class ProjectDetectorService {
  private readonly options: Required<ProjectDetectionOptions>;
  private readonly extractText: (filePath: string) => Promise<{ text: string }>;
  private readonly getMtime: (filePath: string) => Promise<number>;

  constructor(
    options?: ProjectDetectionOptions,
    deps?: {
      extractText?: (filePath: string) => Promise<{ text: string }>;
      getMtime?: (filePath: string) => Promise<number>;
    },
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.extractText =
      deps?.extractText ?? (async (p) => textExtractionService.extract(p));
    this.getMtime = deps?.getMtime ?? (async (p) => (await fs.stat(p)).mtimeMs);
  }

  /**
   * Detect project groups from a flat file list.
   * @param files - scanned files with absolute path and name
   * @returns detected projects, each with a folder name, confidence, and files
   */
  async detect(
    files: Array<{ path: string; name: string }>,
  ): Promise<DetectedProject[]> {
    if (files.length < 2) {
      return [];
    }
    if (files.length > this.options.maxFilesToPair) {
      logger.warn(
        `Project detection skipped for ${files.length} files (max ${this.options.maxFilesToPair})`,
      );
      return [];
    }

    const signals = await this.collectSignals(files);
    const edges = this.buildEdges(signals);
    return this.cluster(signals, edges);
  }

  private async collectSignals(
    files: Array<{ path: string; name: string }>,
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
          (t) => (nameDf.get(t) ?? 0) <= this.options.nameTokenMaxDf,
        ),
      );

      const markers = new Set<string>();
      for (const marker of extractMarkers(file.name)) {
        markers.add(marker);
      }

      let contentTerms: Set<string> | null = null;
      let mtimeMs = 0;
      let extracted: string;
      try {
        mtimeMs = await this.getMtime(file.path);
        const result = await this.extractText(file.path);
        extracted = result?.text ?? "";
      } catch {
        extracted = "";
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
      const dfFloor = Math.max(1, Math.floor(contentFileCount * 0.5));
      const maxDf = Math.max(this.options.contentTermMaxDf, dfFloor);
      for (const s of signals) {
        if (!s.contentTerms) continue;
        const rare = Array.from(s.contentTerms).filter(
          (t) => (termDf.get(t) ?? 0) <= maxDf,
        );
        s.contentTerms = new Set(rare.slice(0, this.options.contentTermLimit));
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

  /**
   * Build candidate edges using an inverted index over name tokens, markers,
   * and content terms instead of a pairwise sweep.
   *
   * For each signal, a posting list of file indices is collected. Any pair of
   * files sharing a signal is enumerated from its posting list, so cost is
   * sum of C(df, 2) per signal rather than O(n^2). Generic name tokens are
   * already filtered and content terms are df-capped, so index size is small.
   *
   * The selected edge set is exactly equivalent to the previous O(n^2)
   * pairwise sweep: every pair with a shared signal is visited once, the
   * same `allowed`/weight logic applies, and per-file top-N selection keeps
   * the same ordering (weight desc, then partner index asc).
   */
  private buildEdges(signals: FileSignals[]): Edge[] {
    const n = signals.length;

    const namePostings = new Map<string, number[]>();
    const markerPostings = new Map<string, number[]>();
    const contentPostings = new Map<string, number[]>();

    for (const s of signals) {
      for (const token of s.nameTokens) {
        pushIndex(namePostings, token, s.index);
      }
      for (const marker of s.markers) {
        pushIndex(markerPostings, marker, s.index);
      }
      if (s.contentTerms) {
        for (const term of s.contentTerms) {
          pushIndex(contentPostings, term, s.index);
        }
      }
    }

    const pairCounts = new Map<
      string,
      { name: number; marker: number; content: number }
    >();
    recordPostingPairs(pairCounts, namePostings, "name");
    recordPostingPairs(pairCounts, markerPostings, "marker");
    recordPostingPairs(pairCounts, contentPostings, "content");

    const candidates: Edge[][] = Array.from({ length: n }, () => []);
    for (const [key, counts] of pairCounts) {
      const dash = key.indexOf("-");
      const a = Number(key.slice(0, dash));
      const b = Number(key.slice(dash + 1));
      const sa = signals[a]!;
      const sb = signals[b]!;

      const sharedName = counts.name;
      const sharedMarker = counts.marker;
      const sharedContent = counts.content;
      const timeClose =
        sa.mtimeMs > 0 &&
        sb.mtimeMs > 0 &&
        Math.abs(sa.mtimeMs - sb.mtimeMs) <= this.options.timeWindowMs;

      let allowed: boolean;
      if (!sa.hasText || !sb.hasText) {
        allowed = sharedName >= 1 || sharedMarker >= 1;
      } else {
        allowed = sharedName >= 1 || sharedContent >= 2 || sharedMarker >= 1;
      }
      if (!allowed) continue;

      let weight = sharedName * 1.5 + sharedMarker * 2 + sharedContent;
      if (timeClose) weight += 0.5;

      candidates[a]!.push({ from: a, to: b, weight });
      candidates[b]!.push({ from: b, to: a, weight });
    }

    const edges: Edge[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < n; i++) {
      const top = candidates[i]!
        .sort((x, y) => y.weight - x.weight || x.to - y.to)
        .slice(0, this.options.maxEdgeTargets);
      for (const e of top) {
        const from = Math.min(e.from, e.to);
        const to = Math.max(e.from, e.to);
        const key = `${from}-${to}`;
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push({ from, to, weight: e.weight });
      }
    }

    return edges;
  }

  private cluster(
    signals: FileSignals[],
    edges: Edge[],
  ): DetectedProject[] {
    const n = signals.length;
    const parent = Array.from({ length: n }, (_, i) => i);
    const find = (x: number): number => {
      let root = x;
      while (parent[root] !== root) {
        const next = parent[root]!;
        parent[root] = parent[next]!;
        root = next;
      }
      return root;
    };
    const union = (a: number, b: number): void => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent[rb] = ra;
    };

    const usableEdges = edges.filter(
      (e) => e.weight >= this.options.minGroupConfidence,
    );
    for (const e of usableEdges) {
      union(e.from, e.to);
    }

    const rootMembers = new Map<number, number[]>();
    for (let i = 0; i < n; i++) {
      const root = find(i);
      if (!rootMembers.has(root)) rootMembers.set(root, []);
      rootMembers.get(root)!.push(i);
    }

    const rootEdgeWeights = new Map<number, number[]>();
    for (const e of usableEdges) {
      const root = find(e.from);
      if (find(e.to) !== root) continue;
      if (!rootEdgeWeights.has(root)) rootEdgeWeights.set(root, []);
      rootEdgeWeights.get(root)!.push(e.weight);
    }

    const projects: DetectedProject[] = [];
    for (const [root, members] of rootMembers) {
      if (members.length < 2) continue;
      const weights = rootEdgeWeights.get(root) ?? [];
      if (weights.length === 0) continue;
      const confidence = weights.reduce((sum, w) => sum + w, 0) / weights.length;
      if (confidence < this.options.minGroupConfidence) continue;

      const groupSignals = members.map((i) => signals[i]!);
      projects.push({
        name: this.nameGroup(groupSignals),
        confidence: round(confidence),
        files: members.map((i) => ({
          path: signals[i]!.path,
          name: signals[i]!.name,
          signal: this.describeSignal(groupSignals, signals[i]!),
        })),
      });
    }

    return projects.sort((a, b) => b.confidence - a.confidence);
  }

  private nameGroup(group: FileSignals[]): string {
    const nameCount = new Map<string, number>();
    for (const s of group) {
      for (const token of s.nameTokens) {
        nameCount.set(token, (nameCount.get(token) ?? 0) + 1);
      }
    }
    let bestName = "";
    let bestCount = 0;
    for (const [token, count] of nameCount) {
      if (count > bestCount) {
        bestName = token;
        bestCount = count;
      }
    }
    if (bestName) {
      return sanitizeProjectName(
        bestName.charAt(0).toUpperCase() + bestName.slice(1),
      );
    }

    const markerCount = new Map<string, number>();
    for (const s of group) {
      for (const marker of s.markers) {
        markerCount.set(marker, (markerCount.get(marker) ?? 0) + 1);
      }
    }
    let bestMarker = "";
    let bestMarkerCount = 0;
    for (const [marker, count] of markerCount) {
      if (count > bestMarkerCount) {
        bestMarker = marker;
        bestMarkerCount = count;
      }
    }
    if (bestMarker) return sanitizeProjectName(bestMarker);

    const termCount = new Map<string, number>();
    for (const s of group) {
      if (!s.contentTerms) continue;
      for (const term of s.contentTerms) {
        termCount.set(term, (termCount.get(term) ?? 0) + 1);
      }
    }
    let bestTerm = "";
    let bestTermCount = 0;
    for (const [term, count] of termCount) {
      if (count > bestTermCount) {
        bestTerm = term;
        bestTermCount = count;
      }
    }
    if (bestTerm) {
      return sanitizeProjectName(
        bestTerm.charAt(0).toUpperCase() + bestTerm.slice(1),
      );
    }

    return sanitizeProjectName("Project");
  }

  private describeSignal(group: FileSignals[], file: FileSignals): string {
    for (const other of group) {
      if (other.index === file.index) continue;
      for (const token of file.nameTokens) {
        if (other.nameTokens.has(token)) {
          return `shared name token "${token}"`;
        }
      }
      for (const marker of file.markers) {
        if (other.markers.has(marker)) {
          return `shared marker "${marker}"`;
        }
      }
      if (file.hasText && other.hasText && other.contentTerms) {
        for (const term of file.contentTerms!) {
          if (other.contentTerms.has(term)) {
            return `shared content term "${term}"`;
          }
        }
      }
    }
    return "related file";
  }
}

export const projectDetectorService = new ProjectDetectorService();