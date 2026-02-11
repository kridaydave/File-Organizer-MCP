/**
 * File Signatures Database for Content-Based File Type Detection
 *
 * This module provides a comprehensive database of file signatures (magic numbers)
 * for detecting file types based on their binary content rather than just extensions.
 *
 * @module file-signatures
 */

/**
 * Represents a file signature entry with all metadata needed for detection
 */
export interface FileSignature {
  /** Unique identifier for the file type (e.g., 'PDF', 'JPEG') */
  type: string;
  /** MIME type associated with this file format */
  mimeType: string;
  /** Array of possible magic number signatures (Buffer objects) */
  signatures: Buffer[];
  /** Common file extensions (with dot) */
  extensions: string[];
  /** Category for grouping and security classification */
  category:
    | "Document"
    | "Image"
    | "Executable"
    | "Archive"
    | "Audio"
    | "Video"
    | "Code"
    | "Other";
  /** Human-readable description of the file format */
  description: string;
  /** Optional: offset where signature starts (default: 0) */
  offset?: number;
  /** Optional: additional validation function for complex formats */
  validator?: (buffer: Buffer) => boolean;
}

// =============================================================================
// DOCUMENT SIGNATURES
// =============================================================================

const PDF_SIGNATURE: FileSignature = {
  type: "PDF",
  mimeType: "application/pdf",
  signatures: [Buffer.from([0x25, 0x50, 0x44, 0x46])], // %PDF
  extensions: [".pdf"],
  category: "Document",
  description: "Adobe Portable Document Format",
};

const DOCX_SIGNATURE: FileSignature = {
  type: "DOCX",
  mimeType:
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  signatures: [Buffer.from([0x50, 0x4b, 0x03, 0x04])], // PK.. (ZIP-based)
  extensions: [".docx", ".docm"],
  category: "Document",
  description: "Microsoft Word Open XML Document (ZIP-based)",
  validator: (buffer: Buffer) => {
    // Check for [Content_Types].xml pattern in ZIP
    const contentTypesPattern = Buffer.from("[Content_Types].xml");
    return buffer.includes(contentTypesPattern);
  },
};

const XLSX_SIGNATURE: FileSignature = {
  type: "XLSX",
  mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  signatures: [Buffer.from([0x50, 0x4b, 0x03, 0x04])], // PK.. (ZIP-based)
  extensions: [".xlsx", ".xlsm"],
  category: "Document",
  description: "Microsoft Excel Open XML Spreadsheet (ZIP-based)",
  validator: (buffer: Buffer) => {
    // Check for xl/ pattern in ZIP
    const xlPattern = Buffer.from("xl/");
    return buffer.includes(xlPattern);
  },
};

const PPTX_SIGNATURE: FileSignature = {
  type: "PPTX",
  mimeType:
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  signatures: [Buffer.from([0x50, 0x4b, 0x03, 0x04])], // PK.. (ZIP-based)
  extensions: [".pptx", ".pptm"],
  category: "Document",
  description: "Microsoft PowerPoint Open XML Presentation (ZIP-based)",
  validator: (buffer: Buffer) => {
    // Check for ppt/ pattern in ZIP
    const pptPattern = Buffer.from("ppt/");
    return buffer.includes(pptPattern);
  },
};

const OLD_DOC_SIGNATURE: FileSignature = {
  type: "DOC_OLD",
  mimeType: "application/msword",
  signatures: [Buffer.from([0xd0, 0xcf, 0x11, 0xe0])], // OLE2
  extensions: [".doc"],
  category: "Document",
  description: "Microsoft Word 97-2003 Document (OLE2)",
};

const OLD_XLS_SIGNATURE: FileSignature = {
  type: "XLS_OLD",
  mimeType: "application/vnd.ms-excel",
  signatures: [Buffer.from([0xd0, 0xcf, 0x11, 0xe0])], // OLE2
  extensions: [".xls"],
  category: "Document",
  description: "Microsoft Excel 97-2003 Spreadsheet (OLE2)",
};

const OLD_PPT_SIGNATURE: FileSignature = {
  type: "PPT_OLD",
  mimeType: "application/vnd.ms-powerpoint",
  signatures: [Buffer.from([0xd0, 0xcf, 0x11, 0xe0])], // OLE2
  extensions: [".ppt"],
  category: "Document",
  description: "Microsoft PowerPoint 97-2003 Presentation (OLE2)",
};

