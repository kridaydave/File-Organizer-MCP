/**
 * File Organizer MCP Server v3.4.1
 * Content Analyzer Service - Phase 1
 * Detects true file types using magic numbers and file signatures
 */

import { open } from "fs/promises";
import { extname } from "path";
import { logger } from "../utils/logger.js";

// ==================== Type Definitions ====================

export interface ContentAnalysisResult {
  filePath: string;
  detectedType: string;
  mimeType: string;
  confidence: number;
  extensionMatch: boolean;
  warnings: string[];
}

export interface FileTypeDetection {
  type: string;
  mimeType: string;
  signatures: Buffer[];
  extensions: string[];
  category: FileCategory;
  isExecutable: boolean;
  description: string;
}

type FileCategory =
  | "document"
  | "image"
  | "video"
  | "audio"
  | "archive"
  | "executable"
  | "script"
  | "code"
  | "font"
  | "database"
  | "unknown";

interface DetectionMatch {
  fileType: FileTypeDetection;
  signatureIndex: number;
  confidence: number;
}

// ==================== Magic Number Database ====================

const FILE_SIGNATURES: FileTypeDetection[] = [
  // Images
  {
    type: "PNG",
    mimeType: "image/png",
    signatures: [Buffer.from([0x89, 0x50, 0x4e, 0x47])],
    extensions: [".png"],
    category: "image",
    isExecutable: false,
    description: "Portable Network Graphics",
  },
  {
    type: "JPEG",
    mimeType: "image/jpeg",
    signatures: [
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]), // JFIF
      Buffer.from([0xff, 0xd8, 0xff, 0xe1]), // Exif
      Buffer.from([0xff, 0xd8, 0xff, 0xe8]), // SPIFF
      Buffer.from([0xff, 0xd8, 0xff, 0xdb]), // Raw JPEG
    ],
    extensions: [".jpg", ".jpeg", ".jpe"],
    category: "image",
    isExecutable: false,
    description: "JPEG Image",
  },
  {
    type: "GIF87a",
    mimeType: "image/gif",
    signatures: [Buffer.from([0x47, 0x49, 0x46, 0x38, 0x37, 0x61])],
    extensions: [".gif"],
    category: "image",
    isExecutable: false,
    description: "Graphics Interchange Format (87a)",
  },
  {
    type: "GIF89a",
    mimeType: "image/gif",
    signatures: [Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])],
    extensions: [".gif"],
    category: "image",
    isExecutable: false,
    description: "Graphics Interchange Format (89a)",
  },
  {
    type: "BMP",
    mimeType: "image/bmp",
    signatures: [Buffer.from([0x42, 0x4d])],
    extensions: [".bmp", ".dib"],
    category: "image",
    isExecutable: false,
    description: "Bitmap Image",
  },
  {
    type: "TIFF_LE",
    mimeType: "image/tiff",
    signatures: [Buffer.from([0x49, 0x49, 0x2a, 0x00])],
    extensions: [".tif", ".tiff"],
    category: "image",
    isExecutable: false,
    description: "TIFF Image (Little Endian)",
  },
  {
    type: "TIFF_BE",
    mimeType: "image/tiff",
    signatures: [Buffer.from([0x4d, 0x4d, 0x00, 0x2a])],
    extensions: [".tif", ".tiff"],
    category: "image",
    isExecutable: false,
    description: "TIFF Image (Big Endian)",
  },
  {
    type: "WEBP",
    mimeType: "image/webp",
    signatures: [Buffer.from([0x52, 0x49, 0x46, 0x46])], // RIFF header, need deeper check
    extensions: [".webp"],
    category: "image",
    isExecutable: false,
    description: "WebP Image",
  },
  {
    type: "ICO",
    mimeType: "image/x-icon",
    signatures: [Buffer.from([0x00, 0x00, 0x01, 0x00])],
    extensions: [".ico"],
    category: "image",
    isExecutable: false,
    description: "Windows Icon",
  },
  {
    type: "SVG",
    mimeType: "image/svg+xml",
    signatures: [], // Use validator for complex detection
    extensions: [".svg"],
    category: "image",
    isExecutable: false,
    description: "Scalable Vector Graphics",
  },

  // Documents
  {
    type: "PDF",
    mimeType: "application/pdf",
    signatures: [Buffer.from([0x25, 0x50, 0x44, 0x46])], // %PDF
    extensions: [".pdf"],
    category: "document",
    isExecutable: false,
    description: "Portable Document Format",
  },
  {
    type: "DOC",
    mimeType: "application/msword",
    signatures: [Buffer.from([0xd0, 0xcf, 0x11, 0xe0])], // OLE2
    extensions: [".doc", ".xls", ".ppt", ".msg"],
    category: "document",
    isExecutable: false,
    description: "Microsoft Office Document (OLE2)",
  },
  {
    type: "RTF",
    mimeType: "application/rtf",
    signatures: [Buffer.from("{\\rtf")],
    extensions: [".rtf"],
    category: "document",
    isExecutable: false,
    description: "Rich Text Format",
  },

  // Archives
  {
    type: "ZIP",
    mimeType: "application/zip",
    signatures: [
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.from([0x50, 0x4b, 0x05, 0x06]), // Empty ZIP
      Buffer.from([0x50, 0x4b, 0x07, 0x08]), // Spanned ZIP
    ],
    extensions: [".zip"],
    category: "archive",
    isExecutable: false,
    description: "ZIP Archive",
  },
  {
    type: "GZIP",
    mimeType: "application/gzip",
    signatures: [Buffer.from([0x1f, 0x8b])],
    extensions: [".gz", ".gzip"],
    category: "archive",
    isExecutable: false,
    description: "GZIP Compressed",
  },
  {
    type: "TAR",
    mimeType: "application/x-tar",
    signatures: [Buffer.from("ustar")], // ustar at offset 0x101 - checked separately
    extensions: [".tar"],
    category: "archive",
    isExecutable: false,
    description: "TAR Archive",
  },
  {
    type: "RAR",
    mimeType: "application/vnd.rar",
    signatures: [
      Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00]), // RAR v1.5+
      Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00]), // RAR v5+
    ],
    extensions: [".rar"],
    category: "archive",
    isExecutable: false,
    description: "RAR Archive",
  },
  {
    type: "7Z",
    mimeType: "application/x-7z-compressed",
    signatures: [Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])],
    extensions: [".7z"],
    category: "archive",
    isExecutable: false,
    description: "7-Zip Archive",
  },
  {
    type: "BZ2",
    mimeType: "application/x-bzip2",
    signatures: [Buffer.from([0x42, 0x5a, 0x68])],
    extensions: [".bz2"],
    category: "archive",
    isExecutable: false,
    description: "Bzip2 Compressed",
  },
  {
    type: "XZ",
    mimeType: "application/x-xz",
    signatures: [Buffer.from([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00])],
    extensions: [".xz"],
    category: "archive",
    isExecutable: false,
    description: "XZ Compressed",
  },

  // Executables
  {
    type: "ELF",
    mimeType: "application/x-executable",
    signatures: [Buffer.from([0x7f, 0x45, 0x4c, 0x46])], // \x7fELF
    extensions: [".elf", ""],
    category: "executable",
    isExecutable: true,
    description: "Executable and Linkable Format (Linux/Unix)",
  },
  {
    type: "PE",
    mimeType: "application/vnd.microsoft.portable-executable",
    signatures: [Buffer.from([0x4d, 0x5a])], // MZ
    extensions: [".exe", ".dll", ".sys", ".scr"],
    category: "executable",
    isExecutable: true,
    description: "Portable Executable (Windows)",
  },
  {
    type: "MACHO_32",
    mimeType: "application/x-mach-binary",
    signatures: [Buffer.from([0xfe, 0xed, 0xfa, 0xce])],
    extensions: [".macho", ".dylib", ""],
    category: "executable",
    isExecutable: true,
    description: "Mach-O Binary (32-bit, macOS)",
  },
  {
    type: "MACHO_64",
    mimeType: "application/x-mach-binary",
    signatures: [Buffer.from([0xfe, 0xed, 0xfa, 0xcf])],
    extensions: [".macho", ".dylib", ""],
    category: "executable",
    isExecutable: true,
    description: "Mach-O Binary (64-bit, macOS)",
  },

  // Scripts
  {
    type: "SHELL",
    mimeType: "text/x-shellscript",
    signatures: [Buffer.from("#!/bin/sh")],
    extensions: [".sh", ".bash", ".zsh"],
    category: "script",
    isExecutable: true,
    description: "Shell Script",
  },
  {
    type: "BASH",
    mimeType: "text/x-shellscript",
    signatures: [Buffer.from("#!/bin/bash")],
    extensions: [".sh", ".bash"],
    category: "script",
    isExecutable: true,
    description: "Bash Script",
  },
  {
    type: "PYTHON",
    mimeType: "text/x-python",
    signatures: [Buffer.from("#!/usr/bin/env python")],
    extensions: [".py", ".pyw", ".pyi"],
    category: "script",
    isExecutable: true,
    description: "Python Script",
  },
  {
    type: "PERL",
    mimeType: "text/x-perl",
    signatures: [Buffer.from("#!/usr/bin/perl")],
    extensions: [".pl", ".pm"],
    category: "script",
    isExecutable: true,
    description: "Perl Script",
  },
  {
    type: "RUBY",
    mimeType: "text/x-ruby",
    signatures: [Buffer.from("#!/usr/bin/ruby")],
    extensions: [".rb"],
    category: "script",
    isExecutable: true,
    description: "Ruby Script",
  },
  {
    type: "NODE",
    mimeType: "application/javascript",
    signatures: [Buffer.from("#!/usr/bin/env node")],
    extensions: [".js", ".mjs", ".cjs"],
    category: "script",
    isExecutable: true,
    description: "Node.js Script",
  },

  // Code
  {
    type: "WASM",
    mimeType: "application/wasm",
    signatures: [Buffer.from([0x00, 0x61, 0x73, 0x6d])], // \0asm
    extensions: [".wasm"],
    category: "code",
    isExecutable: true,
    description: "WebAssembly Binary",
  },
  {
    type: "SWF",
    mimeType: "application/x-shockwave-flash",
    signatures: [
      Buffer.from([0x46, 0x57, 0x53]), // FWS (uncompressed)
      Buffer.from([0x43, 0x57, 0x53]), // CWS (compressed)
      Buffer.from([0x5a, 0x57, 0x53]), // ZWS (LZMA compressed)
    ],
    extensions: [".swf"],
    category: "code",
    isExecutable: true,
    description: "Adobe Flash (Security Risk)",
  },
  {
    type: "CLASS",
    mimeType: "application/java-vm",
    signatures: [Buffer.from([0xca, 0xfe, 0xba, 0xbe])],
    extensions: [".class"],
    category: "code",
    isExecutable: true,
    description: "Java Bytecode",
  },

  // Video
  {
    type: "MP4",
    mimeType: "video/mp4",
    signatures: [Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70])], // ftyp box
    extensions: [".mp4", ".m4v", ".m4a"],
    category: "video",
    isExecutable: false,
    description: "MPEG-4 Video/Audio",
  },
  {
    type: "AVI",
    mimeType: "video/x-msvideo",
    signatures: [Buffer.from([0x52, 0x49, 0x46, 0x46])], // RIFF
    extensions: [".avi"],
    category: "video",
    isExecutable: false,
    description: "Audio Video Interleave",
  },
  {
    type: "MKV",
    mimeType: "video/x-matroska",
    signatures: [Buffer.from([0x1a, 0x45, 0xdf, 0xa3])], // EBML header
    extensions: [".mkv", ".mka", ".webm"],
    category: "video",
    isExecutable: false,
    description: "Matroska Video",
  },
  {
    type: "FLV",
    mimeType: "video/x-flv",
    signatures: [Buffer.from([0x46, 0x4c, 0x56, 0x01])], // FLV\x01
    extensions: [".flv"],
    category: "video",
    isExecutable: false,
    description: "Flash Video",
  },
  {
    type: "MOV",
    mimeType: "video/quicktime",
    signatures: [Buffer.from([0x00, 0x00, 0x00, 0x14, 0x66, 0x74, 0x79, 0x70])], // ftyp
    extensions: [".mov", ".qt"],
    category: "video",
    isExecutable: false,
    description: "QuickTime Movie",
  },
  {
    type: "WMV",
    mimeType: "video/x-ms-wmv",
    signatures: [Buffer.from([0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11])], // ASF GUID
    extensions: [".wmv", ".wma", ".asf"],
    category: "video",
    isExecutable: false,
    description: "Windows Media Video",
  },

  // Audio
  {
    type: "MP3_ID3v2",
    mimeType: "audio/mpeg",
    signatures: [Buffer.from([0x49, 0x44, 0x33])], // ID3
    extensions: [".mp3"],
    category: "audio",
    isExecutable: false,
    description: "MP3 Audio (ID3v2)",
  },
  {
    type: "MP3_NO_ID3",
    mimeType: "audio/mpeg",
    signatures: [
      Buffer.from([0xff, 0xfb]),
      Buffer.from([0xff, 0xf3]),
      Buffer.from([0xff, 0xf2]),
    ],
    extensions: [".mp3"],
    category: "audio",
    isExecutable: false,
    description: "MP3 Audio (no ID3)",
  },
  {
    type: "WAV",
    mimeType: "audio/wav",
    signatures: [Buffer.from([0x52, 0x49, 0x46, 0x46])], // RIFF
    extensions: [".wav"],
    category: "audio",
    isExecutable: false,
    description: "WAVE Audio",
  },
  {
    type: "FLAC",
    mimeType: "audio/flac",
    signatures: [Buffer.from([0x66, 0x4c, 0x61, 0x43])], // fLaC
    extensions: [".flac"],
    category: "audio",
    isExecutable: false,
    description: "FLAC Audio",
  },
  {
    type: "OGG",
    mimeType: "audio/ogg",
    signatures: [Buffer.from([0x4f, 0x67, 0x67, 0x53])], // OggS
    extensions: [".ogg", ".oga", ".ogv"],
    category: "audio",
    isExecutable: false,
    description: "OGG Container",
  },
  {
    type: "MIDI",
    mimeType: "audio/midi",
    signatures: [Buffer.from([0x4d, 0x54, 0x68, 0x64])], // MThd
    extensions: [".mid", ".midi"],
    category: "audio",
    isExecutable: false,
    description: "MIDI Audio",
  },
  {
    type: "AAC",
    mimeType: "audio/aac",
    signatures: [Buffer.from([0xff, 0xf1]), Buffer.from([0xff, 0xf9])],
    extensions: [".aac"],
    category: "audio",
    isExecutable: false,
    description: "AAC Audio",
  },

  // Fonts
  {
    type: "TTF",
    mimeType: "font/ttf",
    signatures: [Buffer.from([0x00, 0x01, 0x00, 0x00, 0x00])],
    extensions: [".ttf"],
    category: "font",
    isExecutable: false,
    description: "TrueType Font",
  },
  {
    type: "OTF",
    mimeType: "font/otf",
    signatures: [Buffer.from([0x4f, 0x54, 0x54, 0x4f])], // OTTO
    extensions: [".otf"],
    category: "font",
    isExecutable: false,
    description: "OpenType Font",
  },
  {
    type: "WOFF",
    mimeType: "font/woff",
    signatures: [Buffer.from([0x77, 0x4f, 0x46, 0x46])], // wOFF
    extensions: [".woff"],
    category: "font",
    isExecutable: false,
    description: "Web Open Font Format",
  },
  {
    type: "WOFF2",
    mimeType: "font/woff2",
    signatures: [Buffer.from([0x77, 0x4f, 0x46, 0x32])], // wOF2
    extensions: [".woff2"],
    category: "font",
    isExecutable: false,
    description: "Web Open Font Format 2",
  },

  // Databases
  {
    type: "SQLITE",
    mimeType: "application/x-sqlite3",
    signatures: [
      Buffer.from([
        0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6f, 0x72, 0x6d, 0x61,
        0x74,
      ]),
    ],
    extensions: [".sqlite", ".sqlite3", ".db"],
    category: "database",
    isExecutable: false,
    description: "SQLite Database",
  },

  // Text-based files (shebang or text detection)
  {
    type: "HTML",
    mimeType: "text/html",
    signatures: [Buffer.from("<!DOCTYPE html"), Buffer.from("<html")],
    extensions: [".html", ".htm"],
    category: "document",
    isExecutable: false,
    description: "HTML Document",
  },
  {
    type: "XML",
    mimeType: "application/xml",
    signatures: [Buffer.from("<?xml version=")],
    extensions: [".xml"],
    category: "document",
    isExecutable: false,
    description: "XML Document",
  },
  {
    type: "JSON",
    mimeType: "application/json",
    signatures: [Buffer.from('{"')],
    extensions: [".json"],
    category: "code",
    isExecutable: false,
    description: "JSON Document",
  },
];

