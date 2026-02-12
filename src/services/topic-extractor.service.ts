/**
 * Topic Extractor Service - Content Analysis for Document Organization
 * Extracts topics, keywords, and document types from text content
 */

import { logger } from "../utils/logger.js";

export interface TopicMatch {
  topic: string;
  confidence: number;
  matchedKeywords: string[];
}

export interface TopicExtractionResult {
  topics: TopicMatch[];
  keywords: string[];
  language: string;
  documentType: "academic" | "business" | "technical" | "general";
}

interface TopicDefinition {
  name: string;
  keywords: string[];
  weight: number;
}

const TOPIC_DEFINITIONS: TopicDefinition[] = [
  {
    name: "Mathematics",
    keywords: [
      "algebra",
      "calculus",
      "geometry",
      "theorem",
      "equation",
      "matrix",
      "function",
      "derivative",
      "integral",
      "polynomial",
      "vector",
      "scalar",
      "logarithm",
      "trigonometry",
      "probability",
      "statistics",
      "linear",
      "quadratic",
      "exponential",
      "arithmetic",
      "mathematical",
      "proof",
      "lemma",
      "corollary",
      "axiom",
      "variable",
      "coefficient",
      "factorial",
    ],
    weight: 1.0,
  },
  {
    name: "Science",
    keywords: [
      "hypothesis",
      "experiment",
      "theory",
      "molecule",
      "atom",
      "cell",
      "dna",
      "rna",
      "protein",
      "enzyme",
      "reaction",
      "chemical",
      "physics",
      "chemistry",
      "biology",
      "organism",
      "evolution",
      "genetics",
      "quantum",
      "energy",
      "force",
      "mass",
      "velocity",
      "acceleration",
      "gravity",
      "electromagnetic",
      "nuclear",
      "photosynthesis",
      "ecosystem",
    ],
    weight: 1.0,
  },
  {
    name: "History",
    keywords: [
      "century",
      "ancient",
      "medieval",
      "war",
      "revolution",
      "empire",
      "dynasty",
      "monarchy",
      "treaty",
      "colonization",
      "independence",
      "constitution",
      "democracy",
      "republic",
      "civilization",
      "archaeological",
      "historical",
      "archival",
      "chronicle",
      "battle",
      "conquest",
      "reign",
      "dynasty",
      "reformation",
      "renaissance",
      "industrial",
      "colonial",
    ],
    weight: 1.0,
  },
  {
    name: "Business",
    keywords: [
      "revenue",
      "profit",
      "market",
      "investment",
      "portfolio",
      "stock",
      "dividend",
      "equity",
      "asset",
      "liability",
      "balance",
      "cashflow",
      "quarterly",
      "fiscal",
      "budget",
      "forecast",
      "strategy",
      "stakeholder",
      "merger",
      "acquisition",
      "valuation",
      "capital",
      "entrepreneur",
      "startup",
      "venture",
      "roi",
      "margin",
      "turnover",
      "supply chain",
    ],
    weight: 1.0,
  },
  {
    name: "Technology",
    keywords: [
      "software",
      "hardware",
      "algorithm",
      "database",
      "api",
      "interface",
      "protocol",
      "network",
      "server",
      "client",
      "cloud",
      "docker",
      "kubernetes",
      "microservice",
      "frontend",
      "backend",
      "fullstack",
      "javascript",
      "python",
      "typescript",
      "framework",
      "library",
      "debugging",
      "deployment",
      "devops",
      "ci/cd",
      "encryption",
      "cybersecurity",
    ],
    weight: 1.0,
  },
  {
    name: "Literature",
    keywords: [
      "novel",
      "poetry",
      "prose",
      "narrative",
      "protagonist",
      "antagonist",
      "metaphor",
      "simile",
      "allegory",
      "symbolism",
      "irony",
      "satire",
      "sonnet",
      "stanza",
      "verse",
      "fiction",
      "nonfiction",
      "biography",
      "memoir",
      "anthology",
      "literary",
      "genre",
      "plot",
      "character",
      "dialogue",
      "monologue",
      "foreshadowing",
      "imagery",
    ],
    weight: 1.0,
  },
  {
    name: "Art",
    keywords: [
      "painting",
      "sculpture",
      "canvas",
      "brushstroke",
      "palette",
      "portrait",
      "landscape",
      "abstract",
      "impressionism",
      "surrealism",
      "renaissance",
      "baroque",
      "contemporary",
      "exhibition",
      "gallery",
      "curator",
      "composition",
      "perspective",
      "texture",
      "medium",
      "acrylic",
      "oil",
      "watercolor",
      "sketch",
      "illustration",
      "design",
      "aesthetic",
    ],
    weight: 1.0,
  },
  {
    name: "Music",
    keywords: [
      "melody",
      "harmony",
      "rhythm",
      "tempo",
      "chord",
      "scale",
      "note",
      "octave",
      "symphony",
      "concerto",
      "sonata",
      "composition",
      "lyrics",
      "verse",
      "chorus",
      "bridge",
      "refrain",
      "arrangement",
      "orchestration",
      "instrument",
      "vocal",
      "acoustic",
      "electronic",
      "jazz",
      "classical",
      "blues",
      "rock",
      "genre",
      "album",
      "track",
    ],
    weight: 1.0,
  },
  {
    name: "Health",
    keywords: [
      "medical",
      "clinical",
      "patient",
      "diagnosis",
      "treatment",
      "therapy",
      "medication",
      "prescription",
      "symptom",
      "disease",
      "syndrome",
      "chronic",
      "acute",
      "prevention",
      "vaccination",
      "immunization",
      "nutrition",
      "exercise",
      "wellness",
      "mental health",
      "cardiovascular",
      "respiratory",
      "neurological",
      "oncology",
      "pediatric",
      "geriatric",
    ],
    weight: 1.0,
  },
  {
    name: "Law",
    keywords: [
      "legal",
      "statute",
      "regulation",
      "legislation",
      "jurisdiction",
      "plaintiff",
      "defendant",
      "verdict",
      "judgment",
      "appeal",
      "litigation",
      "contract",
      "tort",
      "criminal",
      "civil",
      "constitutional",
      "corporate",
      "intellectual property",
      "patent",
      "copyright",
      "trademark",
      "compliance",
      "liability",
      "indemnity",
      "arbitration",
      "mediation",
      "precedent",
    ],
    weight: 1.0,
  },
  {
    name: "Education",
    keywords: [
      "curriculum",
      "pedagogy",
      "syllabus",
      "lesson",
      "lecture",
      "seminar",
      "workshop",
      "assessment",
      "evaluation",
      "grade",
      "examination",
      "diploma",
      "degree",
      "certification",
      "accreditation",
      "enrollment",
      "student",
      "teacher",
      "professor",
      "instructor",
      "tutor",
      "scholarship",
      "thesis",
      "dissertation",
      "research",
      "academic",
      "institution",
    ],
    weight: 1.0,
  },
];

