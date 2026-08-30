/**
 * File Organizer MCP Server v5.0.0
 * Edge building and union-find clustering for project detection.
 */

import type { DetectedProject, ProjectDetectionOptions } from "./project.js";
import type { FileSignals } from "./project.js";
import {
  extractMarkers,
  sanitizeProjectName,
} from "./tokens.js";

interface Edge {
  from: number;
  to: number;
  weight: number;
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

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function buildEdges(
  signals: FileSignals[],
  opts: Required<ProjectDetectionOptions>,
): Edge[] {
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
      Math.abs(sa.mtimeMs - sb.mtimeMs) <= opts.timeWindowMs;

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
      .slice(0, opts.maxEdgeTargets);
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

export function cluster(
  signals: FileSignals[],
  edges: Edge[],
  opts: Required<ProjectDetectionOptions>,
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

  // All edges participate in the union-find clustering. A group is later
  // rejected if its average edge weight falls below minGroupConfidence.
  for (const e of edges) {
    union(e.from, e.to);
  }

  const rootMembers = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!rootMembers.has(root)) rootMembers.set(root, []);
    rootMembers.get(root)!.push(i);
  }

  const rootEdgeWeights = new Map<number, number[]>();
  for (const e of edges) {
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
    if (confidence < opts.minGroupConfidence) continue;

    const groupSignals = members.map((i) => signals[i]!);
    projects.push({
      name: nameGroup(groupSignals),
      confidence: round(confidence),
      files: members.map((i) => ({
        path: signals[i]!.path,
        name: signals[i]!.name,
        signal: describeSignal(groupSignals, signals[i]!),
      })),
    });
  }

  return projects.sort((a, b) => b.confidence - a.confidence);
}

function nameGroup(group: FileSignals[]): string {
  const nameCount = new Map<string, number>();
  for (const s of group) {
    for (const token of s.nameTokens) {
      nameCount.set(token, (nameCount.get(token) ?? 0) + 1);
    }
  }
  let bestName = "";
  let bestCount = 0;
  for (const [token, count] of nameCount) {
    if (count > bestCount || (count === bestCount && token < bestName)) {
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
    if (count > bestMarkerCount || (count === bestMarkerCount && marker < bestMarker)) {
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
    if (count > bestTermCount || (count === bestTermCount && term < bestTerm)) {
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

function describeSignal(group: FileSignals[], file: FileSignals): string {
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
    if (file.contentTerms && other.contentTerms) {
      for (const term of file.contentTerms) {
        if (other.contentTerms.has(term)) {
          return `shared content term "${term}"`;
        }
      }
    }
  }
  return "related file";
}