// Suspicious patterns for security detection
const SUSPICIOUS_PATTERNS: Array<{
  pattern: Buffer;
  description: string;
  severity: "low" | "medium" | "high";
}> = [
  {
    pattern: Buffer.from("MZ"), // Windows executable marker
    description: "Windows executable marker found in non-executable file",
    severity: "high",
  },
  {
    pattern: Buffer.from([0x7f, 0x45, 0x4c, 0x46]), // ELF header
    description: "ELF executable header found",
    severity: "high",
  },
  {
    pattern: Buffer.from("%PDF-"), // PDF with potential embedded executable
    description: "PDF document (verify no embedded executables)",
    severity: "low",
  },
  {
    pattern: Buffer.from("PK"), // ZIP header (could contain malicious payload)
    description: "Archive header (scan contents for security)",
    severity: "medium",
  },
];

// Executables disguised as documents - dangerous combinations
const DANGEROUS_TYPE_MISMATCHES: Array<{
  detectedCategory: FileCategory;
  claimedExtension: string;
  severity: "medium" | "high" | "critical";
}> = [
  {
    detectedCategory: "executable",
    claimedExtension: ".pdf",
    severity: "critical",
  },
  {
    detectedCategory: "executable",
    claimedExtension: ".doc",
    severity: "critical",
  },
  {
    detectedCategory: "executable",
    claimedExtension: ".docx",
    severity: "critical",
  },
  {
    detectedCategory: "executable",
    claimedExtension: ".jpg",
    severity: "critical",
  },
  {
    detectedCategory: "executable",
    claimedExtension: ".png",
    severity: "critical",
  },
  { detectedCategory: "script", claimedExtension: ".txt", severity: "high" },
  { detectedCategory: "script", claimedExtension: ".log", severity: "high" },
  {
    detectedCategory: "archive",
    claimedExtension: ".docx",
    severity: "medium",
  },
  { detectedCategory: "code", claimedExtension: ".txt", severity: "medium" },
];