const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "by",
  "from",
  "as",
  "is",
  "was",
  "are",
  "were",
  "been",
  "be",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "must",
  "shall",
  "can",
  "need",
  "dare",
  "ought",
  "used",
  "this",
  "that",
  "these",
  "those",
  "i",
  "you",
  "he",
  "she",
  "it",
  "we",
  "they",
  "what",
  "which",
  "who",
  "whom",
  "whose",
  "where",
  "when",
  "why",
  "how",
  "all",
  "each",
  "every",
  "both",
  "few",
  "more",
  "most",
  "other",
  "some",
  "such",
  "no",
  "nor",
  "not",
  "only",
  "own",
  "same",
  "so",
  "than",
  "too",
  "very",
  "just",
  "also",
  "now",
  "here",
  "there",
  "then",
  "once",
  "if",
  "else",
  "because",
  "until",
  "while",
  "about",
  "against",
  "between",
  "into",
  "through",
  "during",
  "before",
  "after",
  "above",
  "below",
]);

export class TopicExtractorService {
  private readonly minKeywordLength = 3;
  private readonly maxKeywords = 20;
  private readonly minTopicConfidence = 0.1;

  extractTopics(text: string): TopicExtractionResult {
    if (!text || text.trim().length === 0) {
      return {
        topics: [],
        keywords: [],
        language: "unknown",
        documentType: "general",
      };
    }

    const normalizedText = text.toLowerCase();
    const words = this.tokenize(normalizedText);

    const topics = this.matchTopics(normalizedText, words);
    const keywords = this.extractKeywords(words);
    const language = this.detectLanguage(text);
    const documentType = this.detectDocumentType(normalizedText);

    logger.debug("Topic extraction complete", {
      topicCount: topics.length,
      keywordCount: keywords.length,
      documentType,
    });

    return {
      topics,
      keywords,
      language,
      documentType,
    };
  }

