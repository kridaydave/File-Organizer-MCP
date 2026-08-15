/**
 * Tests for ProjectDetectorService
 * Phase 3 project/context-based organization detection
 */

import {
  GENERIC_NAME_TOKENS,
  MARKER_PATTERN,
  ProjectDetectorService,
  sanitizeProjectName,
  tokenizeContent,
  tokenizeName,
  type DetectedProject,
  type ProjectDetectionOptions,
} from "../../../src/services/project-detector.service.js";
import { STOP_WORDS } from "../../../src/services/topic-extractor.service.js";

interface TestFile {
  path: string;
  name: string;
}

function createService(
  textByPath: Map<string, string>,
  mtimeByPath: Map<string, number>,
  options?: ProjectDetectionOptions,
): ProjectDetectorService {
  return new ProjectDetectorService(options, {
    extractText: async (p: string) => ({ text: textByPath.get(p) ?? "" }),
    getMtime: async (p: string) => mtimeByPath.get(p) ?? 0,
  });
}

function fileList(names: string[], dir = "/tmp/test"): TestFile[] {
  return names.map((name) => ({ path: `${dir}/${name}`, name }));
}

describe("ProjectDetectorService", () => {
  describe("name token grouping", () => {
    it("should group files sharing a rare name token", async () => {
      const names = ["apollo_plan.md", "apollo_logo.png", "orion_report.md"];
      const files = fileList(names);
      const service = createService(new Map(), new Map());

      const projects = await service.detect(files);

      expect(projects).toHaveLength(1);
      expect(projects[0]!.name).toBe("Apollo");
      const memberNames = projects[0]!.files.map((f) => f.name);
      expect(memberNames).toContain("apollo_plan.md");
      expect(memberNames).toContain("apollo_logo.png");
      expect(memberNames).not.toContain("orion_report.md");
    });

    it("should not group files with generic name tokens", async () => {
      const names = ["IMG_0042.png", "IMG_0057.png"];
      const files = fileList(names);
      const service = createService(
        new Map(),
        new Map(names.map((n) => [`/tmp/test/${n}`, 1000])),
      );

      const projects = await service.detect(files);
      expect(projects).toHaveLength(0);
    });

    it("should not group singletons with no shared signal", async () => {
      const names = ["apollo_plan.md", "orion_report.md", "zeus_notes.txt"];
      const service = createService(new Map(), new Map());

      const projects = await service.detect(fileList(names));
      expect(projects).toHaveLength(0);
    });
  });

  describe("content-blind file rule", () => {
    it("should let a content-blind file join via shared name token", async () => {
      const names = ["apollo_design.md", "apollo_mockup.png", "unrelated.png"];
      const files = fileList(names);
      // unrelated.png shares the same mtime as apollo_mockup.png but no name token
      const mtimes = new Map<string, number>();
      for (const n of names) {
        mtimes.set(`/tmp/test/${n}`, 1000);
      }
      const service = createService(new Map(), mtimes);

      const projects = await service.detect(files);

      expect(projects).toHaveLength(1);
      const memberNames = projects[0]!.files.map((f) => f.name);
      expect(memberNames).toContain("apollo_design.md");
      expect(memberNames).toContain("apollo_mockup.png");
      expect(memberNames).not.toContain("unrelated.png");
    });

    it("should NOT group content-blind files on time alone", async () => {
      const names = ["photo1.png", "photo2.png"];
      const files = fileList(names);
      const mtimes = new Map<string, number>();
      for (const n of names) {
        mtimes.set(`/tmp/test/${n}`, 5000);
      }
      const service = createService(new Map(), mtimes);

      const projects = await service.detect(files);
      expect(projects).toHaveLength(0);
    });
  });

  describe("content term grouping", () => {
    it("should group text files sharing rare content terms", async () => {
      const names = ["alpha.txt", "beta.txt"];
      const files = fileList(names);
      const text = new Map<string, string>();
      for (const n of names) {
        text.set(
          `/tmp/test/${n}`,
          "quantum entanglement zorponomics notes for the record",
        );
      }
      const service = createService(text, new Map());

      const projects = await service.detect(files);

      expect(projects).toHaveLength(1);
      expect(projects[0]!.files).toHaveLength(2);
    });
  });

  describe("marker grouping", () => {
    it("should group files sharing an identifier marker", async () => {
      const files = fileList(["a.pdf", "b.pdf"]);
      const text = new Map<string, string>([
        [
          "/tmp/test/a.pdf",
          "REF-9999 alpha bravo charlie delta echo foxtrot golf hotel",
        ],
        [
          "/tmp/test/b.pdf",
          "REF-9999 india juliet kilo lima mike november oscar papa",
        ],
      ]);
      const service = createService(text, new Map());

      const projects = await service.detect(files);

      expect(projects).toHaveLength(1);
      expect(projects[0]!.files).toHaveLength(2);
      expect(projects[0]!.name).toBe("REF-9999");
    });

    it("should not treat a single-occurrence marker as a signal", async () => {
      const files = fileList(["a.pdf", "b.txt"]);
      const text = new Map<string, string>([
        [
          "/tmp/test/a.pdf",
          "REF-9999 alpha bravo charlie delta echo foxtrot golf hotel",
        ],
        ["/tmp/test/b.txt", "nothing in common here at all"],
      ]);
      const service = createService(text, new Map());

      const projects = await service.detect(files);
      expect(projects).toHaveLength(0);
    });
  });

  describe("edge cases", () => {
    it("should return empty for fewer than two files", async () => {
      const service = createService(new Map(), new Map());
      expect(await service.detect([])).toEqual([]);
      expect(await service.detect(fileList(["solo.txt"]))).toEqual([]);
    });

    it("should skip detection above maxFilesToPair", async () => {
      const service = createService(new Map(), new Map(), {
        maxFilesToPair: 3,
      });
      const files = fileList(["a_1.txt", "a_2.txt", "a_3.txt", "a_4.txt"]);
      expect(await service.detect(files)).toEqual([]);
    });
  });
});

