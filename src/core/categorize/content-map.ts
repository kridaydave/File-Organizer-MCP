/**
 * Map content-detected file types to organizer categories.
 * Pure function over (detectedType, mimeType).
 */

import type { CategoryName } from "../../types.js";

/**
 * Map content-detected type to file organizer category
 */
export function mapContentTypeToCategory(
  detectedType: string,
  mimeType: string,
): CategoryName {
  const type = detectedType.toUpperCase();
  const mime = mimeType.toLowerCase();

  // Images
  if (
    mime.startsWith("image/") ||
    ["PNG", "JPEG", "GIF", "BMP", "WEBP", "TIFF", "ICO", "SVG"].includes(type)
  ) {
    return "Images";
  }

  // Videos
  if (
    mime.startsWith("video/") ||
    ["MP4", "AVI", "MKV", "MOV", "WMV", "FLV", "WEBM"].includes(type)
  ) {
    return "Videos";
  }

  // Audio
  if (
    mime.startsWith("audio/") ||
    ["MP3", "WAV", "FLAC", "OGG", "AAC", "MIDI"].includes(type)
  ) {
    return "Audio";
  }

  // Documents
  if (
    mime.includes("pdf") ||
    mime.includes("document") ||
    [
      "PDF",
      "DOC",
      "DOCX",
      "RTF",
      "ODT",
      "HTML",
      "XML",
      "TEXT",
      "MARKDOWN",
    ].includes(type)
  ) {
    return "Documents";
  }

  // Spreadsheets
  if (
    mime.includes("spreadsheet") ||
    mime.includes("excel") ||
    ["XLS", "XLSX", "CSV", "ODS"].includes(type)
  ) {
    return "Spreadsheets";
  }

  // Presentations
  if (
    mime.includes("presentation") ||
    mime.includes("powerpoint") ||
    ["PPT", "PPTX", "ODP"].includes(type)
  ) {
    return "Presentations";
  }

  // Archives
  if (
    mime.includes("archive") ||
    mime.includes("compressed") ||
    ["ZIP", "RAR", "7Z", "TAR", "GZIP", "BZ2", "XZ"].includes(type)
  ) {
    return "Archives";
  }

  // Executables
  if (
    [
      "EXE",
      "ELF",
      "MACHO",
      "MSI",
      "PE",
      "MACHO_32",
      "MACHO_64",
      "MACHO_SWAP",
      "CLASS",
      "WASM",
      "SWF",
    ].includes(type)
  ) {
    return "Executables";
  }

  // Code (including scripts)
  if (
    mime.includes("script") ||
    mime.includes("javascript") ||
    mime.includes("json") ||
    mime.includes("xml") ||
    mime.includes("css") ||
    ["JS", "NODE", "PYTHON", "SHELL", "BASH", "PERL", "RUBY", "JAR", "JSON", "CSS", "TS"].includes(
      type,
    )
  ) {
    return "Code";
  }

  // Fonts
  if (mime.includes("font") || ["TTF", "OTF", "WOFF", "WOFF2"].includes(type)) {
    return "Fonts";
  }

  // Ebooks
  if (["EPUB", "MOBI", "AZW", "AZW3"].includes(type)) {
    return "Ebooks";
  }

  // Unknown
  return "Others";
}