  private tokenize(text: string): string[] {
    return text
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length >= this.minKeywordLength);
  }

  private matchTopics(text: string, words: string[]): TopicMatch[] {
    const results: TopicMatch[] = [];
    const wordSet = new Set(words);

    for (const topicDef of TOPIC_DEFINITIONS) {
      const matchedKeywords: string[] = [];
      let matchCount = 0;

      for (const keyword of topicDef.keywords) {
        if (text.includes(keyword) || wordSet.has(keyword)) {
          matchedKeywords.push(keyword);
          matchCount++;
        }
      }

      if (matchCount > 0) {
        const confidence = Math.min(
          (matchCount / Math.min(topicDef.keywords.length * 0.3, 10)) *
            topicDef.weight,
          1.0,
        );

        if (confidence >= this.minTopicConfidence) {
          results.push({
            topic: topicDef.name,
            confidence: Math.round(confidence * 100) / 100,
            matchedKeywords,
          });
        }
      }
    }

    return results.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
  }

  private extractKeywords(words: string[]): string[] {
    const frequency: Map<string, number> = new Map();

    for (const word of words) {
      if (!STOP_WORDS.has(word) && word.length >= this.minKeywordLength) {
        frequency.set(word, (frequency.get(word) || 0) + 1);
      }
    }

    return Array.from(frequency.entries())
      .filter(([_, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, this.maxKeywords)
      .map(([word]) => word);
  }

  private detectLanguage(text: string): string {
    const sample = text.slice(0, 500).toLowerCase();

    const patterns: Record<string, RegExp> = {
      en: /\b(the|and|is|are|was|were|have|has|this|that|with|from)\b/gi,
      es: /\b(el|la|los|las|es|son|está|están|con|por|para)\b/gi,
      fr: /\b(le|la|les|est|sont|avec|pour|dans|sur|ce|cette)\b/gi,
      de: /\b(der|die|das|ist|sind|mit|für|auf|und|oder)\b/gi,
    };

    let bestLang = "en";
    let bestCount = 0;

    for (const [lang, pattern] of Object.entries(patterns)) {
      const matches = sample.match(pattern);
      const count = matches ? matches.length : 0;
      if (count > bestCount) {
        bestCount = count;
        bestLang = lang;
      }
    }

    return bestLang;
  }

  private detectDocumentType(
    text: string,
  ): TopicExtractionResult["documentType"] {
    const academicIndicators = [
      "abstract",
      "methodology",
      "hypothesis",
      "conclusion",
      "references",
      "bibliography",
      "citation",
      "peer-reviewed",
      "journal",
      "dissertation",
    ];

    const businessIndicators = [
      "quarterly",
      "annual report",
      "revenue",
      "profit",
      "market share",
      "stakeholder",
      "executive summary",
      "forecast",
      "budget",
      "roi",
    ];

    const technicalIndicators = [
      "implementation",
      "architecture",
      "api",
      "algorithm",
      "configuration",
      "deployment",
      "debugging",
      "optimization",
      "performance",
      "scalability",
    ];

    const academicScore = this.countMatches(text, academicIndicators);
    const businessScore = this.countMatches(text, businessIndicators);
    const technicalScore = this.countMatches(text, technicalIndicators);

    const maxScore = Math.max(academicScore, businessScore, technicalScore);

    if (maxScore === 0) return "general";
    if (academicScore === maxScore) return "academic";
    if (businessScore === maxScore) return "business";
    if (technicalScore === maxScore) return "technical";
    return "general";
  }

  private countMatches(text: string, indicators: string[]): number {
    return indicators.filter((ind) => text.includes(ind)).length;
  }
}

export const topicExtractorService = new TopicExtractorService();
