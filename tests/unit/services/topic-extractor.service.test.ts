/**
 * Tests for Topic Extractor Service
 * Tests topic extraction, keyword detection, and document type classification
 */

import {
  TopicExtractorService,
  TopicExtractionResult,
} from "../../../src/services/topic-extractor.service.js";
import {
  setupLoggerMocks,
  teardownLoggerMocks,
} from "../../utils/logger-mock.js";

describe("TopicExtractorService", () => {
  let service: TopicExtractorService;

  beforeEach(() => {
    setupLoggerMocks();
    service = new TopicExtractorService();
  });

  afterEach(() => {
    teardownLoggerMocks();
  });

  describe("extractTopics", () => {
    it("should extract Mathematics topic from calculus text", () => {
      const calculusText = `
        Calculus is a branch of mathematics that deals with the study of rates of change 
        and accumulation. The derivative represents the instantaneous rate of change of a 
        function, while the integral represents the accumulation of quantities. 
        Fundamental theorem of calculus connects differentiation and integration.
        We study limits, continuity, and polynomial functions in calculus.
      `;

      const result = service.extractTopics(calculusText);

      expect(result.topics.length).toBeGreaterThan(0);
      const mathTopic = result.topics.find((t) => t.topic === "Mathematics");
      expect(mathTopic).toBeDefined();
      expect(mathTopic?.confidence).toBeGreaterThan(0);
      expect(mathTopic?.matchedKeywords).toContain("calculus");
      expect(mathTopic?.matchedKeywords).toContain("derivative");
      expect(mathTopic?.matchedKeywords).toContain("integral");
      expect(mathTopic?.matchedKeywords).toContain("function");
    });

    it("should extract History topic from historical text", () => {
      const historyText = `
        The ancient Roman Empire was one of the most powerful civilizations in history. 
        During the medieval period, many dynasties rose and fell across Europe and Asia. 
        The Renaissance marked a revolution in art and culture. The industrial revolution 
        transformed society. Historical archives and chronicles document the reign of 
        monarchs and the conquest of new territories. Treaties were signed after battles.
      `;

      const result = service.extractTopics(historyText);

      expect(result.topics.length).toBeGreaterThan(0);
      const historyTopic = result.topics.find((t) => t.topic === "History");
      expect(historyTopic).toBeDefined();
      expect(historyTopic?.confidence).toBeGreaterThan(0);
      expect(historyTopic?.matchedKeywords.length).toBeGreaterThan(0);
    });

    it("should extract multiple topics with confidence scores", () => {
      const multiTopicText = `
        The economic impact of the industrial revolution transformed society. 
        Revenue and profit from new businesses drove market growth. Investment 
        in technology and engineering led to new algorithm development. The 
        historical archive documents show how ancient civilizations developed 
        mathematical proofs and theorems. Research methodology was applied to 
        study physics and chemistry experiments.
      `;

      const result = service.extractTopics(multiTopicText);

      expect(result.topics.length).toBeGreaterThan(1);
      result.topics.forEach((topic) => {
        expect(topic.confidence).toBeGreaterThanOrEqual(0);
        expect(topic.confidence).toBeLessThanOrEqual(1);
        expect(topic.topic).toBeDefined();
        expect(topic.matchedKeywords.length).toBeGreaterThan(0);
      });
    });

    it("should extract keywords correctly", () => {
      const text = `
        The algorithm processes data through multiple iterations. Each iteration 
        applies the algorithm to new data sets. The data is validated and processed.
        Processing continues until all data is analyzed. The algorithm uses 
        efficient data structures for optimal processing speed.
      `;

      const result = service.extractTopics(text);

      expect(result.keywords.length).toBeGreaterThan(0);
      expect(result.keywords).toContain("algorithm");
      expect(result.keywords).toContain("data");
      expect(result.keywords).toContain("processing");
    });

    it("should detect academic document type", () => {
      const academicText = `
        Abstract: This paper presents a comprehensive methodology for analyzing 
        complex systems. The hypothesis was tested through peer-reviewed studies.
        References and bibliography follow standard citation formats. The conclusion
        supports the initial thesis. This journal article underwent rigorous review.
      `;

      const result = service.extractTopics(academicText);

      expect(result.documentType).toBe("academic");
    });

    it("should detect business document type", () => {
      const businessText = `
        Quarterly Report: Revenue increased by 15% this fiscal year. Profit margins 
        improved across all market segments. Executive summary highlights key 
        stakeholder concerns. ROI analysis shows strong returns. Budget forecast 
        indicates continued growth.
      `;

      const result = service.extractTopics(businessText);

      expect(result.documentType).toBe("business");
    });

    it("should detect technical document type", () => {
      const technicalText = `
        Implementation Guide: The architecture uses microservices for scalability.
        API configuration requires debugging of the deployment pipeline. Performance
        optimization involves algorithm refinement. The system supports configuration
        through environment variables. Debugging tools are integrated.
      `;

      const result = service.extractTopics(technicalText);

      expect(result.documentType).toBe("technical");
    });

    it("should detect general document type for non-specific content", () => {
      const generalText = `
        This is a simple note about everyday things. The weather was nice today.
        I went for a walk in the park. The flowers were blooming beautifully.
        It was a pleasant afternoon with friends.
      `;

      const result = service.extractTopics(generalText);

      expect(result.documentType).toBe("general");
    });

    it("should handle empty text", () => {
      const result = service.extractTopics("");

      expect(result.topics).toEqual([]);
      expect(result.keywords).toEqual([]);
      expect(result.language).toBe("unknown");
      expect(result.documentType).toBe("general");
    });

    it("should handle whitespace-only text", () => {
      const result = service.extractTopics("   \n\t  ");

      expect(result.topics).toEqual([]);
      expect(result.keywords).toEqual([]);
      expect(result.language).toBe("unknown");
      expect(result.documentType).toBe("general");
    });

    it("should handle short text (less than 50 chars)", () => {
      const shortText = "Calculus is math";

      const result = service.extractTopics(shortText);

      expect(result).toBeDefined();
      expect(result.topics).toBeDefined();
      expect(result.keywords).toBeDefined();
      expect(result.language).toBeDefined();
      expect(result.documentType).toBeDefined();
    });

    it("should return at most 5 topics sorted by confidence", () => {
      const broadText = `
        Mathematics and science are fundamental. Algebra, calculus, geometry, 
        theorem proofs, equations, and derivatives. Historical documents show 
        ancient civilizations. Experiments in physics and chemistry. Biology 
        studies cells, DNA, and proteins. Art exhibitions in galleries show 
        paintings and sculptures. Music composition involves melody and rhythm.
        Medical diagnosis and treatment protocols. Legal statutes and regulations.
      `;

      const result = service.extractTopics(broadText);

      expect(result.topics.length).toBeLessThanOrEqual(5);
      for (let i = 1; i < result.topics.length; i++) {
        expect(result.topics[i - 1].confidence).toBeGreaterThanOrEqual(
          result.topics[i].confidence,
        );
      }
    });

    it("should return at most 20 keywords", () => {
      const text = Array(30)
        .fill("uniqueword")
        .map((w, i) => `${w}${i} ${w}${i} ${w}${i}`)
        .join(" ");

      const result = service.extractTopics(text);

      expect(result.keywords.length).toBeLessThanOrEqual(20);
    });

    it("should detect English language", () => {
      const englishText = "The quick brown fox jumps over the lazy dog.";

      const result = service.extractTopics(englishText);

      expect(result.language).toBe("en");
    });

    it("should only include keywords that appear at least twice", () => {
      const text = "uniqueword appears once but repeated repeated repeated";

      const result = service.extractTopics(text);

      expect(result.keywords).toContain("repeated");
      expect(result.keywords).not.toContain("uniqueword");
      expect(result.keywords).not.toContain("appears");
    });

    it("should filter out stop words from keywords", () => {
      const text = "the the the and and and but but but with with with";

      const result = service.extractTopics(text);

      expect(result.keywords).not.toContain("the");
      expect(result.keywords).not.toContain("and");
      expect(result.keywords).not.toContain("but");
      expect(result.keywords).not.toContain("with");
    });
  });
});