// ==================== Content Analyzer Service ====================

export class ContentAnalyzerService {
  private readonly maxHeaderSize = 4096; // 4KB header read
  private readonly signatures: FileTypeDetection[];

  constructor(customSignatures?: FileTypeDetection[]) {
    this.signatures = customSignatures
      ? [...FILE_SIGNATURES, ...customSignatures]
      : FILE_SIGNATURES;
  }

  /**
   * Analyze a file by reading its header and detecting true file type
   */
  async analyze(filePath: string): Promise<ContentAnalysisResult> {
    const startTime = Date.now();
    logger.debug("Starting content analysis", { filePath });

    try {
      // Read file header
      const buffer = await this.readFileHeader(filePath);

      // Detect file type from content
      const detection = this.detectFileType(buffer);

      // Check for extension mismatch
      const extensionMatch = this.checkExtensionMismatch(
        filePath,
        detection.type,
      );

      // Calculate confidence score
      const confidence = this.getConfidenceScore(detection);

      // Generate warnings
      const warnings = this.generateWarnings(
        filePath,
        detection,
        buffer,
        extensionMatch,
      );

      const result: ContentAnalysisResult = {
        filePath,
        detectedType: detection.type,
        mimeType: detection.mimeType,
        confidence,
        extensionMatch,
        warnings,
      };

      const duration = Date.now() - startTime;
      logger.info("Content analysis completed", {
        filePath,
        detectedType: detection.type,
        confidence,
        duration,
        warnings: warnings.length,
      });

      return result;
    } catch (error) {
      logger.error("Content analysis failed", error, { filePath });
      throw error;
    }
  }

