import { jest } from "@jest/globals";
import {
  EnhancedVotingSystem,
  WeightedVotingSystem,
  VotingCalculator,
  createDefaultConfig,
  shepherdId,
  ShepherdSpecialty,
  ConflictType,
} from "../../../src/debate/enhanced-voting.js";
import type {
  EnhancedVote,
  Shepherd,
  VotingContext,
  WeightedVotingConfig,
  ShepherdId,
  VoteRecord,
} from "../../../src/debate/enhanced-voting.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeShepherd(
  id: string,
  specialty: ShepherdSpecialty = ShepherdSpecialty.General,
): Shepherd {
  return { id: shepherdId(id), specialty };
}

function makeVote(overrides: Partial<EnhancedVote> = {}): EnhancedVote {
  return {
    approval: 0.8,
    confidence: 0.9,
    concerns: [],
    conditions: [],
    rankedPreferences: [],
    ...overrides,
  };
}

function makeContext(overrides: Partial<VotingContext> = {}): VotingContext {
  return {
    conflictType: ConflictType.General,
    round: 1,
    topic: "test-topic",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// EnhancedVotingSystem
// ---------------------------------------------------------------------------

describe("EnhancedVotingSystem", () => {
  let system: EnhancedVotingSystem;

  beforeEach(() => {
    system = new EnhancedVotingSystem({ totalParticipants: 3 });
  });

  // 1
  it("should accept a valid vote", () => {
    const record = system.castVote(
      makeShepherd("s1"),
      makeVote(),
      makeContext(),
    );
    expect(record.vote.approval).toBe(0.8);
    expect(record.weight).toBeGreaterThan(0);
  });

  // 2
  it("should reject duplicate votes from the same shepherd", () => {
    system.castVote(makeShepherd("s1"), makeVote(), makeContext());
    expect(() =>
      system.castVote(makeShepherd("s1"), makeVote(), makeContext()),
    ).toThrow(/already voted/);
  });

  // 3
  it("should reject approval outside 0-1", () => {
    expect(() =>
      system.castVote(
        makeShepherd("s1"),
        makeVote({ approval: 1.5 }),
        makeContext(),
      ),
    ).toThrow(RangeError);
  });

  // 4
  it("should reject negative confidence", () => {
    expect(() =>
      system.castVote(
        makeShepherd("s1"),
        makeVote({ confidence: -0.1 }),
        makeContext(),
      ),
    ).toThrow(RangeError);
  });

  // 5
  it("should track voteCount", () => {
    expect(system.voteCount).toBe(0);
    system.castVote(makeShepherd("s1"), makeVote(), makeContext());
    expect(system.voteCount).toBe(1);
    system.castVote(makeShepherd("s2"), makeVote(), makeContext());
    expect(system.voteCount).toBe(2);
  });

  // 6
  it("should return correct consensus with one vote", () => {
    system.castVote(
      makeShepherd("s1"),
      makeVote({ approval: 0.6, confidence: 0.7 }),
      makeContext(),
    );
    const c = system.calculateConsensus();
    expect(c.agreementIndex).toBeCloseTo(0.6, 5);
    expect(c.confidenceIndex).toBeCloseTo(0.7, 5);
    expect(c.participationRate).toBeCloseTo(1 / 3, 5);
  });

  // 7
  it("should return zero consensus when no votes", () => {
    const c = system.calculateConsensus();
    expect(c.agreementIndex).toBe(0);
    expect(c.confidenceIndex).toBe(0);
    expect(c.participationRate).toBe(0);
    expect(c.concernDensity).toBe(0);
  });

  // 8
  it("should aggregate concerns in getVotingResults", () => {
    system.castVote(
      makeShepherd("s1"),
      makeVote({ concerns: ["slow"], conditions: ["must optimize"] }),
      makeContext(),
    );
    system.castVote(
      makeShepherd("s2"),
      makeVote({ concerns: ["insecure", "fragile"] }),
      makeContext(),
    );
    const results = system.getVotingResults();
    expect(results.allConcerns).toEqual(["slow", "insecure", "fragile"]);
    expect(results.allConditions).toEqual(["must optimize"]);
  });

  // 9
  it("should compute rankedPreferenceTally", () => {
    system.castVote(
      makeShepherd("s1"),
      makeVote({ rankedPreferences: ["A", "B", "C"] }),
      makeContext(),
    );
    system.castVote(
      makeShepherd("s2"),
      makeVote({ rankedPreferences: ["B", "A"] }),
      makeContext(),
    );
    const tally = system.getVotingResults().rankedPreferenceTally;
    expect(tally.get("A")).toBeDefined();
    expect(tally.get("B")).toBeDefined();
  });

  // 10
  it("should report totalParticipants in results", () => {
    const results = system.getVotingResults();
    expect(results.totalParticipants).toBe(3);
  });

  // 11
  it("should return a copy of votes in results", () => {
    system.castVote(makeShepherd("s1"), makeVote(), makeContext());
    const r1 = system.getVotingResults();
    system.castVote(makeShepherd("s2"), makeVote(), makeContext());
    const r2 = system.getVotingResults();
    expect(r1.votes.length).toBe(1);
    expect(r2.votes.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// WeightedVotingSystem
// ---------------------------------------------------------------------------

describe("WeightedVotingSystem", () => {
  // 12
  it("should use default config when none provided", () => {
    const ws = new WeightedVotingSystem();
    const cfg = ws.getConfig();
    expect(cfg.baseWeight).toBe(1.0);
  });

  // 13
  it("should apply specialty weight", () => {
    const ws = new WeightedVotingSystem();
    const w = ws.calculateWeightedVote(
      makeVote(),
      makeShepherd("s1", ShepherdSpecialty.Security),
      makeContext(),
    );
    expect(w).toBeCloseTo(1.5, 5);
  });

  // 14
  it("should apply conflict multiplier", () => {
    const ws = new WeightedVotingSystem();
    const w = ws.calculateWeightedVote(
      makeVote(),
      makeShepherd("s1", ShepherdSpecialty.Security),
      makeContext({ conflictType: ConflictType.SecurityVsPerformance }),
    );
    expect(w).toBeCloseTo(1.5 * 1.8, 5);
  });

  // 15
  it("should fall back to baseWeight for unknown specialty", () => {
    const config: WeightedVotingConfig = {
      baseWeight: 2.0,
      specialtyWeights: new Map(),
      conflictMultipliers: new Map(),
      reputationAdjustments: new Map(),
    };
    const ws = new WeightedVotingSystem(config);
    const w = ws.calculateWeightedVote(
      makeVote(),
      makeShepherd("s1", ShepherdSpecialty.General),
      makeContext(),
    );
    expect(w).toBe(2.0);
  });

  // 16
  it("should apply reputation adjustment", () => {
    const sid = shepherdId("reputable");
    const config: WeightedVotingConfig = {
      baseWeight: 1.0,
      specialtyWeights: new Map(),
      conflictMultipliers: new Map(),
      reputationAdjustments: new Map<ShepherdId, number>([[sid, 0.5]]),
    };
    const ws = new WeightedVotingSystem(config);
    const w = ws.calculateWeightedVote(
      makeVote(),
      { id: sid, specialty: ShepherdSpecialty.General },
      makeContext(),
    );
    expect(w).toBeCloseTo(1.5, 5);
  });

  // 17
  it("should clamp weight to non-negative", () => {
    const sid = shepherdId("bad");
    const config: WeightedVotingConfig = {
      baseWeight: 0.1,
      specialtyWeights: new Map(),
      conflictMultipliers: new Map(),
      reputationAdjustments: new Map<ShepherdId, number>([[sid, -5]]),
    };
    const ws = new WeightedVotingSystem(config);
    const w = ws.calculateWeightedVote(
      makeVote(),
      { id: sid, specialty: ShepherdSpecialty.General },
      makeContext(),
    );
    expect(w).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// VotingCalculator
// ---------------------------------------------------------------------------

describe("VotingCalculator", () => {
  const calc = new VotingCalculator();

  function makeRecord(overrides: Partial<VoteRecord> = {}): VoteRecord {
    return {
      shepherd: makeShepherd("x"),
      vote: makeVote(),
      context: makeContext(),
      weight: 1,
      timestamp: Date.now(),
      ...overrides,
    };
  }

  // 18
  it("should return zero consensus for empty votes", () => {
    const c = calc.calculateConsensus([], 5);
    expect(c.agreementIndex).toBe(0);
    expect(c.participationRate).toBe(0);
  });

  // 19
  it("should compute weighted agreement correctly", () => {
    const records: VoteRecord[] = [
      makeRecord({ vote: makeVote({ approval: 1.0 }), weight: 2 }),
      makeRecord({ vote: makeVote({ approval: 0.0 }), weight: 1 }),
    ];
    const c = calc.calculateConsensus(records, 2);
    expect(c.agreementIndex).toBeCloseTo(2 / 3, 5);
  });

  // 20
  it("should compute concern density", () => {
    const records: VoteRecord[] = [
      makeRecord({ vote: makeVote({ concerns: ["a", "b"] }) }),
      makeRecord({ vote: makeVote({ concerns: ["c"] }) }),
    ];
    const c = calc.calculateConsensus(records, 2);
    expect(c.concernDensity).toBeCloseTo(1.5, 5);
  });

  // 21
  it("should compute participationRate", () => {
    const records: VoteRecord[] = [makeRecord()];
    const c = calc.calculateConsensus(records, 4);
    expect(c.participationRate).toBeCloseTo(0.25, 5);
  });

  // 22
  it("should tally ranked preferences with Borda scoring", () => {
    const records: VoteRecord[] = [
      makeRecord({
        vote: makeVote({ rankedPreferences: ["X", "Y", "Z"] }),
        weight: 1,
      }),
    ];
    const tally = calc.tallyRankedPreferences(records);
    expect(tally.get("X")).toBe(3);
    expect(tally.get("Y")).toBe(2);
    expect(tally.get("Z")).toBe(1);
  });

  // 23
  it("should scale Borda scores by weight", () => {
    const records: VoteRecord[] = [
      makeRecord({
        vote: makeVote({ rankedPreferences: ["A", "B"] }),
        weight: 2,
      }),
    ];
    const tally = calc.tallyRankedPreferences(records);
    expect(tally.get("A")).toBe(4);
    expect(tally.get("B")).toBe(2);
  });

  // 24
  it("should return empty tally for no votes", () => {
    const tally = calc.tallyRankedPreferences([]);
    expect(tally.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// createDefaultConfig
// ---------------------------------------------------------------------------

describe("createDefaultConfig", () => {
  // 25
  it("should set baseWeight to 1", () => {
    const cfg = createDefaultConfig();
    expect(cfg.baseWeight).toBe(1.0);
  });

  // 26
  it("should define specialty weights for all specialties", () => {
    const cfg = createDefaultConfig();
    expect(cfg.specialtyWeights.size).toBeGreaterThanOrEqual(7);
  });

  // 27
  it("should define conflict multipliers for SecurityVsPerformance", () => {
    const cfg = createDefaultConfig();
    const m = cfg.conflictMultipliers.get(ConflictType.SecurityVsPerformance);
    expect(m).toBeDefined();
    expect(m!.get(ShepherdSpecialty.Security)).toBe(1.8);
  });
});

// ---------------------------------------------------------------------------
// Edge cases / integration
// ---------------------------------------------------------------------------

describe("Integration / edge cases", () => {
  // 28
  it("should handle all participants voting", () => {
    const sys = new EnhancedVotingSystem({ totalParticipants: 2 });
    sys.castVote(makeShepherd("a"), makeVote({ approval: 1 }), makeContext());
    sys.castVote(makeShepherd("b"), makeVote({ approval: 0 }), makeContext());
    const r = sys.getVotingResults();
    expect(r.consensus.participationRate).toBe(1);
  });

  // 29
  it("should correctly weight votes with custom config", () => {
    const sid = shepherdId("expert");
    const config: WeightedVotingConfig = {
      baseWeight: 1,
      specialtyWeights: new Map([[ShepherdSpecialty.Security, 3]]),
      conflictMultipliers: new Map(),
      reputationAdjustments: new Map([[sid, 1]]),
    };
    const sys = new EnhancedVotingSystem({ totalParticipants: 1, config });
    sys.castVote(
      { id: sid, specialty: ShepherdSpecialty.Security },
      makeVote({ approval: 0.5, confidence: 0.5 }),
      makeContext(),
    );
    const c = sys.calculateConsensus();
    expect(c.agreementIndex).toBeCloseTo(0.5, 5);
    expect(c.participationRate).toBe(1);
  });

  // 30
  it("approval at boundary 0 is valid", () => {
    const sys = new EnhancedVotingSystem({ totalParticipants: 1 });
    expect(() =>
      sys.castVote(makeShepherd("s"), makeVote({ approval: 0 }), makeContext()),
    ).not.toThrow();
  });

  // 31
  it("approval at boundary 1 is valid", () => {
    const sys = new EnhancedVotingSystem({ totalParticipants: 1 });
    expect(() =>
      sys.castVote(makeShepherd("s"), makeVote({ approval: 1 }), makeContext()),
    ).not.toThrow();
  });
});
