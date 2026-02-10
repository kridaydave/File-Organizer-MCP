/**
 * File Organizer MCP Server v3.2.0
 * Tie-Breaking System Unit Tests
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  beforeAll,
  afterAll,
} from "@jest/globals";
import {
  TieBreaker,
  BorzoiTieBreakAdvisor,
  TieBreakMethod,
  TieOption,
  TieBreakResult,
  createTieOption,
  isTie,
  BorzoiPatternResult,
} from "../tie-breaking.js";

describe("TieBreaker", () => {
  let tieBreaker: TieBreaker;

  beforeEach(() => {
    tieBreaker = new TieBreaker();
  });

  describe("breakTie", () => {
    it("should throw error when no options provided", async () => {
      const options: TieOption[] = [];
      const context = createBasicContext();

      await expect(
        tieBreaker.breakTie(options, TieBreakMethod.WEIGHTED_VOTE, context),
      ).rejects.toThrow("Cannot break tie with no options provided");
    });

    it("should automatically select single option", async () => {
      const options = [
        createTieOption("opt1", "Single option", 5, 0.8, ["s1"]),
      ];
      const context = createBasicContext();

      const result = await tieBreaker.breakTie(
        options,
        TieBreakMethod.WEIGHTED_VOTE,
        context,
      );

      expect(result.winner.id).toBe("opt1");
      expect(result.confidence).toBe(1.0);
      expect(result.reasoning).toContain("Single option available");
    });

    it("should handle weighted vote method correctly", async () => {
      const options = [
        createTieOption("opt1", "Option A", 5, 0.8, [
          "s1",
          "s2",
          "s3",
          "s4",
          "s5",
        ]),
        createTieOption("opt2", "Option B", 3, 0.9, ["s6", "s7", "s8"]),
      ];
      const context = createBasicContext();

      const result = await tieBreaker.breakTie(
        options,
        TieBreakMethod.WEIGHTED_VOTE,
        context,
      );

      expect(result.method).toBe(TieBreakMethod.WEIGHTED_VOTE);
      expect(result.confidence).toBeGreaterThan(0.5);
    });
  });

  describe("weightedVote", () => {
    it("should select option with more votes", async () => {
      const options = [
        createTieOption("opt1", "Option A", 8, 0.5, ["s1", "s2", "s3"]),
        createTieOption("opt2", "Option B", 5, 0.9, ["s4", "s5"]),
      ];
      const context = createBasicContext();

      const result = await tieBreaker.breakTie(
        options,
        TieBreakMethod.WEIGHTED_VOTE,
        context,
      );

      expect(result.winner.id).toBe("opt1");
    });

    it("should consider confidence in weighted voting", async () => {
      const options = [
        createTieOption("opt1", "Option A", 5, 0.5, ["s1", "s2"]),
        createTieOption("opt2", "Option B", 5, 0.95, ["s3", "s4"]),
      ];
      const context = createBasicContext();

      const result = await tieBreaker.breakTie(
        options,
        TieBreakMethod.WEIGHTED_VOTE,
        context,
      );

      expect(result.winner.id).toBe("opt2");
    });

    it("should factor in shepherd participation", async () => {
      const options = [
        createTieOption("opt1", "Option A", 5, 0.8, ["s1", "s2", "s3"]),
        createTieOption("opt2", "Option B", 5, 0.8, ["s4", "s5"]),
      ];
      const context = createBasicContext();

      const result = await tieBreaker.breakTie(
        options,
        TieBreakMethod.WEIGHTED_VOTE,
        context,
      );

      expect(result.winner.id).toBe("opt1");
    });
  });

  describe("confidenceBonus", () => {
    it("should select highest confidence option", async () => {
      const options = [
        createTieOption("opt1", "Option A", 3, 0.6, ["s1"]),
        createTieOption("opt2", "Option B", 5, 0.85, ["s2", "s3"]),
        createTieOption("opt3", "Option C", 7, 0.7, ["s4"]),
      ];
      const context = createBasicContext();

      const result = await tieBreaker.breakTie(
        options,
        TieBreakMethod.CONFIDENCE_BONUS,
        context,
      );

      expect(result.winner.id).toBe("opt2");
      expect(result.method).toBe(TieBreakMethod.CONFIDENCE_BONUS);
    });

    it("should use votes as tiebreaker for equal confidence", async () => {
      const options = [
        createTieOption("opt1", "Option A", 3, 0.8, ["s1"]),
        createTieOption("opt2", "Option B", 7, 0.8, ["s2"]),
      ];
      const context = createBasicContext();

      const result = await tieBreaker.breakTie(
        options,
        TieBreakMethod.CONFIDENCE_BONUS,
        context,
      );

      expect(result.winner.id).toBe("opt2");
    });
  });

  describe("roundRobin", () => {
    it("should rotate selection based on round", async () => {
      const options = [
        createTieOption("opt1", "Option A", 5, 0.8, ["s1"]),
        createTieOption("opt2", "Option B", 5, 0.8, ["s2"]),
      ];

      const result1 = await tieBreaker.breakTie(
        options,
        TieBreakMethod.ROUND_ROBIN,
        { ...createBasicContext(), round: 1 },
      );

      const result2 = await tieBreaker.breakTie(
        options,
        TieBreakMethod.ROUND_ROBIN,
        { ...createBasicContext(), round: 2 },
      );

      expect(result1.winner.id).not.toBe(result2.winner.id);
    });

    it("should have lower confidence as it is not merit-based", async () => {
      const options = [
        createTieOption("opt1", "Option A", 10, 0.9, ["s1"]),
        createTieOption("opt2", "Option B", 1, 0.1, ["s2"]),
      ];
      const context = createBasicContext();

      const result = await tieBreaker.breakTie(
        options,
        TieBreakMethod.ROUND_ROBIN,
        context,
      );

      expect(result.confidence).toBe(0.6);
    });
  });

  describe("borzoiDecision", () => {
    it("should use pattern analysis for decision", async () => {
      const options = [
        createTieOption("opt1", "Security focused solution", 5, 0.8, ["s1"]),
        createTieOption("opt2", "Performance optimization", 5, 0.8, ["s2"]),
      ];
      const context = createBasicContext();

      const result = await tieBreaker.breakTie(
        options,
        TieBreakMethod.BORZOI_DECISION,
        context,
      );

      expect(result.method).toBe(TieBreakMethod.BORZOI_DECISION);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it("should detect security patterns", async () => {
      const options = [
        createTieOption("opt1", "Security audit implementation", 3, 0.6, [
          "s1",
        ]),
        createTieOption("opt2", "Performance tuning", 5, 0.8, ["s2"]),
      ];
      const context = {
        ...createBasicContext(),
        topic: "Security vulnerability assessment",
      };

      const result = await tieBreaker.breakTie(
        options,
        TieBreakMethod.BORZOI_DECISION,
        context,
      );

      expect(result.reasoning).toContain("security");
    });

    it("should detect performance patterns", async () => {
      const options = [
        createTieOption("opt1", "Speed optimization", 5, 0.8, ["s1"]),
        createTieOption("opt2", "Code refactoring", 5, 0.8, ["s2"]),
      ];
      const context = {
        ...createBasicContext(),
        topic: "Performance optimization strategy",
      };

      const result = await tieBreaker.breakTie(
        options,
        TieBreakMethod.BORZOI_DECISION,
        context,
      );

      expect(result.reasoning).toContain("performance");
    });
  });

  describe("escalate", () => {
    it("should escalate to appropriate handler", async () => {
      const options = [
        createTieOption("opt1", "Option A", 5, 0.8, ["s1"]),
        createTieOption("opt2", "Option B", 5, 0.8, ["s2"]),
      ];
      const context = createBasicContext();

      const result = await tieBreaker.breakTie(
        options,
        TieBreakMethod.ESCALATE,
        context,
      );

      expect(result.method).toBe(TieBreakMethod.ESCALATE);
    });

    it("should reduce confidence for escalation", async () => {
      const options = [
        createTieOption("opt1", "Option A", 5, 0.9, ["s1"]),
        createTieOption("opt2", "Option B", 5, 0.9, ["s2"]),
      ];
      const context = createBasicContext();

      const escalationResult = await tieBreaker.breakTie(
        options,
        TieBreakMethod.ESCALATE,
        context,
      );

      const weightedResult = await tieBreaker.breakTie(
        options,
        TieBreakMethod.WEIGHTED_VOTE,
        context,
      );

      expect(escalationResult.confidence).toBeLessThan(
        weightedResult.confidence,
      );
    });
  });

  describe("custom escalation handlers", () => {
    it("should register and use custom handler", async () => {
      const options = [
        createTieOption("opt1", "Short description", 5, 0.8, ["s1"]),
        createTieOption(
          "opt2",
          "Very long and detailed description for the option",
          5,
          0.8,
          ["s2"],
        ),
      ];
      const context = createBasicContext();

      // Create new tieBreaker to have clean handlers
      const testTieBreaker = new TieBreaker();

      // Register custom handler with highest authority level
      testTieBreaker.registerEscalationHandler({
        handleEscalation: async (opts) => {
          const winner = opts.reduce((best, current) =>
            current.description.length > best.description.length
              ? current
              : best,
          );
          return {
            winner,
            method: TieBreakMethod.ESCALATE,
            confidence: 0.8,
            reasoning: "Selected longest description",
          };
        },
        getAuthorityLevel: () => 10,
        getName: () => "CustomHandler",
      });

      const result = await testTieBreaker.breakTie(
        options,
        TieBreakMethod.ESCALATE,
        { ...context, escalationLevel: 0 },
      );

      expect(result.reasoning).toContain("longest description");
    });
  });

  describe("method usage tracking", () => {
    it("should track method usage statistics", async () => {
      const options = [
        createTieOption("opt1", "Option A", 5, 0.8, ["s1"]),
        createTieOption("opt2", "Option B", 3, 0.6, ["s2"]),
      ];
      const context = createBasicContext();

      await tieBreaker.breakTie(options, TieBreakMethod.WEIGHTED_VOTE, context);
      await tieBreaker.breakTie(
        options,
        TieBreakMethod.CONFIDENCE_BONUS,
        context,
      );
      await tieBreaker.breakTie(options, TieBreakMethod.WEIGHTED_VOTE, context);

      const stats = tieBreaker.getMethodUsageStats();

      expect(stats.get(TieBreakMethod.WEIGHTED_VOTE)).toBe(2);
      expect(stats.get(TieBreakMethod.CONFIDENCE_BONUS)).toBe(1);
    });

    it("should reset statistics", async () => {
      const options = [
        createTieOption("opt1", "Option A", 5, 0.8, ["s1"]),
        createTieOption("opt2", "Option B", 3, 0.6, ["s2"]),
      ];
      const context = createBasicContext();

      await tieBreaker.breakTie(options, TieBreakMethod.WEIGHTED_VOTE, context);
      tieBreaker.resetStats();

      const stats = tieBreaker.getMethodUsageStats();

      expect(stats.get(TieBreakMethod.WEIGHTED_VOTE)).toBeUndefined();
    });
  });

  describe("getBorzoiAdvisor", () => {
    it("should return Borzoi advisor instance", () => {
      const advisor = tieBreaker.getBorzoiAdvisor();

      expect(advisor).toBeInstanceOf(BorzoiTieBreakAdvisor);
    });
  });
});

describe("BorzoiTieBreakAdvisor", () => {
  let advisor: BorzoiTieBreakAdvisor;

  beforeEach(() => {
    advisor = new BorzoiTieBreakAdvisor();
  });

  describe("analyzePatterns", () => {
    it("should return valid pattern result", () => {
      const options = [
        createTieOption("opt1", "Security solution", 5, 0.8, ["s1"]),
        createTieOption("opt2", "Performance solution", 5, 0.7, ["s2"]),
      ];
      const context = createBasicContext();

      const result = advisor.analyzePatterns(options, context);

      expect(result).toHaveProperty("recommendedId");
      expect(result).toHaveProperty("confidence");
      expect(result).toHaveProperty("patterns");
      expect(result).toHaveProperty("reasoning");
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it("should identify security-focused patterns", () => {
      const options = [
        createTieOption("opt1", "Security audit", 5, 0.8, ["s1"]),
        createTieOption("opt2", "Code review", 5, 0.7, ["s2"]),
      ];
      const context = {
        ...createBasicContext(),
        topic: "Security vulnerability assessment",
      };

      const result = advisor.analyzePatterns(options, context);

      expect(result.patterns).toContain("security-focused");
    });

    it("should identify performance-focused patterns", () => {
      const options = [
        createTieOption("opt1", "Speed improvement", 5, 0.8, ["s1"]),
        createTieOption("opt2", "Memory optimization", 5, 0.7, ["s2"]),
      ];
      const context = {
        ...createBasicContext(),
        topic: "Performance tuning needed",
      };

      const result = advisor.analyzePatterns(options, context);

      expect(result.patterns).toContain("performance-focused");
    });

    it("should detect high-consensus environment", () => {
      const options = [
        createTieOption("opt1", "Option A", 5, 0.85, ["s1"]),
        createTieOption("opt2", "Option B", 5, 0.82, ["s2"]),
        createTieOption("opt3", "Option C", 5, 0.88, ["s3"]),
      ];
      const context = createBasicContext();

      const result = advisor.analyzePatterns(options, context);

      expect(result.patterns).toContain("high-consensus-environment");
    });

    it("should detect low-confidence environment", () => {
      const options = [
        createTieOption("opt1", "Option A", 5, 0.3, ["s1"]),
        createTieOption("opt2", "Option B", 5, 0.35, ["s2"]),
      ];
      const context = createBasicContext();

      const result = advisor.analyzePatterns(options, context);

      expect(result.patterns).toContain("low-confidence-environment");
    });
  });

  describe("decision history", () => {
    it("should track decision history", () => {
      const options = [
        createTieOption("opt1", "Option A", 5, 0.8, ["s1"]),
        createTieOption("opt2", "Option B", 3, 0.6, ["s2"]),
      ];
      const context = createBasicContext();

      advisor.analyzePatterns(options, context);
      advisor.analyzePatterns(options, context);

      const history = advisor.getDecisionHistory();

      expect(history.length).toBe(2);
    });

    it("should clear decision history", () => {
      const options = [
        createTieOption("opt1", "Option A", 5, 0.8, ["s1"]),
        createTieOption("opt2", "Option B", 3, 0.6, ["s2"]),
      ];
      const context = createBasicContext();

      advisor.analyzePatterns(options, context);
      advisor.clearHistory();

      const history = advisor.getDecisionHistory();

      expect(history.length).toBe(0);
    });
  });
});

describe("Utility Functions", () => {
  describe("createTieOption", () => {
    it("should create a valid TieOption", () => {
      const option = createTieOption("test-id", "Test description", 5, 0.8, [
        "s1",
        "s2",
      ]);

      expect(option.id).toBe("test-id");
      expect(option.description).toBe("Test description");
      expect(option.votes).toBe(5);
      expect(option.confidence).toBe(0.8);
      expect(option.shepherdIds).toEqual(["s1", "s2"]);
    });

    it("should clamp confidence to valid range", () => {
      const option1 = createTieOption("opt1", "Option 1", 5, 1.5, ["s1"]);
      const option2 = createTieOption("opt2", "Option 2", 5, -0.1, ["s1"]);

      expect(option1.confidence).toBe(1);
      expect(option2.confidence).toBe(0);
    });

    it("should clone shepherdIds array", () => {
      const ids = ["s1", "s2"];
      const option = createTieOption("opt1", "Test", 5, 0.8, ids);

      ids.push("s3");

      expect(option.shepherdIds).toEqual(["s1", "s2"]);
    });
  });

  describe("isTie", () => {
    it("should return false for single option", () => {
      const options = [createTieOption("opt1", "Option A", 5, 0.8, ["s1"])];

      expect(isTie(options)).toBe(false);
    });

    it("should return true for equal votes", () => {
      const options = [
        createTieOption("opt1", "Option A", 5, 0.8, ["s1"]),
        createTieOption("opt2", "Option B", 5, 0.7, ["s2"]),
      ];

      expect(isTie(options)).toBe(true);
    });

    it("should return false for different votes", () => {
      const options = [
        createTieOption("opt1", "Option A", 5, 0.8, ["s1"]),
        createTieOption("opt2", "Option B", 3, 0.7, ["s2"]),
      ];

      expect(isTie(options)).toBe(false);
    });

    it("should respect tolerance parameter", () => {
      const options = [
        createTieOption("opt1", "Option A", 5.005, 0.8, ["s1"]),
        createTieOption("opt2", "Option B", 5.0, 0.7, ["s2"]),
      ];

      expect(isTie(options, 0.01)).toBe(true);
      expect(isTie(options, 0.001)).toBe(false);
    });
  });
});

describe("TieBreakMethod Enum", () => {
  it("should have all required methods", () => {
    expect(TieBreakMethod.WEIGHTED_VOTE).toBe("weighted_vote");
    expect(TieBreakMethod.BORZOI_DECISION).toBe("borzoi_decision");
    expect(TieBreakMethod.CONFIDENCE_BONUS).toBe("confidence_bonus");
    expect(TieBreakMethod.ROUND_ROBIN).toBe("round_robin");
    expect(TieBreakMethod.ESCALATE).toBe("escalate");
  });
});

describe("Edge Cases", () => {
  let tieBreaker: TieBreaker;

  beforeEach(() => {
    tieBreaker = new TieBreaker();
  });

  it("should handle many tied options", async () => {
    const options = Array.from({ length: 10 }, (_, i) =>
      createTieOption(`opt${i}`, `Option ${i}`, 5, 0.5, [`s${i}`]),
    );
    const context = createBasicContext();

    const result = await tieBreaker.breakTie(
      options,
      TieBreakMethod.WEIGHTED_VOTE,
      context,
    );

    expect(result.winner).toBeDefined();
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("should handle options with zero confidence", async () => {
    const options = [
      createTieOption("opt1", "Option A", 5, 0, ["s1"]),
      createTieOption("opt2", "Option B", 3, 0, ["s2"]),
    ];
    const context = createBasicContext();

    const result = await tieBreaker.breakTie(
      options,
      TieBreakMethod.CONFIDENCE_BONUS,
      context,
    );

    expect(result.winner.id).toBe("opt1");
  });

  it("should handle options with many shepherds", async () => {
    const manyShepherds = Array.from({ length: 50 }, (_, i) => `s${i}`);
    const options = [
      createTieOption("opt1", "Option A", 25, 0.8, manyShepherds.slice(0, 25)),
      createTieOption("opt2", "Option B", 25, 0.8, manyShepherds.slice(25)),
    ];
    const context = createBasicContext();

    const result = await tieBreaker.breakTie(
      options,
      TieBreakMethod.WEIGHTED_VOTE,
      context,
    );

    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it("should handle many rounds of tie-breaking", async () => {
    const options = [
      createTieOption("opt1", "Option A", 5, 0.8, ["s1"]),
      createTieOption("opt2", "Option B", 5, 0.8, ["s2"]),
    ];

    for (let i = 1; i <= 10; i++) {
      const context = { ...createBasicContext(), round: i };
      const result = await tieBreaker.breakTie(
        options,
        TieBreakMethod.ROUND_ROBIN,
        context,
      );

      expect(result.winner).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    }
  });
});

// Helper function
function createBasicContext() {
  return {
    round: 1,
    topic: "Test debate topic",
    totalParticipants: 4,
    previousTieBreaks: [] as readonly TieBreakMethod[],
    escalationLevel: 0,
  };
}