  /**
   * Read the first 4KB of a file for analysis
   */
  private async readFileHeader(filePath: string): Promise<Buffer> {
    let fileHandle: import("fs").promises.FileHandle | undefined;

    try {
      fileHandle = await open(filePath, "r");
      const buffer = Buffer.alloc(this.maxHeaderSize);
      const { bytesRead } = await fileHandle.read(
        buffer,
        0,
        this.maxHeaderSize,
        0,
      );
      return buffer.slice(0, bytesRead);
    } finally {
      await fileHandle?.close();
    }
  }

  /**
   * Detect file type based on magic numbers/signatures
   */
  detectFileType(buffer: Buffer): FileTypeDetection {
    // First, try exact signature matches
    const matches = this.findSignatureMatches(buffer);

    if (matches.length > 0) {
      // Sort by confidence and return best match
      matches.sort((a, b) => b.confidence - a.confidence);
      const bestMatch = matches[0];
      if (bestMatch) {
        return bestMatch.fileType;
      }
    }

    // Try to detect text files
    if (this.isTextFile(buffer)) {
      return this.detectTextFileType(buffer);
    }

    // Unknown binary file
    return {
      type: "UNKNOWN",
      mimeType: "application/octet-stream",
      signatures: [],
      extensions: [],
      category: "unknown",
      isExecutable: false,
      description: "Unknown binary file",
    };
  }