describe("sanitizeProjectName", () => {
  it("should neutralize Windows reserved names", () => {
    expect(sanitizeProjectName("CON")).toBe("CON_folder");
    expect(sanitizeProjectName("nul")).toBe("nul_folder");
  });

  it("should strip trailing dots and spaces", () => {
    expect(sanitizeProjectName("report.")).toBe("report");
    expect(sanitizeProjectName("notes.. ")).toBe("notes");
  });

  it("should replace illegal characters", () => {
    expect(sanitizeProjectName("My/Project:Name")).toBe("My Project Name");
  });

  it("should cap length", () => {
    const long = "a".repeat(60);
    expect(sanitizeProjectName(long)).toHaveLength(40);
  });

  it("should fall back to Project for empty input", () => {
    expect(sanitizeProjectName("")).toBe("Project");
    expect(sanitizeProjectName("   ")).toBe("Project");
  });
});

describe("tokenizer functions", () => {
  it("tokenizeName splits camelCase and letter/digit boundaries", () => {
    expect(tokenizeName("ApolloPlanV2.docx")).toEqual(["apollo", "plan"]);
  });

  it("tokenizeName drops digit-only and short tokens", () => {
    expect(tokenizeName("2024.pdf")).toEqual([]);
    expect(tokenizeName("a_b.txt")).toEqual([]);
  });

  it("tokenizeContent keeps words of 3+ chars and removes stop words", () => {
    expect(tokenizeContent("the quick brown fox")).toEqual([
      "quick",
      "brown",
      "fox",
    ]);
    expect(tokenizeContent("i am a")).toEqual([]);
  });
});

describe("maxEdgeTargets", () => {
  const cliqueNames = [
    "alpha_beta_zeta_f0.txt",
    "alpha_beta_eta_f1.txt",
    "gamma_delta_zeta_f2.txt",
    "gamma_delta_eta_f3.txt",
  ];

  it("limits the edges kept per file, splitting the group", async () => {
    const service = createService(new Map(), new Map(), { maxEdgeTargets: 1 });
    const projects = await service.detect(fileList(cliqueNames));

    expect(projects).toHaveLength(2);
    const sizes = projects.map((p) => p.files.length).sort((a, b) => a - b);
    expect(sizes).toEqual([2, 2]);
  });

  it("keeps all edges by default, forming one group", async () => {
    const service = createService(new Map(), new Map());
    const projects = await service.detect(fileList(cliqueNames));

    expect(projects).toHaveLength(1);
    expect(projects[0]!.files).toHaveLength(4);
  });
});

