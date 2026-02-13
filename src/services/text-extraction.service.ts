/**
 * File Organizer MCP Server v3.2.0
 * Text Extraction Service
 *
 * @module services/text-extraction.service
 * @description Centralized document text extraction for PDF, DOCX, DOC, ODT, RTF, TXT, MD files.
 */

import fs from "fs/promises";
import path from "path";
import zlib from "zlib";
import { promisify } from "util";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import { logger } from "../utils/logger.js";

const inflateRaw = promisify(zlib.inflateRaw);

export interface TextExtractionOptions {
  maxFileSizeBytes?: number;
  maxTextLength?: number;
}

export interface TextExtractionResult {
  text: string;
  truncated: boolean;
  originalLength: number;
  extractionMethod: string;
}

const DEFAULT_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_TEXT_LENGTH = 50000;

const SUPPORTED_EXTENSIONS = new Set([
  ".pdf",
  ".docx",
  ".doc",
  ".odt",
  ".rtf",
  ".txt",
  ".md",
]);

export class TextExtractionService {
  private readonly defaultOptions: Required<TextExtractionOptions>;

  constructor(options?: TextExtractionOptions) {
    this.defaultOptions = {
      maxFileSizeBytes:
        options?.maxFileSizeBytes ?? DEFAULT_MAX_FILE_SIZE_BYTES,
      maxTextLength: options?.maxTextLength ?? DEFAULT_MAX_TEXT_LENGTH,
    };
  }

  async extract(
    filePath: string,
    options?: TextExtractionOptions,
  ): Promise<TextExtractionResult> {
    const opts = { ...this.defaultOptions, ...options };
    const ext = path.extname(filePath).toLowerCase();

    if (!SUPPORTED_EXTENSIONS.has(ext)) {
      return {
        text: "",
        truncated: false,
        originalLength: 0,
        extractionMethod: "unsupported",
      };
    }

    const stats = await fs.stat(filePath);
    if (stats.size > opts.maxFileSizeBytes) {
      return {
        text: `[File too large: ${(stats.size / 1024 / 1024).toFixed(2)} MB exceeds limit of ${(opts.maxFileSizeBytes / 1024 / 1024).toFixed(2)} MB]`,
        truncated: true,
        originalLength: 0,
        extractionMethod: "size-limit",
      };
    }

    let result: { text: string; method: string };

    switch (ext) {
      case ".pdf":
        result = await this.extractPdf(filePath);
        break;
      case ".docx":
        result = await this.extractDocx(filePath);
        break;
      case ".doc":
        result = await this.extractDoc(filePath);
        break;
      case ".odt":
        result = await this.extractOdt(filePath);
        break;
      case ".rtf":
        result = await this.extractRtf(filePath);
        break;
      case ".txt":
      case ".md":
        result = await this.extractTextFile(filePath);
        break;
      default:
        return {
          text: "",
          truncated: false,
          originalLength: 0,
          extractionMethod: "unsupported",
        };
    }

    return this.applyTextLimit(result.text, result.method, opts.maxTextLength);
  }

  private async extractPdf(
    filePath: string,
  ): Promise<{ text: string; method: string }> {
    try {
      const buffer = await fs.readFile(filePath);
      const data = await pdfParse(buffer);
      return { text: data.text, method: "pdf-parse" };
    } catch (error) {
      logger.warn(`Failed to extract PDF text from ${filePath}`, { error });
      return { text: "", method: "pdf-parse-error" };
    }
  }

  private async extractDocx(
    filePath: string,
  ): Promise<{ text: string; method: string }> {
    try {
      const buffer = await fs.readFile(filePath);
      const result = await mammoth.extractRawText({ buffer });
      return { text: result.value, method: "mammoth-docx" };
    } catch (error) {
      logger.warn(`Failed to extract DOCX text from ${filePath}`, { error });
      return { text: "", method: "mammoth-error" };
    }
  }

  private async extractDoc(
    filePath: string,
  ): Promise<{ text: string; method: string }> {
    return {
      text: "[Legacy .doc format requires conversion to .docx for text extraction. Please convert the file to .docx format.]",
      method: "doc-unsupported",
    };
  }

  private async extractOdt(
    filePath: string,
  ): Promise<{ text: string; method: string }> {
    try {
      const buffer = await fs.readFile(filePath);
      const contentXml = await this.extractOdtContentXml(buffer);
      if (!contentXml) {
        return { text: "", method: "odt-no-content" };
      }
      const text = this.parseOdtXml(contentXml);
      return { text, method: "odt-native" };
    } catch (error) {
      logger.warn(`Failed to extract ODT text from ${filePath}`, { error });
      return { text: "", method: "odt-error" };
    }
  }