  /**
   * Find all signature matches in the buffer
   */
  private findSignatureMatches(buffer: Buffer): DetectionMatch[] {
    const matches: DetectionMatch[] = [];

    for (const fileType of this.signatures) {
      for (let i = 0; i < fileType.signatures.length; i++) {
        const signature = fileType.signatures[i]!;

        if (this.bufferStartsWith(buffer, signature)) {
          // Calculate confidence based on signature specificity
          const confidence = this.calculateSignatureConfidence(
            signature,
            fileType,
          );

          matches.push({
            fileType,
            signatureIndex: i,
            confidence,
          });
        }
      }
    }

    return matches;
  }

  /**
   * Check if buffer starts with a given signature
   */
  private bufferStartsWith(buffer: Buffer, signature: Buffer): boolean {
    if (buffer.length < signature.length) {
      return false;
    }

    for (let i = 0; i < signature.length; i++) {
      if (buffer[i] !== signature[i]) {
        return false;
      }
    }

    return true;
  }

  /**
   * Calculate confidence score based on signature specificity
   */
  private calculateSignatureConfidence(
    signature: Buffer,
    fileType: FileTypeDetection,
  ): number {
    // Longer signatures = higher confidence
    const lengthWeight = Math.min(signature.length / 8, 1) * 0.3;

    // Unique signatures = higher confidence
    const uniqueSignatures = fileType.signatures.length;
    const uniquenessWeight = uniqueSignatures === 1 ? 0.2 : 0.1;

    // Specific file types = higher confidence
    const specificityWeight = this.getSpecificityWeight(fileType.category);

    return Math.min(
      0.5 + lengthWeight + uniquenessWeight + specificityWeight,
      1,
    );
  }