describe("minGroupConfidence", () => {
  it("rejects a group whose average edge weight is below the floor", async () => {
    const service = createService(new Map(), new Map(), {
      minGroupConfidence: 5,
    });
    const projects = await service.detect(
      fileList(["zeta_one.txt", "zeta_two.txt"]),
    );
    expect(projects).toHaveLength(0);
  });

  it("keeps the group when the average meets the floor", async () => {
    const service = createService(new Map(), new Map());
    const projects = await service.detect(
      fileList(["zeta_one.txt", "zeta_two.txt"]),
    );
    expect(projects).toHaveLength(1);
  });
});

interface RefSignal {
  index: number;
  path: string;
  name: string;
  nameTokens: Set<string>;
  contentTerms: Set<string> | null;
  markers: Set<string>;
  mtimeMs: number;
  hasText: boolean;
}

interface RefEdge {
  from: number;
  to: number;
  weight: number;
}

const REF_DEFAULT_OPTIONS = {
  maxEdgeTargets: 5,
  minGroupConfidence: 1.0,
  nameTokenMaxDf: 3,
  contentTermMaxDf: 4,
  contentTermLimit: 30,
  timeWindowMs: 24 * 60 * 60 * 1000,
  maxFilesToPair: 2500,
};

function extractMarkersRef(text: string): string[] {
  return text.toUpperCase().match(MARKER_PATTERN) ?? [];
}

function intersectionSizeRef(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let count = 0;
  for (const item of small) {
    if (large.has(item)) count++;
  }
  return count;
}