const RTF_SIGNATURE: FileSignature = {
  type: "RTF",
  mimeType: "application/rtf",
  signatures: [Buffer.from([0x7b, 0x5c, 0x72, 0x74, 0x66, 0x31])], // {\rtf1
  extensions: [".rtf"],
  category: "Document",
  description: "Rich Text Format",
};

const ODT_SIGNATURE: FileSignature = {
  type: "ODT",
  mimeType: "application/vnd.oasis.opendocument.text",
  signatures: [Buffer.from([0x50, 0x4b, 0x03, 0x04])], // ZIP-based
  extensions: [".odt"],
  category: "Document",
  description: "OpenDocument Text",
  validator: (buffer: Buffer) => {
    return buffer.includes(
      Buffer.from("mimetypeapplication/vnd.oasis.opendocument.text"),
    );
  },
};

// =============================================================================
// IMAGE SIGNATURES
// =============================================================================

const JPEG_SIGNATURE: FileSignature = {
  type: "JPEG",
  mimeType: "image/jpeg",
  signatures: [
    Buffer.from([0xff, 0xd8, 0xff, 0xe0]), // JFIF
    Buffer.from([0xff, 0xd8, 0xff, 0xe1]), // Exif
    Buffer.from([0xff, 0xd8, 0xff, 0xe8]), // SPIFF
    Buffer.from([0xff, 0xd8, 0xff, 0xdb]), // Raw JPEG
    Buffer.from([0xff, 0xd8, 0xff, 0xee]), // Samsung JPEG
  ],
  extensions: [".jpg", ".jpeg", ".jpe"],
  category: "Image",
  description: "JPEG Image",
};

const PNG_SIGNATURE: FileSignature = {
  type: "PNG",
  mimeType: "image/png",
  signatures: [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
  extensions: [".png"],
  category: "Image",
  description: "Portable Network Graphics",
};

const GIF87_SIGNATURE: FileSignature = {
  type: "GIF87",
  mimeType: "image/gif",
  signatures: [Buffer.from([0x47, 0x49, 0x46, 0x38, 0x37, 0x61])], // GIF87a
  extensions: [".gif"],
  category: "Image",
  description: "Graphics Interchange Format (87a)",
};

const GIF89_SIGNATURE: FileSignature = {
  type: "GIF89",
  mimeType: "image/gif",
  signatures: [Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])], // GIF89a
  extensions: [".gif"],
  category: "Image",
  description: "Graphics Interchange Format (89a)",
};

const BMP_SIGNATURE: FileSignature = {
  type: "BMP",
  mimeType: "image/bmp",
  signatures: [Buffer.from([0x42, 0x4d])], // BM
  extensions: [".bmp", ".dib"],
  category: "Image",
  description: "Bitmap Image File",
};

const WEBP_SIGNATURE: FileSignature = {
  type: "WEBP",
  mimeType: "image/webp",
  signatures: [
    Buffer.from([0x52, 0x49, 0x46, 0x46]), // RIFF
    Buffer.from([0x57, 0x45, 0x42, 0x50]), // WEBP at offset 8
  ],
  extensions: [".webp"],
  category: "Image",
  description: "WebP Image",
  validator: (buffer: Buffer) => {
    // Check for WEBP at offset 8
    if (buffer.length < 12) return false;
    const webpPattern = Buffer.from([0x57, 0x45, 0x42, 0x50]);
    return buffer.slice(8, 12).equals(webpPattern);
  },
};

const TIFF_LE_SIGNATURE: FileSignature = {
  type: "TIFF_LE",
  mimeType: "image/tiff",
  signatures: [Buffer.from([0x49, 0x49, 0x2a, 0x00])], // II*
  extensions: [".tif", ".tiff"],
  category: "Image",
  description: "Tagged Image File Format (Little Endian)",
};

const TIFF_BE_SIGNATURE: FileSignature = {
  type: "TIFF_BE",
  mimeType: "image/tiff",
  signatures: [Buffer.from([0x4d, 0x4d, 0x00, 0x2a])], // MM*
  extensions: [".tif", ".tiff"],
  category: "Image",
  description: "Tagged Image File Format (Big Endian)",
};