  /**
   * Get specificity weight based on file category
   */
  private getSpecificityWeight(category: FileCategory): number {
    const weights: Record<FileCategory, number> = {
      executable: 0.3,
      image: 0.25,
      video: 0.25,
      audio: 0.25,
      document: 0.2,
      archive: 0.2,
      script: 0.2,
      code: 0.15,
      font: 0.2,
      database: 0.25,
      unknown: 0,
    };

    return weights[category] || 0;
  }

  /**
   * Check if a buffer represents a text file
   */
  private isTextFile(buffer: Buffer): boolean {
    if (buffer.length === 0) {
      return true; // Empty files are treated as text
    }

    // Check for null bytes (binary files typically have them)
    for (let i = 0; i < Math.min(buffer.length, 512); i++) {
      if (buffer[i] === 0x00) {
        return false;
      }
    }

    // Check for printable ASCII or common text bytes
    let textBytes = 0;
    for (let i = 0; i < Math.min(buffer.length, 512); i++) {
      const byte = buffer[i]!;
      // Printable ASCII, tab, newline, carriage return
      if (
        (byte >= 0x20 && byte <= 0x7e) ||
        byte === 0x09 ||
        byte === 0x0a ||
        byte === 0x0d
      ) {
        textBytes++;
      }
    }

    // If > 90% of bytes are text characters, it's likely a text file
    const checkLength = Math.min(buffer.length, 512);
    if (checkLength === 0) {
      return true; // Already handled above, but explicit for clarity
    }
    return textBytes / checkLength > 0.9;
  }

