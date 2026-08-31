/**
 * Secure file read.
 *
 * Order of checks: sensitive patterns -> TOCTOU-safe open (O_NOFOLLOW)
 * via PathValidatorService -> size/offset bounds -> read -> checksum.
 */

import crypto from "crypto";
import path from "path";
import { FileOrganizerError } from "../../errors.js";
import { PathValidatorService } from "../../services/path-validator.service.js";
import { assertNotSensitive } from "./sensitive-files.js";

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const MAX_BYTES_CAP = 100 * 1024 * 1024;

export interface ReadFileOptions {
  /** Text encoding, or null for a raw Buffer. Default: utf-8. */
  encoding?: BufferEncoding | null;
  maxBytes?: number;
  offset?: number;
  /** Compute SHA-256 of the returned bytes. Default: true. */
  checksum?: boolean;
  /** Scoped validator (tests, gates). Default: process-wide config. */
  validator?: PathValidatorService;
}

export interface ReadFileResult {
  data: string | Buffer;
  bytesRead: number;
  totalSize: number;
  checksum?: string;
  mimeType: string;
}

const MIME_TYPES: Record<string, string> = {
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".json": "application/json",
  ".js": "application/javascript",
  ".ts": "application/typescript",
  ".html": "text/html",
  ".htm": "text/html",
  ".css": "text/css",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".tar": "application/x-tar",
  ".gz": "application/gzip",
  ".xml": "application/xml",
  ".yaml": "application/yaml",
  ".yml": "application/yaml",
};

function getMimeType(filePath: string): string {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

export async function readFile(
  filePath: string,
  options: ReadFileOptions = {},
): Promise<ReadFileResult> {
  const encoding = options.encoding === undefined ? "utf-8" : options.encoding;
  const maxBytes = Math.min(options.maxBytes ?? DEFAULT_MAX_BYTES, MAX_BYTES_CAP);
  const offset = options.offset ?? 0;

  if (!Number.isInteger(offset) || offset < 0) {
    throw new FileOrganizerError(
      "Offset must be a non-negative integer",
      "E_READ_OFFSET",
    );
  }

  assertNotSensitive(filePath);

  // O_NOFOLLOW open + containment re-check on the opened handle.
  const validator = options.validator ?? new PathValidatorService();
  const handle = await validator.openAndValidateFile(filePath);

  try {
    const stats = await handle.stat();

    const hasExplicitOffset = typeof options.offset === "number" && options.offset > 0;
    if (stats.size > maxBytes && !hasExplicitOffset) {
      throw new FileOrganizerError(
        `File is ${stats.size} bytes which exceeds the ${maxBytes} byte read limit`,
        "E_FILE_TOO_LARGE",
        undefined,
        "Increase maxBytes or use offset to read a portion of the file",
      );
    }

    if (stats.size === 0 && offset === 0) {
      return {
        data: encoding ? "" : Buffer.alloc(0),
        bytesRead: 0,
        totalSize: 0,
        checksum:
          options.checksum === false
            ? undefined
            : crypto.createHash("sha256").update(Buffer.alloc(0)).digest("hex"),
        mimeType: getMimeType(filePath),
      };
    }

    const bytesToRead = Math.min(stats.size - offset, maxBytes);
    if (bytesToRead <= 0) {
      throw new FileOrganizerError(
        "Offset is beyond the end of the file",
        "E_READ_OFFSET",
        undefined,
        `File is ${stats.size} bytes`,
      );
    }

    const buffer = Buffer.alloc(bytesToRead);
    const { bytesRead } = await handle.read(buffer, 0, bytesToRead, offset);
    const data = bytesRead === bytesToRead ? buffer : buffer.subarray(0, bytesRead);

    return {
      data: encoding ? data.toString(encoding) : data,
      bytesRead,
      totalSize: stats.size,
      checksum: options.checksum === false
        ? undefined
        : crypto.createHash("sha256").update(data).digest("hex"),
      mimeType: getMimeType(filePath),
    };
  } finally {
    await handle.close().catch(() => {});
  }
}