const ICO_SIGNATURE: FileSignature = {
  type: "ICO",
  mimeType: "image/x-icon",
  signatures: [Buffer.from([0x00, 0x00, 0x01, 0x00])],
  extensions: [".ico"],
  category: "Image",
  description: "Windows Icon",
};

const SVG_SIGNATURE: FileSignature = {
  type: "SVG",
  mimeType: "image/svg+xml",
  signatures: [],
  extensions: [".svg"],
  category: "Image",
  description: "Scalable Vector Graphics",
  validator: (buffer: Buffer) => {
    const content = buffer.toString("utf-8", 0, Math.min(buffer.length, 1000));
    return content.includes("<svg") || content.includes("<?xml");
  },
};

// =============================================================================
// EXECUTABLE SIGNATURES (SECURITY CRITICAL)
// =============================================================================

const EXE_SIGNATURE: FileSignature = {
  type: "EXE",
  mimeType: "application/x-msdownload",
  signatures: [Buffer.from([0x4d, 0x5a])], // MZ
  extensions: [".exe", ".dll", ".ocx", ".sys", ".scr"],
  category: "Executable",
  description: "Windows/DOS Executable (PE format)",
};

const ELF_SIGNATURE: FileSignature = {
  type: "ELF",
  mimeType: "application/x-executable",
  signatures: [
    Buffer.from([0x7f, 0x45, 0x4c, 0x46]), // \x7FELF
  ],
  extensions: [".elf", ".bin", ""],
  category: "Executable",
  description: "Executable and Linkable Format (Unix/Linux)",
};

const MACHO_32_SIGNATURE: FileSignature = {
  type: "MACHO_32",
  mimeType: "application/x-mach-binary",
  signatures: [Buffer.from([0xfe, 0xed, 0xfa, 0xce])], // 0xFEEDFACE
  extensions: [".o", ".dylib"],
  category: "Executable",
  description: "Mach-O 32-bit (macOS/iOS)",
};

const MACHO_64_SIGNATURE: FileSignature = {
  type: "MACHO_64",
  mimeType: "application/x-mach-binary",
  signatures: [Buffer.from([0xfe, 0xed, 0xfa, 0xcf])], // 0xFEEDFACF
  extensions: [".o", ".dylib"],
  category: "Executable",
  description: "Mach-O 64-bit (macOS/iOS)",
};

const MACHO_FAT_SIGNATURE: FileSignature = {
  type: "MACHO_FAT",
  mimeType: "application/x-mach-binary",
  signatures: [
    Buffer.from([0xca, 0xfe, 0xba, 0xbe]), // FAT binary
    Buffer.from([0xca, 0xfe, 0xba, 0xbf]), // FAT binary 64
  ],
  extensions: [".o", ".dylib"],
  category: "Executable",
  description: "Mach-O Universal/FAT Binary (macOS/iOS)",
};

const MSI_SIGNATURE: FileSignature = {
  type: "MSI",
  mimeType: "application/x-msi",
  signatures: [Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])],
  extensions: [".msi"],
  category: "Executable",
  description: "Microsoft Windows Installer Package",
};

const JAVA_CLASS_SIGNATURE: FileSignature = {
  type: "JAVA_CLASS",
  mimeType: "application/java-vm",
  signatures: [Buffer.from([0xca, 0xfe, 0xba, 0xbe])], // 0xCAFEBABE
  extensions: [".class"],
  category: "Executable",
  description: "Java Class File",
};

const JAR_SIGNATURE: FileSignature = {
  type: "JAR",
  mimeType: "application/java-archive",
  signatures: [Buffer.from([0x50, 0x4b, 0x03, 0x04])], // ZIP-based
  extensions: [".jar"],
  category: "Executable",
  description: "Java Archive (ZIP-based)",
  validator: (buffer: Buffer) => {
    return buffer.includes(Buffer.from("META-INF/MANIFEST.MF"));
  },
};

// =============================================================================
// ARCHIVE SIGNATURES
// =============================================================================

const ZIP_SIGNATURE: FileSignature = {
  type: "ZIP",
  mimeType: "application/zip",
  signatures: [Buffer.from([0x50, 0x4b, 0x03, 0x04])],
  extensions: [".zip"],
  category: "Archive",
  description: "ZIP Archive",
};