  /**
   * Detect specific text file type based on content
   */
  private detectTextFileType(buffer: Buffer): FileTypeDetection {
    const header = buffer
      .toString("utf8", 0, Math.min(buffer.length, 512))
      .toLowerCase();

    // Check for shebang
    if (header.startsWith("#!")) {
      if (header.includes("python")) {
        return {
          type: "PYTHON",
          mimeType: "text/x-python",
          signatures: [],
          extensions: [".py"],
          category: "script",
          isExecutable: true,
          description: "Python Script (shebang detected)",
        };
      }
      if (header.includes("node") || header.includes("nodejs")) {
        return {
          type: "NODE",
          mimeType: "application/javascript",
          signatures: [],
          extensions: [".js"],
          category: "script",
          isExecutable: true,
          description: "Node.js Script (shebang detected)",
        };
      }
      if (header.includes("bash") || header.includes("sh")) {
        return {
          type: "SHELL",
          mimeType: "text/x-shellscript",
          signatures: [],
          extensions: [".sh"],
          category: "script",
          isExecutable: true,
          description: "Shell Script (shebang detected)",
        };
      }
      if (header.includes("perl")) {
        return {
          type: "PERL",
          mimeType: "text/x-perl",
          signatures: [],
          extensions: [".pl"],
          category: "script",
          isExecutable: true,
          description: "Perl Script (shebang detected)",
        };
      }
      if (header.includes("ruby")) {
        return {
          type: "RUBY",
          mimeType: "text/x-ruby",
          signatures: [],
          extensions: [".rb"],
          category: "script",
          isExecutable: true,
          description: "Ruby Script (shebang detected)",
        };
      }

      // Generic script with shebang
      return {
        type: "SCRIPT",
        mimeType: "text/plain",
        signatures: [],
        extensions: [],
        category: "script",
        isExecutable: true,
        description: "Executable Script (shebang detected)",
      };
    }

    // HTML detection
    if (header.includes("<!doctype html") || header.includes("<html")) {
      return {
        type: "HTML",
        mimeType: "text/html",
        signatures: [],
        extensions: [".html", ".htm"],
        category: "document",
        isExecutable: false,
        description: "HTML Document",
      };
    }

    // SVG detection - check before XML since SVGs may have XML declaration
    if (header.includes("<svg")) {
      return {
        type: "SVG",
        mimeType: "image/svg+xml",
        signatures: [],
        extensions: [".svg"],
        category: "image",
        isExecutable: false,
        description: "SVG Document",
      };
    }

    // XML detection
    if (header.includes("<?xml")) {
      return {
        type: "XML",
        mimeType: "application/xml",
        signatures: [],
        extensions: [".xml"],
        category: "document",
        isExecutable: false,
        description: "XML Document",
      };
    }

    // JSON detection
    if (
      header.trimStart().startsWith("{") ||
      header.trimStart().startsWith("[")
    ) {
      return {
        type: "JSON",
        mimeType: "application/json",
        signatures: [],
        extensions: [".json"],
        category: "code",
        isExecutable: false,
        description: "JSON Document",
      };
    }

    // JavaScript detection
    if (
      /\b(const|let|var|function|class|import|export|async|await|return|if|for|while|switch|try|catch|console|document|window)\b/.test(
        header,
      ) ||
      (header.includes(";") && header.includes("="))
    ) {
      return {
        type: "JS",
        mimeType: "application/javascript",
        signatures: [],
        extensions: [".js", ".mjs", ".cjs"],
        category: "code",
        isExecutable: false,
        description: "JavaScript Source File",
      };
    }

    // CSS detection
    if (
      header.includes("{") &&
      (header.includes(":") || header.includes("@media"))
    ) {
      return {
        type: "CSS",
        mimeType: "text/css",
        signatures: [],
        extensions: [".css"],
        category: "code",
        isExecutable: false,
        description: "CSS Stylesheet",
      };
    }

    // Markdown detection
    if (
      header.includes("# ") ||
      header.includes("## ") ||
      header.match(/^[-=*]{3,}$/m)
    ) {
      return {
        type: "MARKDOWN",
        mimeType: "text/markdown",
        signatures: [],
        extensions: [".md", ".markdown"],
        category: "document",
        isExecutable: false,
        description: "Markdown Document",
      };
    }

    // Generic text file
    return {
      type: "TEXT",
      mimeType: "text/plain",
      signatures: [],
      extensions: [".txt"],
      category: "document",
      isExecutable: false,
      description: "Plain Text Document",
    };
  }

  /**
   * Check if file extension matches detected content type
   */
  checkExtensionMismatch(filePath: string, detectedType: string): boolean {
    const actualExtension = extname(filePath).toLowerCase();

    // Find the detected file type definition
    const fileType = this.signatures.find((sig) => sig.type === detectedType);

    if (!fileType) {
      // Unknown type, can't determine mismatch
      return true;
    }

    // Check if actual extension is in the list of valid extensions
    // Empty extension check for files like ELF binaries without extension
    if (actualExtension === "" && fileType.extensions.includes("")) {
      return true;
    }

    return fileType.extensions.includes(actualExtension);
  }

