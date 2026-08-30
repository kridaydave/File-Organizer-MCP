/**
 * Tests for core/detect project detection (ported from the v3 project-detector
 * service tests, adapted to the v5 pure-function shape with injected deps).
 */

import { detectProjects } from "../../../../src/core/detect/project.js";
import {
  GENERIC_NAME_TOKENS,
  sanitizeProjectName,
  tokenizeContent,
  tokenizeName,
} from "../../../../src/core/detect/tokens.js";

/** Injected dep set: no fs access, deterministic mtime. */
function silentDeps(text: Record<string, string> = {}) {
  return {
    extractText: async (p: string) => text[p] ?? "",
    getMtime: async () => 1000,
  };
}

describe("tokenizeName", () => {
  it("splits camelCase, letter/digit boundaries and separators", () => {
    // Letter/digit boundaries split, then digit-only and single-char tokens drop.
    expect(tokenizeName("Q4-ReportFinal_v2.docx")).toEqual(["report", "final"]);
  });

  it("drops pure digit and single-char tokens", () => {
    expect(tokenizeName("1 a ok.txt")).toEqual(["ok"]);
  });
});

describe("tokenizeContent", () => {
  it("drops stop words and short words", () => {
    expect(tokenizeContent("The quick brown fox is on the log")).toEqual([
      "quick",
      "brown",
      "fox",
      "log",
    ]);
  });
});

describe("GENERIC_NAME_TOKENS", () => {
  it("contains the usual camera/copy noise", () => {
    expect(GENERIC_NAME_TOKENS.has("img")).toBe(true);
    expect(GENERIC_NAME_TOKENS.has("copy")).toBe(true);
    expect(GENERIC_NAME_TOKENS.has("screenshot")).toBe(true);
  });
});

describe("sanitizeProjectName", () => {
  it("strips illegal characters and trailing dots", () => {
    expect(sanitizeProjectName('  My: Project?. ')).toBe("My Project");
  });

  it("handles Windows reserved names", () => {
    expect(sanitizeProjectName("CON")).toBe("CON_folder");
    expect(sanitizeProjectName("com1")).toBe("com1_folder");
  });

  it("falls back to Project for empty names", () => {
    expect(sanitizeProjectName("   ")).toBe("Project");
  });

  it("caps length at 40 characters", () => {
    const long = "x".repeat(60);
    expect(sanitizeProjectName(long)).toHaveLength(40);
  });
});