const RAR_SIGNATURE: FileSignature = {
  type: "RAR",
  mimeType: "application/x-rar-compressed",
  signatures: [
    Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00]), // RAR v1.5+
    Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00]), // RAR v5+
  ],
  extensions: [".rar"],
  category: "Archive",
  description: "Roshal Archive",
};

const SEVENZ_SIGNATURE: FileSignature = {
  type: "7Z",
  mimeType: "application/x-7z-compressed",
  signatures: [Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])],
  extensions: [".7z"],
  category: "Archive",
  description: "7-Zip Archive",
};

const TAR_SIGNATURE: FileSignature = {
  type: "TAR",
  mimeType: "application/x-tar",
  signatures: [
    Buffer.from([0x75, 0x73, 0x74, 0x61, 0x72]), // ustar at offset 257
    Buffer.from([0x75, 0x73, 0x74, 0x61, 0x72, 0x00, 0x30, 0x30]), // ustar\0 00
  ],
  extensions: [".tar"],
  category: "Archive",
  description: "Tape Archive",
  offset: 257,
};

const GZIP_SIGNATURE: FileSignature = {
  type: "GZIP",
  mimeType: "application/gzip",
  signatures: [Buffer.from([0x1f, 0x8b])],
  extensions: [".gz", ".gzip"],
  category: "Archive",
  description: "GZIP Compressed",
};

const BZIP2_SIGNATURE: FileSignature = {
  type: "BZIP2",
  mimeType: "application/x-bzip2",
  signatures: [Buffer.from([0x42, 0x5a, 0x68])], // BZh
  extensions: [".bz2"],
  category: "Archive",
  description: "Bzip2 Compressed",
};

const XZ_SIGNATURE: FileSignature = {
  type: "XZ",
  mimeType: "application/x-xz",
  signatures: [Buffer.from([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00, 0x00])], // \xFD7zXZ\0\0
  extensions: [".xz"],
  category: "Archive",
  description: "XZ Compressed",
};

// =============================================================================
// AUDIO/VIDEO SIGNATURES
// =============================================================================

const MP3_ID3_SIGNATURE: FileSignature = {
  type: "MP3_ID3",
  mimeType: "audio/mpeg",
  signatures: [Buffer.from([0x49, 0x44, 0x33])], // ID3
  extensions: [".mp3"],
  category: "Audio",
  description: "MP3 Audio with ID3 tag",
};

const MP3_RAW_SIGNATURE: FileSignature = {
  type: "MP3_RAW",
  mimeType: "audio/mpeg",
  signatures: [
    Buffer.from([0xff, 0xfb]), // MPEG-1 Layer 3 without CRC
    Buffer.from([0xff, 0xf3]), // MPEG-1 Layer 3 with CRC
    Buffer.from([0xff, 0xfa]), // MPEG-2 Layer 3 without CRC
    Buffer.from([0xff, 0xf2]), // MPEG-2 Layer 3 with CRC
  ],
  extensions: [".mp3"],
  category: "Audio",
  description: "MP3 Audio (raw frames)",
};

const MP4_SIGNATURE: FileSignature = {
  type: "MP4",
  mimeType: "video/mp4",
  signatures: [
    Buffer.from([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70]), // ftyp at offset 4
    Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]),
  ],
  extensions: [".mp4", ".m4v", ".m4a"],
  category: "Video",
  description: "MPEG-4 Part 14",
  validator: (buffer: Buffer) => {
    if (buffer.length < 12) return false;
    // Check for ftyp at offset 4
    return buffer.slice(4, 8).toString() === "ftyp";
  },
};

const AVI_SIGNATURE: FileSignature = {
  type: "AVI",
  mimeType: "video/x-msvideo",
  signatures: [
    Buffer.from([0x52, 0x49, 0x46, 0x46]), // RIFF
  ],
  extensions: [".avi"],
  category: "Video",
  description: "Audio Video Interleave",
  validator: (buffer: Buffer) => {
    if (buffer.length < 12) return false;
    // Check for AVI at offset 8
    return buffer.slice(8, 12).toString() === "AVI ";
  },
};