async function refCollectSignals(
  files: TestFile[],
  opts: typeof REF_DEFAULT_OPTIONS,
  textByPath: Map<string, string>,
  mtimeByPath: Map<string, number>,
): Promise<RefSignal[]> {
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

  const signals: RefSignal[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    const nameTokens = new Set(
      Array.from(rawNameTokens[i]!).filter(
        (t) => (nameDf.get(t) ?? 0) <= opts.nameTokenMaxDf,
      ),
    );

    const markers = new Set<string>();
    for (const marker of extractMarkersRef(file.name)) {
      markers.add(marker);
    }

    let contentTerms: Set<string> | null = null;
    let mtimeMs = 0;
    let extracted: string;
    try {
      mtimeMs = mtimeByPath.get(file.path) ?? 0;
      extracted = textByPath.get(file.path) ?? "";
    } catch {
      extracted = "";
    }

    if (extracted && extracted.trim().length >= 30) {
      contentTerms = new Set(tokenizeContent(extracted));
      for (const marker of extractMarkersRef(extracted)) {
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

function refBuildEdgesPairwise(
  signals: RefSignal[],
  opts: typeof REF_DEFAULT_OPTIONS,
): RefEdge[] {
  const n = signals.length;
  const candidates: RefEdge[][] = Array.from({ length: n }, () => []);

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = signals[i]!;
      const b = signals[j]!;

      const sharedName = intersectionSizeRef(a.nameTokens, b.nameTokens);
      const sharedMarker = intersectionSizeRef(a.markers, b.markers);
      const sharedContent =
        a.hasText && b.hasText
          ? intersectionSizeRef(a.contentTerms!, b.contentTerms!)
          : 0;
      const timeClose =
        a.mtimeMs > 0 &&
        b.mtimeMs > 0 &&
        Math.abs(a.mtimeMs - b.mtimeMs) <= opts.timeWindowMs;

      let allowed: boolean;
      if (!a.hasText || !b.hasText) {
        allowed = sharedName >= 1 || sharedMarker >= 1;
      } else {
        allowed = sharedName >= 1 || sharedContent >= 2 || sharedMarker >= 1;
      }
      if (!allowed) continue;

      let weight = sharedName * 1.5 + sharedMarker * 2 + sharedContent;
      if (timeClose) weight += 0.5;

      candidates[i]!.push({ from: i, to: j, weight });
      candidates[j]!.push({ from: j, to: i, weight });
    }
  }

  const edges: RefEdge[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < n; i++) {
    const top = candidates[i]!.sort(
      (x, y) => y.weight - x.weight || x.to - y.to,
    ).slice(0, opts.maxEdgeTargets);
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

function refNameGroup(group: RefSignal[]): string {
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
    if (
      count > bestMarkerCount ||
      (count === bestMarkerCount && marker < bestMarker)
    ) {
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

function refDescribeSignal(group: RefSignal[], file: RefSignal): string {
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

function refCluster(
  signals: RefSignal[],
  edges: RefEdge[],
  opts: typeof REF_DEFAULT_OPTIONS,
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
      name: refNameGroup(groupSignals),
      confidence: Math.round(confidence * 100) / 100,
      files: members.map((i) => ({
        path: signals[i]!.path,
        name: signals[i]!.name,
        signal: refDescribeSignal(groupSignals, signals[i]!),
      })),
    });
  }

  return projects.sort((a, b) => b.confidence - a.confidence);
}

async function detectPairwiseReference(
  files: TestFile[],
  opts: typeof REF_DEFAULT_OPTIONS,
  textByPath: Map<string, string>,
  mtimeByPath: Map<string, number>,
): Promise<DetectedProject[]> {
  if (files.length < 2) return [];
  if (files.length > opts.maxFilesToPair) return [];
  const signals = await refCollectSignals(files, opts, textByPath, mtimeByPath);
  const edges = refBuildEdgesPairwise(signals, opts);
  return refCluster(signals, edges, opts);
}

const PROJECT_WORDS = [
  "apollo",
  "beacon",
  "cedar",
  "dove",
  "elm",
  "falcon",
  "gale",
  "hawk",
  "iris",
  "jade",
  "kite",
  "luma",
  "moss",
  "nova",
  "onyx",
  "pixel",
  "quill",
  "rune",
  "storm",
  "tide",
  "ulysses",
  "vista",
  "willow",
  "xenon",
  "yarrow",
];

function buildCorpus(): {
  files: TestFile[];
  textByPath: Map<string, string>;
  mtimeByPath: Map<string, number>;
} {
  const files: TestFile[] = [];
  const textByPath = new Map<string, string>();
  const mtimeByPath = new Map<string, number>();

  for (let p = 0; p < PROJECT_WORDS.length; p++) {
    const word = PROJECT_WORDS[p]!;
    const mtime = 1_000_000 + p * 1000;
    const text =
      `${word}theme ${word}core ${word}build ${word}plan ${word}spec ` +
      `REF${1000 + p} filler${p}a filler${p}b`;

    for (const suffix of ["_design.md", "_logo.png", "_notes.txt"]) {
      const name = `${word}${suffix}`;
      const path = `/tmp/corpus/${name}`;
      files.push({ path, name });
      mtimeByPath.set(path, mtime);
      if (suffix !== "_logo.png") {
        textByPath.set(path, text);
      }
    }
  }

  for (let i = 0; i < 1000; i++) {
    const name = `IMG_${String(i).padStart(4, "0")}.png`;
    const path = `/tmp/corpus/${name}`;
    files.push({ path, name });
    mtimeByPath.set(path, 5_000_000);
  }

  for (let i = 0; i < 125; i++) {
    const name = `doc_${i}.txt`;
    const path = `/tmp/corpus/${name}`;
    files.push({ path, name });
    mtimeByPath.set(path, 9_000_000 + i);
    textByPath.set(
      path,
      `exotic${i} quanta${i} zeta${i} omega${i} fragment${i} benchmark${i}`,
    );
  }

  return { files, textByPath, mtimeByPath };
}

function normalizeProjects(
  projects: DetectedProject[],
): Array<{ name: string; confidence: number; files: string[] }> {
  return projects
    .map((p) => ({
      name: p.name,
      confidence: p.confidence,
      files: p.files.map((f) => f.name).sort(),
    }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

describe("inverted index equivalence with pairwise reference", () => {
  it("should produce identical project groups on a 1200-file corpus", async () => {
    const { files, textByPath, mtimeByPath } = buildCorpus();
    expect(files.length).toBeGreaterThanOrEqual(1200);

    const options = {
      maxEdgeTargets: 5,
      minGroupConfidence: 1.0,
      nameTokenMaxDf: 3,
      contentTermMaxDf: 4,
      contentTermLimit: 30,
      timeWindowMs: 24 * 60 * 60 * 1000,
      maxFilesToPair: 5000,
    };

    const service = createService(textByPath, mtimeByPath, options);
    const actual = normalizeProjects(await service.detect(files));
    const expected = normalizeProjects(
      await detectPairwiseReference(files, options, textByPath, mtimeByPath),
    );

    expect(actual).toHaveLength(PROJECT_WORDS.length);
    expect(actual).toEqual(expected);
  });
});