  /**
   * Calculate confidence score for detection
   */
  getConfidenceScore(detection: FileTypeDetection): number {
    if (detection.type === "UNKNOWN") {
      return 0;
    }

    // Base confidence from signature quality
    let score = 0.7;

    // Increase confidence for specific categories
    if (detection.category === "executable" || detection.category === "image") {
      score += 0.15;
    }

    // Increase confidence if we have specific signatures
    if (detection.signatures.length > 0) {
      const avgSigLength =
        detection.signatures.reduce((sum, sig) => sum + sig.length, 0) /
        detection.signatures.length;
      score += Math.min(avgSigLength / 20, 0.1);
    }

    return Math.min(score, 1);
  }

  /**
   * Generate security warnings based on analysis
   */
  private generateWarnings(
    filePath: string,
    detection: FileTypeDetection,
    buffer: Buffer,
    extensionMatch: boolean,
  ): string[] {
    const warnings: string[] = [];
    const actualExtension = extname(filePath).toLowerCase();

    // Extension mismatch warning
    if (!extensionMatch) {
      const severity = this.calculateMismatchSeverity(
        detection.category,
        actualExtension,
      );
      warnings.push(
        `[${severity.toUpperCase()}] Extension mismatch: File has extension "${actualExtension}" but content appears to be "${detection.type}" (${detection.category})`,
      );
    }

    // Executable disguised as document
    if (
      detection.isExecutable &&
      [".pdf", ".doc", ".docx", ".jpg", ".png", ".txt"].includes(
        actualExtension,
      )
    ) {
      warnings.push(
        `[CRITICAL] Potential security threat: Executable file disguised as ${actualExtension} document. This is a common malware technique.`,
      );
    }

    // Suspicious patterns
    for (const { pattern, description, severity } of SUSPICIOUS_PATTERNS) {
      if (
        this.bufferStartsWith(buffer, pattern) ||
        this.bufferContains(buffer, pattern)
      ) {
        // Only warn if pattern doesn't match the detected type
        if (!this.isExpectedPattern(pattern, detection)) {
          warnings.push(`[${severity.toUpperCase()}] ${description}`);
        }
      }
    }

    // SWF files (Flash - security risk)
    if (detection.type === "SWF") {
      warnings.push(
        "[HIGH] Adobe Flash file detected - Flash has known security vulnerabilities and is deprecated",
      );
    }

    // Scripts in unexpected locations
    if (detection.category === "script" && !extensionMatch) {
      warnings.push(
        `[MEDIUM] Script file without proper extension detected: ${detection.type}`,
      );
    }

    // Archive that could contain executables
    if (detection.category === "archive") {
      warnings.push(
        "[LOW] Archive file detected - scan contents before extraction",
      );
    }

    return warnings;
  }

  /**
   * Check if buffer contains a pattern anywhere
   */
  private bufferContains(buffer: Buffer, pattern: Buffer): boolean {
    if (pattern.length > buffer.length) {
      return false;
    }

    for (let i = 0; i <= buffer.length - pattern.length; i++) {
      let match = true;
      for (let j = 0; j < pattern.length; j++) {
        if (buffer[i + j] !== pattern[j]) {
          match = false;
          break;
        }
      }
      if (match) return true;
    }

    return false;
  }

  /**
   * Check if a pattern is expected for the detected file type
   */
  private isExpectedPattern(
    pattern: Buffer,
    detection: FileTypeDetection,
  ): boolean {
    // Check if pattern matches any signature of the detected type
    return detection.signatures.some((sig) => {
      if (sig.length !== pattern.length) return false;
      for (let i = 0; i < sig.length; i++) {
        if (sig[i] !== pattern[i]) return false;
      }
      return true;
    });
  }

  /**
   * Calculate severity of extension mismatch
   */
  private calculateMismatchSeverity(
    detectedCategory: FileCategory,
    claimedExtension: string,
  ): string {
    const mismatch = DANGEROUS_TYPE_MISMATCHES.find(
      (m) =>
        m.detectedCategory === detectedCategory &&
        m.claimedExtension === claimedExtension,
    );

    return mismatch?.severity || "low";
  }

  /**
   * Get all supported file types
   */
  getSupportedTypes(): FileTypeDetection[] {
    return [...this.signatures];
  }

  /**
   * Add custom file signature
   */
  addSignature(signature: FileTypeDetection): void {
    this.signatures.push(signature);
    logger.info("Custom file signature added", { type: signature.type });
  }

  /**
   * Check if a file is potentially dangerous
   */
  isPotentiallyDangerous(detection: FileTypeDetection): boolean {
    return detection.isExecutable || detection.category === "script";
  }
}

// Export singleton instance
export const contentAnalyzer = new ContentAnalyzerService();