const MOV_SIGNATURE: FileSignature = {
  type: "MOV",
  mimeType: "video/quicktime",
  signatures: [
    Buffer.from([
      0x00, 0x00, 0x00, 0x14, 0x66, 0x74, 0x79, 0x70, 0x71, 0x74, 0x20, 0x20,
    ]), // ftyp qt
    Buffer.from([
      0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x71, 0x74, 0x20, 0x20,
    ]),
  ],
  extensions: [".mov", ".qt"],
  category: "Video",
  description: "QuickTime Movie",
};

const MKV_SIGNATURE: FileSignature = {
  type: "MKV",
  mimeType: "video/x-matroska",
  signatures: [
    Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), // EBML header
  ],
  extensions: [".mkv", ".mka", ".webm"],
  category: "Video",
  description: "Matroska Video",
};

const FLV_SIGNATURE: FileSignature = {
  type: "FLV",
  mimeType: "video/x-flv",
  signatures: [Buffer.from([0x46, 0x4c, 0x56])], // FLV
  extensions: [".flv"],
  category: "Video",
  description: "Flash Video",
};

const WAV_SIGNATURE: FileSignature = {
  type: "WAV",
  mimeType: "audio/wav",
  signatures: [Buffer.from([0x52, 0x49, 0x46, 0x46])], // RIFF
  extensions: [".wav"],
  category: "Audio",
  description: "Waveform Audio File Format",
  validator: (buffer: Buffer) => {
    if (buffer.length < 12) return false;
    return buffer.slice(8, 12).toString() === "WAVE";
  },
};

const FLAC_SIGNATURE: FileSignature = {
  type: "FLAC",
  mimeType: "audio/flac",
  signatures: [Buffer.from([0x66, 0x4c, 0x61, 0x43])], // fLaC
  extensions: [".flac"],
  category: "Audio",
  description: "Free Lossless Audio Codec",
};

const OGG_SIGNATURE: FileSignature = {
  type: "OGG",
  mimeType: "audio/ogg",
  signatures: [Buffer.from([0x4f, 0x67, 0x67, 0x53])], // OggS
  extensions: [".ogg", ".oga", ".ogv"],
  category: "Audio",
  description: "Ogg Container Format",
};

// =============================================================================
// CODE SIGNATURES
// =============================================================================

const JS_SIGNATURE: FileSignature = {
  type: "JS",
  mimeType: "application/javascript",
  signatures: [],
  extensions: [".js", ".mjs", ".cjs"],
  category: "Code",
  description: "JavaScript Source File",
  validator: (buffer: Buffer) => {
    const content = buffer.toString("utf-8", 0, Math.min(buffer.length, 500));
    // Check for shebang or typical JS patterns
    return (
      content.startsWith("#!/usr/bin/env node") ||
      content.startsWith("#!/usr/bin/node") ||
      /^(const|let|var|import|export|function|class|async|await|\/\/|\/\*|"use strict"|'use strict')/.test(
        content.trim(),
      )
    );
  },
};

const HTML_SIGNATURE: FileSignature = {
  type: "HTML",
  mimeType: "text/html",
  signatures: [],
  extensions: [".html", ".htm"],
  category: "Code",
  description: "HyperText Markup Language",
  validator: (buffer: Buffer) => {
    const content = buffer
      .toString("utf-8", 0, Math.min(buffer.length, 1000))
      .toLowerCase();
    return (
      content.startsWith("<!doctype") ||
      content.startsWith("<html") ||
      content.startsWith("<?xml")
    );
  },
};

const CSS_SIGNATURE: FileSignature = {
  type: "CSS",
  mimeType: "text/css",
  signatures: [],
  extensions: [".css"],
  category: "Code",
  description: "Cascading Style Sheets",
  validator: (buffer: Buffer) => {
    const content = buffer.toString("utf-8", 0, Math.min(buffer.length, 500));
    // Simple heuristic: looks for CSS-like patterns
    return /\{[^}]*:[^}]*\}/.test(content) && !content.includes("<");
  },
};

const JSON_SIGNATURE: FileSignature = {
  type: "JSON",
  mimeType: "application/json",
  signatures: [
    Buffer.from([0x7b]), // {
    Buffer.from([0x5b]), // [
  ],
  extensions: [".json"],
  category: "Code",
  description: "JavaScript Object Notation",
  validator: (buffer: Buffer) => {
    const content = buffer.toString("utf-8", 0, Math.min(buffer.length, 100));
    const trimmed = content.trim();
    return (
      (trimmed.startsWith("{") || trimmed.startsWith("[")) &&
      (trimmed.includes(":") || trimmed.includes('"'))
    );
  },
};