describe("detectProjects", () => {
  it("returns nothing for fewer than two files", async () => {
    const projects = await detectProjects(
      [{ path: "/t/a.txt", name: "alpha-report.txt" }],
      undefined,
      silentDeps(),
    );
    expect(projects).toEqual([]);
  });

  it("returns nothing above maxFilesToPair", async () => {
    const files = Array.from({ length: 10 }, (_, i) => ({
      path: `/t/f${i}.txt`,
      name: `f${i}.txt`,
    }));
    const projects = await detectProjects(
      files,
      { maxFilesToPair: 5 },
      silentDeps(),
    );
    expect(projects).toEqual([]);
  });

  it("groups files sharing a rare name token across types", async () => {
    const files = [
      { path: "/t/aurora-notes.txt", name: "aurora-notes.txt" },
      { path: "/t/aurora-photo.png", name: "aurora-photo.png" },
      { path: "/t/unrelated.pdf", name: "unrelated.pdf" },
    ];
    const projects = await detectProjects(files, undefined, silentDeps());
    expect(projects).toHaveLength(1);
    expect(projects[0]!.name).toBe("Aurora");
    expect(projects[0]!.files).toHaveLength(2);
    expect(projects[0]!.files.map((f) => f.name).sort()).toEqual([
      "aurora-notes.txt",
      "aurora-photo.png",
    ]);
  });

  it("ignores generic name tokens like IMG or copy", async () => {
    const files = [
      { path: "/t/IMG_0001.png", name: "IMG_0001.png" },
      { path: "/t/IMG_0002.png", name: "IMG_0002.png" },
    ];
    const projects = await detectProjects(files, undefined, silentDeps());
    expect(projects).toEqual([]);
  });

  it("drops name tokens shared by more than nameTokenMaxDf files", async () => {
    const files = [
      { path: "/t/zenith-a.txt", name: "zenith-a.txt" },
      { path: "/t/zenith-b.txt", name: "zenith-b.txt" },
      { path: "/t/zenith-c.txt", name: "zenith-c.txt" },
      { path: "/t/zenith-d.txt", name: "zenith-d.txt" },
    ];
    // df(zenith)=4 > default max 3, so the token is not distinctive.
    const projects = await detectProjects(files, undefined, silentDeps());
    expect(projects).toEqual([]);
  });

  it("groups by shared identifier markers", async () => {
    const files = [
      { path: "/t/summary-ABC123.txt", name: "summary-ABC123.txt" },
      { path: "/t/photo-ABC123.png", name: "photo-ABC123.png" },
    ];
    const projects = await detectProjects(files, undefined, silentDeps());
    expect(projects).toHaveLength(1);
    // Both the marker and the tokenized "abc" fragment group these files;
    // naming prefers the shared name token ("Abc") over the raw marker.
    expect(projects[0]!.name).toBe("Abc");
  });

  it("groups content-bearing files on shared rare content terms", async () => {
    const shared =
      "quantum flux capacitor calibration reported again by the crew today " +
      "while orbiting; quantum flux readings remained stable throughout.";
    const text: Record<string, string> = {
      "/t/report-one.txt": shared,
      "/t/report-two.txt": shared,
    };
    const files = [
      { path: "/t/report-one.txt", name: "alpha.txt" },
      { path: "/t/report-two.txt", name: "beta.txt" },
    ];
    const projects = await detectProjects(files, undefined, silentDeps(text));
    expect(projects).toHaveLength(1);
    expect(projects[0]!.files).toHaveLength(2);
  });

  it("never groups two content-blind files on time alone", async () => {
    const files = [
      { path: "/t/one.bin", name: "one.bin" },
      { path: "/t/two.bin", name: "two.bin" },
    ];
    const projects = await detectProjects(files, undefined, silentDeps());
    expect(projects).toEqual([]);
  });

  it("rejects groups whose average edge weight is below the floor", async () => {
    const files = [
      { path: "/t/kappa-one.txt", name: "kappa-one.txt" },
      { path: "/t/kappa-two.txt", name: "kappa-two.txt" },
    ];
    // Name-token edge weight is 1.5; floor above that rejects the group.
    const projects = await detectProjects(
      files,
      { minGroupConfidence: 2.5 },
      silentDeps(),
    );
    expect(projects).toEqual([]);
  });

  it("sorts projects by confidence descending", async () => {
    const files = [
      { path: "/t/delta-x.txt", name: "delta-x.txt" },
      { path: "/t/delta-y.png", name: "delta-y.png" },
      { path: "/t/omega-ABC123.txt", name: "omega-ABC123.txt" },
      { path: "/t/omega-ABC123.png", name: "omega-ABC123.png" },
    ];
    const projects = await detectProjects(files, undefined, silentDeps());
    expect(projects).toHaveLength(2);
    // Marker edge (weight 2) outranks the name-token edge (weight 1.5).
    expect(projects[0]!.name).toBe("Abc");
    expect(projects[1]!.name).toBe("Delta");
  });

  it("explains why each file joined its group", async () => {
    const files = [
      { path: "/t/signal-notes.txt", name: "signal-notes.txt" },
      { path: "/t/signal-photo.png", name: "signal-photo.png" },
    ];
    const projects = await detectProjects(files, undefined, silentDeps());
    expect(projects[0]!.files[0]!.signal).toContain("shared name token");
  });
});
