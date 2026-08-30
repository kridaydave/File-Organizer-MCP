/**
 * File Organizer MCP Server v5.0.0
 * Tokenization and naming for project detection (pure string work).
 */

export const GENERIC_NAME_TOKENS = new Set([
  "img", "image", "photo", "pic", "screenshot", "screen", "capture",
  "copy", "final", "new", "tmp", "temp", "backup", "draft", "old",
  "file", "document", "doc", "pdf", "txt", "md", "docx", "png", "jpg",
  "jpeg", "gif", "webp", "csv", "xls", "xlsx", "ppt", "pptx", "zip",
  "tar", "gz", "rar", "7z", "mp3", "mp4", "wav", "test", "untitled",
  "unknown", "download", "downloads", "export", "import",
]);

export const MARKER_PATTERN = /\b[A-Z]{2,3}[-_]?\d{3,7}\b/g;

const STOP_WORDS: ReadonlySet<string> = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "as", "is", "was", "are", "were", "been",
  "be", "have", "has", "had", "do", "does", "did", "will", "would",
  "could", "should", "may", "might", "must", "shall", "can", "need",
  "dare", "ought", "used", "this", "that", "these", "those", "i", "you",
  "he", "she", "it", "we", "they", "what", "which", "who", "whom",
  "whose", "where", "when", "why", "how", "all", "each", "every", "both",
  "few", "more", "most", "other", "some", "such", "no", "nor", "not",
  "only", "own", "same", "so", "than", "too", "very", "just", "also",
  "now", "here", "there", "then", "once", "if", "else", "because",
  "until", "while", "about", "against", "between", "into", "through",
  "during", "before", "after", "above", "below",
]);

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

/**
 * Split a file name into lowercase tokens.
 * Strips the extension, splits camelCase and letter/digit boundaries, and
 * drops tokens shorter than 2 characters or made only of digits.
 * @param name - file name including extension
 * @returns lowercase name tokens
 */
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

/**
 * Split extracted text into lowercase content terms.
 * Keeps words of 3 or more characters and removes stop words.
 * @param text - extracted document text
 * @returns lowercase content terms
 */
export function tokenizeContent(text: string): string[] {
  const words = text.toLowerCase().match(/[a-z][a-z0-9]{2,}/g) ?? [];
  return words.filter((word) => !STOP_WORDS.has(word));
}


export function extractMarkers(text: string): string[] {
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

/**
 * Read text from a file for content-term extraction. Only text-like
 * extensions are read (no binary parsing, no extra deps); failures return
 * empty text so the file stays content-blind.
 */