const XML_SIGNATURE: FileSignature = {
  type: "XML",
  mimeType: "application/xml",
  signatures: [],
  extensions: [".xml"],
  category: "Code",
  description: "eXtensible Markup Language",
  validator: (buffer: Buffer) => {
    const content = buffer.toString("utf-8", 0, Math.min(buffer.length, 500));
    return content.trimStart().startsWith("<?xml");
  },
};

const TS_SIGNATURE: FileSignature = {
  type: "TS",
  mimeType: "application/typescript",
  signatures: [],
  extensions: [".ts", ".tsx"],
  category: "Code",
  description: "TypeScript Source File",
  validator: (buffer: Buffer) => {
    const content = buffer.toString("utf-8", 0, Math.min(buffer.length, 500));
    // TypeScript-specific patterns
    return (
      /:\s*(string|number|boolean|any|void|interface|type)\s/.test(content) ||
      content.includes(": React.") ||
      content.includes("interface ") ||
      content.includes("type ")
    );
  },
};

const PYTHON_SIGNATURE: FileSignature = {
  type: "PYTHON",
  mimeType: "text/x-python",
  signatures: [],
  extensions: [".py"],
  category: "Code",
  description: "Python Source File",
  validator: (buffer: Buffer) => {
    const content = buffer.toString("utf-8", 0, Math.min(buffer.length, 500));
    return (
      content.startsWith("#!/usr/bin/env python") ||
      content.startsWith("#!/usr/bin/python") ||
      /^(import|from|def|class|if __name__)/.test(content.trim())
    );
  },
};

const SHEBANG_SIGNATURE: FileSignature = {
  type: "SHEBANG",
  mimeType: "text/x-script",
  signatures: [Buffer.from([0x23, 0x21])], // #!
  extensions: [".sh", ".bash", ".zsh", ""],
  category: "Code",
  description: "Shebang Script File",
};

// =============================================================================
// MAIN DATABASE
// =============================================================================

/**
 * Comprehensive database of file signatures for content-based type detection
 */
export const FILE_SIGNATURES: FileSignature[] = [
  // Documents
  PDF_SIGNATURE,
  DOCX_SIGNATURE,
  XLSX_SIGNATURE,
  PPTX_SIGNATURE,
  OLD_DOC_SIGNATURE,
  OLD_XLS_SIGNATURE,
  OLD_PPT_SIGNATURE,
  RTF_SIGNATURE,
  ODT_SIGNATURE,

  // Images
  JPEG_SIGNATURE,
  PNG_SIGNATURE,
  GIF87_SIGNATURE,
  GIF89_SIGNATURE,
  BMP_SIGNATURE,
  WEBP_SIGNATURE,
  TIFF_LE_SIGNATURE,
  TIFF_BE_SIGNATURE,
  ICO_SIGNATURE,
  SVG_SIGNATURE,

  // Executables (Security Critical)
  EXE_SIGNATURE,
  ELF_SIGNATURE,
  MACHO_32_SIGNATURE,
  MACHO_64_SIGNATURE,
  MACHO_FAT_SIGNATURE,
  MSI_SIGNATURE,
  JAVA_CLASS_SIGNATURE,
  JAR_SIGNATURE,

  // Archives
  ZIP_SIGNATURE,
  RAR_SIGNATURE,
  SEVENZ_SIGNATURE,
  TAR_SIGNATURE,
  GZIP_SIGNATURE,
  BZIP2_SIGNATURE,
  XZ_SIGNATURE,

  // Audio/Video
  MP3_ID3_SIGNATURE,
  MP3_RAW_SIGNATURE,
  MP4_SIGNATURE,
  AVI_SIGNATURE,
  MOV_SIGNATURE,
  MKV_SIGNATURE,
  FLV_SIGNATURE,
  WAV_SIGNATURE,
  FLAC_SIGNATURE,
  OGG_SIGNATURE,

  // Code
  JS_SIGNATURE,
  HTML_SIGNATURE,
  CSS_SIGNATURE,
  JSON_SIGNATURE,
  XML_SIGNATURE,
  TS_SIGNATURE,
  PYTHON_SIGNATURE,
  SHEBANG_SIGNATURE,
];