  private async extractOdtContentXml(buffer: Buffer): Promise<string | null> {
    let offset = 0;

    if (buffer.length < 4) {
      return null;
    }

    const signature = buffer.readUInt32LE(0);
    if (signature !== 0x04034b50) {
      logger.warn("ODT file does not have valid ZIP signature");
      return null;
    }

    while (offset < buffer.length - 30) {
      if (buffer.readUInt32LE(offset) !== 0x04034b50) {
        break;
      }

      const headerOffset = offset;
      const compressionMethod = buffer.readUInt16LE(offset + 8);
      const compressedSize = buffer.readUInt32LE(offset + 18);
      const fileNameLength = buffer.readUInt16LE(offset + 26);
      const extraFieldLength = buffer.readUInt16LE(offset + 28);

      const fileNameStart = offset + 30;
      const fileName = buffer.toString(
        "utf8",
        fileNameStart,
        fileNameStart + fileNameLength,
      );

      const dataStart = fileNameStart + fileNameLength + extraFieldLength;
      const dataEnd = dataStart + compressedSize;

      if (fileName === "content.xml") {
        const compressedData = buffer.subarray(dataStart, dataEnd);

        if (compressionMethod === 0) {
          return compressedData.toString("utf8");
        } else if (compressionMethod === 8) {
          try {
            const decompressed = await inflateRaw(compressedData);
            return decompressed.toString("utf8");
          } catch (inflateError) {
            logger.warn("Failed to decompress ODT content.xml", {
              error: inflateError,
            });
            return null;
          }
        } else {
          logger.warn(
            `ODT uses unsupported compression method: ${compressionMethod}`,
          );
          return null;
        }
      }

      offset = dataEnd;
      if (offset === headerOffset) {
        offset++;
      }
    }

    logger.warn("content.xml not found in ODT archive");
    return null;
  }

  private parseOdtXml(xml: string): string {
    const textParts: string[] = [];
    const textTagRegex = /<text:[^>]*>([^<]*)<\/text:[^>]*>/g;
    let match;

    while ((match = textTagRegex.exec(xml)) !== null) {
      const content = match[1];
      if (content) {
        textParts.push(content);
      }
    }

    const paragraphRegex = /<text:p[^>]*>([^<]*)<\/text:p>/g;
    while ((match = paragraphRegex.exec(xml)) !== null) {
      const content = match[1];
      if (content && !textParts.includes(content)) {
        textParts.push(content);
      }
    }

    const spanRegex = /<text:span[^>]*>([^<]*)<\/text:span>/g;
    while ((match = spanRegex.exec(xml)) !== null) {
      const content = match[1];
      if (content && !textParts.includes(content)) {
        textParts.push(content);
      }
    }

    let text = textParts.join(" ");

    text = text
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#(\d+);/g, (_, code) =>
        String.fromCharCode(parseInt(code, 10)),
      )
      .replace(/&#x([0-9a-fA-F]+);/g, (_, code) =>
        String.fromCharCode(parseInt(code, 16)),
      );

    return text.trim();
  }

  private async extractRtf(
    filePath: string,
  ): Promise<{ text: string; method: string }> {
    try {
      const buffer = await fs.readFile(filePath);
      const text = this.parseRtf(buffer.toString("utf8"));
      return { text, method: "rtf-native" };
    } catch (error) {
      logger.warn(`Failed to extract RTF text from ${filePath}`, { error });
      return { text: "", method: "rtf-error" };
    }
  }

  private parseRtf(rtf: string): string {
    let result = rtf;

    result = result.replace(/\\'[0-9a-fA-F]{2}/g, " ");

    result = result.replace(/\\[a-z]+\d*\s?/gi, " ");

    result = result.replace(/[{}]/g, "");

    result = result.replace(/\\\\/g, "\\");
    result = result.replace(/\\{/g, "{");
    result = result.replace(/\\}/g, "}");

    result = result.replace(/\s+/g, " ").trim();

    return result;
  }

  private async extractTextFile(
    filePath: string,
  ): Promise<{ text: string; method: string }> {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      return { text: content, method: "plain-text" };
    } catch (error) {
      logger.warn(`Failed to read text file ${filePath}`, { error });
      return { text: "", method: "text-error" };
    }
  }

  private applyTextLimit(
    text: string,
    method: string,
    maxLength: number,
  ): TextExtractionResult {
    const originalLength = text.length;

    if (originalLength <= maxLength) {
      return {
        text,
        truncated: false,
        originalLength,
        extractionMethod: method,
      };
    }

    return {
      text: text.substring(0, maxLength),
      truncated: true,
      originalLength,
      extractionMethod: method,
    };
  }

  isSupported(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return SUPPORTED_EXTENSIONS.has(ext);
  }

  getSupportedExtensions(): string[] {
    return [...SUPPORTED_EXTENSIONS];
  }
}

export const textExtractionService = new TextExtractionService();