/**
 * Security-critical file types that should trigger warnings
 * These represent potentially executable content
 */
export const EXECUTABLE_SIGNATURES: string[] = [
  "EXE",
  "ELF",
  "MACHO_32",
  "MACHO_64",
  "MACHO_FAT",
  "MSI",
  "JAVA_CLASS",
  "JAR",
  "SHEBANG",
];

/**
 * Map of file extensions to their expected signature types
 * Used for detecting extension/signature mismatches
 */
export const EXTENSION_TO_SIGNATURE: Record<string, string[]> = {
  // Documents
  ".pdf": ["PDF"],
  ".docx": ["DOCX"],
  ".docm": ["DOCX"],
  ".xlsx": ["XLSX"],
  ".xlsm": ["XLSX"],
  ".pptx": ["PPTX"],
  ".pptm": ["PPTX"],
  ".doc": ["DOC_OLD"],
  ".xls": ["XLS_OLD"],
  ".ppt": ["PPT_OLD"],
  ".rtf": ["RTF"],
  ".odt": ["ODT"],

  // Images
  ".jpg": ["JPEG"],
  ".jpeg": ["JPEG"],
  ".jpe": ["JPEG"],
  ".png": ["PNG"],
  ".gif": ["GIF87", "GIF89"],
  ".bmp": ["BMP"],
  ".dib": ["BMP"],
  ".webp": ["WEBP"],
  ".tif": ["TIFF_LE", "TIFF_BE"],
  ".tiff": ["TIFF_LE", "TIFF_BE"],
  ".ico": ["ICO"],
  ".svg": ["SVG"],

  // Executables
  ".exe": ["EXE"],
  ".dll": ["EXE"],
  ".ocx": ["EXE"],
  ".sys": ["EXE"],
  ".scr": ["EXE"],
  ".elf": ["ELF"],
  ".bin": ["ELF"],
  ".msi": ["MSI"],
  ".class": ["JAVA_CLASS"],
  ".jar": ["JAR"],

  // Archives
  ".zip": ["ZIP"],
  ".rar": ["RAR"],
  ".7z": ["7Z"],
  ".tar": ["TAR"],
  ".gz": ["GZIP"],
  ".gzip": ["GZIP"],
  ".bz2": ["BZIP2"],
  ".xz": ["XZ"],

  // Audio/Video
  ".mp3": ["MP3_ID3", "MP3_RAW"],
  ".mp4": ["MP4"],
  ".m4v": ["MP4"],
  ".m4a": ["MP4"],
  ".avi": ["AVI"],
  ".mov": ["MOV"],
  ".qt": ["MOV"],
  ".mkv": ["MKV"],
  ".mka": ["MKV"],
  ".webm": ["MKV"],
  ".flv": ["FLV"],
  ".wav": ["WAV"],
  ".flac": ["FLAC"],
  ".ogg": ["OGG"],
  ".oga": ["OGG"],
  ".ogv": ["OGG"],

  // Code
  ".js": ["JS"],
  ".mjs": ["JS"],
  ".cjs": ["JS"],
  ".html": ["HTML"],
  ".htm": ["HTML"],
  ".css": ["CSS"],
  ".json": ["JSON"],
  ".xml": ["XML"],
  ".ts": ["TS"],
  ".tsx": ["TS"],
  ".py": ["PYTHON"],
  ".sh": ["SHEBANG"],
  ".bash": ["SHEBANG"],
  ".zsh": ["SHEBANG"],
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Lookup map for fast signature retrieval by type
 */
const signatureByTypeMap: Map<string, FileSignature> = new Map(
  FILE_SIGNATURES.map((sig) => [sig.type, sig]),
);

/**
 * Lookup map for fast signature retrieval by extension
 */
const signaturesByExtensionMap: Map<string, FileSignature[]> = new Map();
for (const [ext, types] of Object.entries(EXTENSION_TO_SIGNATURE)) {
  signaturesByExtensionMap.set(
    ext,
    types
      .map((type) => signatureByTypeMap.get(type))
      .filter((sig): sig is FileSignature => sig !== undefined),
  );
}

/**
 * Get a file signature definition by its type identifier
 * @param type - The file type identifier (e.g., 'PDF', 'JPEG')
 * @returns The FileSignature definition or undefined if not found
 */
export function getSignatureByType(type: string): FileSignature | undefined {
  return signatureByTypeMap.get(type.toUpperCase());
}

/**
 * Get all file signatures associated with a file extension
 * @param ext - The file extension (with or without leading dot)
 * @returns Array of matching FileSignature definitions
 */
export function getSignaturesByExtension(ext: string): FileSignature[] {
  // Normalize extension to include leading dot
  const normalizedExt = ext.startsWith(".")
    ? ext.toLowerCase()
    : `.${ext.toLowerCase()}`;
  return signaturesByExtensionMap.get(normalizedExt) ?? [];
}

/**
 * Check if a file type is considered security-critical (executable)
 * @param type - The file type identifier
 * @returns True if the type represents executable content
 */
export function isExecutableSignature(type: string): boolean {
  return EXECUTABLE_SIGNATURES.includes(type.toUpperCase());
}

/**
 * Match a buffer against known file signatures
 * @param buffer - The buffer to analyze (first few bytes of a file)
 * @param options - Optional configuration for matching
 * @returns The matched FileSignature or null if no match
 */
export function matchSignature(
  buffer: Buffer,
  options?: {
    /** Maximum bytes to read from buffer (default: 8192) */
    maxReadBytes?: number;
    /** Whether to run validators for complex formats (default: true) */
    runValidators?: boolean;
  },
): FileSignature | null {
  const maxReadBytes = options?.maxReadBytes ?? 8192;
  const runValidators = options?.runValidators ?? true;

  const searchBuffer = buffer.slice(0, maxReadBytes);

  for (const signature of FILE_SIGNATURES) {
    const isMatch = checkSignatureMatch(searchBuffer, signature, runValidators);
    if (isMatch) {
      return signature;
    }
  }

  return null;
}

/**
 * Internal helper to check if a buffer matches a specific signature
 */
function checkSignatureMatch(
  buffer: Buffer,
  signature: FileSignature,
  runValidators: boolean,
): boolean {
  // Check magic number signatures first
  if (signature.signatures.length > 0) {
    const offset = signature.offset ?? 0;

    for (const sig of signature.signatures) {
      if (buffer.length < offset + sig.length) {
        continue;
      }

      const bufferSlice = buffer.slice(offset, offset + sig.length);
      if (bufferSlice.equals(sig)) {
        // Run validator if present and requested
        if (runValidators && signature.validator) {
          return signature.validator(buffer);
        }
        return true;
      }
    }

    // If we have magic numbers but none matched, return false
    // (unless there's a validator that might pass)
    if (!signature.validator) {
      return false;
    }
  }

  // Check validator-based signatures (no magic numbers)
  if (runValidators && signature.validator) {
    return signature.validator(buffer);
  }

  return false;
}

/**
 * Detect potential file type mismatches between extension and content
 * @param filePath - Path to the file
 * @param buffer - Buffer containing file content
 * @returns Object with mismatch information or null if no mismatch
 */
export function detectExtensionMismatch(
  filePath: string,
  buffer: Buffer,
): { detectedType: string; expectedTypes: string[] } | null {
  const path = require("path");
  const ext = path.extname(filePath).toLowerCase();

  if (!ext) {
    return null; // No extension to check against
  }

  const detectedSignature = matchSignature(buffer);
  if (!detectedSignature) {
    return null; // Could not detect type
  }

  const expectedTypes = EXTENSION_TO_SIGNATURE[ext];
  if (!expectedTypes) {
    return null; // Unknown extension
  }

  if (!expectedTypes.includes(detectedSignature.type)) {
    return {
      detectedType: detectedSignature.type,
      expectedTypes,
    };
  }

  return null;
}

/**
 * Get all signatures for a specific category
 * @param category - The category to filter by
 * @returns Array of FileSignature definitions in that category
 */
export function getSignaturesByCategory(
  category: FileSignature["category"],
): FileSignature[] {
  return FILE_SIGNATURES.filter((sig) => sig.category === category);
}

/**
 * Check if a buffer contains executable content
 * Convenience function for security checks
 * @param buffer - The buffer to analyze
 * @returns True if the buffer matches an executable signature
 */
export function isExecutableContent(buffer: Buffer): boolean {
  const match = matchSignature(buffer);
  return match !== null && isExecutableSignature(match.type);
}
