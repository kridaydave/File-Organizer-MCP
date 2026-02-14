/**
 * Secure File Reader
 *
 * Core file reader implementation with 3-layer security architecture:
 * - Layer 1: Input Validation & Sanitization
 * - Layer 2: Security & Resource Controls
 * - Layer 3: Business Logic & Execution
 *
 * Security features:
 * - O_NOFOLLOW flag to prevent symlink attacks
 * - TOCTOU-safe file opening via openAndValidateFile()
 * - Rate limiting per operation
 * - Audit logging for all operations
 * - Configurable max read size (default 10MB)
 * - SHA-256 checksum calculation for integrity
 *
 * Performance features:
 * - Streaming for large files (>100KB)
 * - Backpressure handling
 * - Efficient buffer allocation
 *
 * @module SecureFileReader
 * @version 3.2.0
 */

import fs from "fs/promises";
import { createReadStream } from "fs";
import { Readable } from "stream";
import crypto from "crypto";
import path from "path";
import { PathValidatorService } from "../services/path-validator.service.js";
import { RateLimiter } from "../services/security/rate-limiter.service.js";
import { Result, ok, err, isOk, isErr } from "./result.js";
import {
  FileReadOptions,
  FileReadResult,
  DEFAULT_READ_OPTIONS,
  FileMetadata,
} from "./types.js";
import {
  FileReadError,
  PathValidationError,
  RateLimitError,
  FileTooLargeError,
  FileNotFoundError,
  FileAccessDeniedError,
  FileReadAbortedError,
  InvalidEncodingError,
} from "./errors.js";

/**
 * Audit logger interface for logging file operations
 * Part of Layer 2 (Security & Resource Controls)
 */
export interface IAuditLogger {
  /**
   * Log an operation start
   * @param operation - The operation type
   * @param path - The file path
   * @param context - Additional context
   */
  logOperationStart(
    operation: string,
    path: string,
    context?: Record<string, unknown>,
  ): void;

  /**
   * Log a successful operation
   * @param operation - The operation type
   * @param path - The file path
   * @param result - Operation result details
   */
  logOperationSuccess(
    operation: string,
    path: string,
    result: Record<string, unknown>,
  ): void;

  /**
   * Log a failed operation
   * @param operation - The operation type
   * @param path - The file path
   * @param error - The error that occurred
   */
  logOperationFailure(operation: string, path: string, error: Error): void;
}

/**
 * Secure file reader implementation with comprehensive security controls
 * Implements IFileReader interface with Result-based error handling
 *
 * @example
 * ```typescript
 * const reader = new SecureFileReader(
 *   pathValidator,
 *   rateLimiter,
 *   auditLogger,
 *   10 * 1024 * 1024 // 10MB limit
 * );
 *
 * const result = await reader.read('/path/to/file.txt');
 * if (result.ok) {
 *   console.log(result.value.data);
 * } else {
 *   console.error(result.error.message);
 * }
 * ```
 */
export class SecureFileReader {
  /** Threshold for switching to streaming (100KB) */
  private static readonly STREAMING_THRESHOLD = 100 * 1024;

  /** Default encoding for text reads */
  private static readonly DEFAULT_ENCODING: BufferEncoding = "utf-8";

  /**
   * Creates a new SecureFileReader instance
   *
   * @param pathValidator - Service for validating and securing file paths
   * @param rateLimiter - Rate limiter for operation throttling
   * @param auditLogger - Logger for audit trail
   * @param maxReadSize - Maximum bytes to read (default: 10MB)
   */
  constructor(
    private readonly pathValidator: PathValidatorService,
    private readonly rateLimiter: RateLimiter,
    private readonly auditLogger: IAuditLogger,
    private readonly maxReadSize: number = 10 * 1024 * 1024,
  ) {}

  /**
   * Read a file completely into memory as string
   * Uses streaming for files > 100KB for better memory efficiency
   *
   * Layer 1: Path validation
   * Layer 2: Rate limiting, audit logging, size checks
   * Layer 3: TOCTOU-safe opening, content reading, checksum calculation
   *
   * @param filePath - Path to the file to read
   * @param options - Read options (encoding, maxBytes, offset, signal)
   * @returns Result with FileReadResult or FileReadError
   */
  async read(
    filePath: string,
    options?: Partial<FileReadOptions>,
  ): Promise<Result<FileReadResult, FileReadError>> {
    const mergedOptions = this.mergeOptions(options);
    const operationId = this.generateOperationId();

    // Layer 1: Path Validation
    const pathValidation = await this.validatePath(filePath);
    if (pathValidation.ok === false) {
      return err(pathValidation.error);
    }
    const validatedPath = pathValidation.value;

    // Layer 2: Security Controls
    const rateLimitCheck = this.checkRateLimit("read", filePath);
    if (rateLimitCheck.ok === false) {
      return err(rateLimitCheck.error);
    }

    this.auditLogger.logOperationStart("read", filePath, {
      operationId,
      maxBytes: mergedOptions.maxBytes,
      encoding: mergedOptions.encoding,
    });

    let fileHandle: fs.FileHandle | undefined;

    try {
      // Layer 3: TOCTOU-safe file opening
      fileHandle = await this.pathValidator.openAndValidateFile(filePath);

      // Get file stats for size check
      const stats = await fileHandle.stat();

      // Check file size against limits
      if (stats.size > mergedOptions.maxBytes) {
        throw new FileTooLargeError(
          filePath,
          stats.size,
          mergedOptions.maxBytes,
        );
      }

      // Use streaming for large files to avoid memory pressure
      if (stats.size > SecureFileReader.STREAMING_THRESHOLD) {
        const streamResult = await this.readViaStream(
          fileHandle,
          validatedPath,
          stats,
          mergedOptions,
        );

        if (streamResult.ok) {
          this.auditLogger.logOperationSuccess("read", filePath, {
            operationId,
            bytesRead: streamResult.value.bytesRead,
            checksum: streamResult.value.metadata.checksum,
            streaming: true,
          });
        } else {
          this.auditLogger.logOperationFailure(
            "read",
            filePath,
            (streamResult as { error: FileReadError }).error,
          );
        }

        return streamResult;
      }

      // Small file: read directly into buffer
      const bufferResult = await this.readViaBuffer(
        fileHandle,
        validatedPath,
        stats,
        mergedOptions,
      );

      if (bufferResult.ok) {
        this.auditLogger.logOperationSuccess("read", filePath, {
          operationId,
          bytesRead: bufferResult.value.bytesRead,
          checksum: bufferResult.value.metadata.checksum,
          streaming: false,
        });
      } else {
        this.auditLogger.logOperationFailure(
          "read",
          filePath,
          (bufferResult as { error: FileReadError }).error,
        );
      }

      return bufferResult;
    } catch (error) {
      const fileError = this.convertToFileReadError(filePath, error);
      this.auditLogger.logOperationFailure("read", filePath, fileError);
      return err(fileError);
    } finally {
      // Always close file handle
      if (fileHandle) {
        await fileHandle.close().catch(() => {});
      }
    }
  }

  /**
   * Create a readable stream for a file
   * Provides backpressure handling for large files
   *
   * Layer 1: Path validation
   * Layer 2: Rate limiting, audit logging
   * Layer 3: Stream creation with proper cleanup
   *
   * @param filePath - Path to the file to stream
   * @param options - Read options
   * @returns Result with Readable stream or FileReadError
   */
  async readStream(
    filePath: string,
    options?: Partial<FileReadOptions>,
  ): Promise<Result<Readable, FileReadError>> {
    const mergedOptions = this.mergeOptions(options);
    const operationId = this.generateOperationId();

    // Layer 1: Path Validation
    const pathValidation = await this.validatePath(filePath);
    if (pathValidation.ok === false) {
      return err(pathValidation.error);
    }
    const validatedPath = pathValidation.value;

    // Layer 2: Security Controls
    const rateLimitCheck = this.checkRateLimit("readStream", filePath);
    if (rateLimitCheck.ok === false) {
      return err(rateLimitCheck.error);
    }

    this.auditLogger.logOperationStart("readStream", filePath, {
      operationId,
      maxBytes: mergedOptions.maxBytes,
    });

    try {
      // Validate the path before creating stream
      await this.pathValidator.validatePath(filePath, { allowSymlinks: false });

      // Create readable stream with backpressure handling
      const stream = createReadStream(validatedPath, {
        encoding: mergedOptions.encoding ?? undefined,
        start: mergedOptions.offset,
        highWaterMark: 64 * 1024, // 64KB chunks for optimal performance
      });

      // Handle stream errors
      stream.on("error", (error) => {
        this.auditLogger.logOperationFailure(
          "readStream",
          filePath,
          error as Error,
        );
      });

      // Handle stream end/success
      stream.on("end", () => {
        this.auditLogger.logOperationSuccess("readStream", filePath, {
          operationId,
          completed: true,
        });
      });

      return ok(stream);
    } catch (error) {
      const fileError = this.convertToFileReadError(filePath, error);
      this.auditLogger.logOperationFailure("readStream", filePath, fileError);
      return err(fileError);
    }
  }

  /**
   * Read a file into a Buffer
   * Always returns raw bytes regardless of encoding option
   *
   * Layer 1: Path validation
   * Layer 2: Rate limiting, audit logging, size checks
   * Layer 3: TOCTOU-safe opening, buffer reading, checksum calculation
   *
   * @param filePath - Path to the file to read
   * @param options - Read options (maxBytes, offset, signal)
   * @returns Result with Buffer or FileReadError
   */
  async readBuffer(
    filePath: string,
    options?: Partial<FileReadOptions>,
  ): Promise<Result<Buffer, FileReadError>> {
    const mergedOptions = this.mergeOptions(options);
    const operationId = this.generateOperationId();

    // Layer 1: Path Validation
    const pathValidation = await this.validatePath(filePath);
    if (pathValidation.ok === false) {
      return err(pathValidation.error);
    }

    // Layer 2: Security Controls
    const rateLimitCheck = this.checkRateLimit("readBuffer", filePath);
    if (rateLimitCheck.ok === false) {
      return err(rateLimitCheck.error);
    }

    this.auditLogger.logOperationStart("readBuffer", filePath, {
      operationId,
      maxBytes: mergedOptions.maxBytes,
    });

    let fileHandle: fs.FileHandle | undefined;

    try {
      // Layer 3: TOCTOU-safe file opening
      fileHandle = await this.pathValidator.openAndValidateFile(filePath);

      const stats = await fileHandle.stat();

      // Check file size
      if (stats.size > mergedOptions.maxBytes) {
        throw new FileTooLargeError(
          filePath,
          stats.size,
          mergedOptions.maxBytes,
        );
      }

      // Check for abort signal
      if (mergedOptions.signal?.aborted) {
        throw new FileReadAbortedError(
          filePath,
          "Operation aborted before start",
        );
      }

      // Calculate bytes to read
      const offset = mergedOptions.offset;
      const bytesToRead = Math.min(stats.size - offset, mergedOptions.maxBytes);

      if (bytesToRead <= 0) {
        throw new FileReadError(
          "Offset exceeds file size",
          filePath,
          "OFFSET_EXCEEDED",
          "The specified offset is beyond the end of the file",
        );
      }

      // Allocate buffer
      const buffer = Buffer.alloc(bytesToRead);

      // Read file content
      const { bytesRead } = await fileHandle.read(
        buffer,
        0,
        bytesToRead,
        offset,
      );

      // Calculate SHA-256 checksum
      const checksum = this.calculateChecksum(buffer);

      this.auditLogger.logOperationSuccess("readBuffer", filePath, {
        operationId,
        bytesRead,
        checksum,
      });

      return ok(buffer);
    } catch (error) {
      const fileError = this.convertToFileReadError(filePath, error);
      this.auditLogger.logOperationFailure("readBuffer", filePath, fileError);
      return err(fileError);
    } finally {
      if (fileHandle) {
        await fileHandle.close().catch(() => {});
      }
    }
  }

  /**
   * Validate file path (Layer 1)
   * Checks path format, symlinks, and access permissions
   *
   * @param filePath - Path to validate
   * @returns Result with validated path or PathValidationError
   */
  private async validatePath(
    filePath: string,
  ): Promise<Result<string, PathValidationError>> {
    try {
      // Check for sensitive file patterns
      const sensitiveCheck = this.checkSensitivePatterns(filePath);
      if (sensitiveCheck.ok === false) {
        return err(sensitiveCheck.error);
      }

      // Validate path with symlinks disabled
      const validatedPath = await this.pathValidator.validatePath(filePath, {
        allowSymlinks: false,
        requireExists: true,
      });

      return ok(validatedPath);
    } catch (error) {
      const validationError = new PathValidationError(
        filePath,
        error instanceof Error ? error.message : "Unknown validation error",
        1,
      );
      return err(validationError);
    }
  }

  /**
   * Check for sensitive file patterns
   * Blocks access to system files, credentials, and sensitive configs
   *
   * @param filePath - Path to check
   * @returns Result with path or PathValidationError
   */
  private checkSensitivePatterns(
    filePath: string,
  ): Result<string, PathValidationError> {
    const sensitivePatterns = [
      /\.env$/i,
      /\.env\./i,
      /config\.json$/i,
      /secrets?\./i,
      /credentials?\./i,
      /private[-_]?key/i,
      /id_rsa/i,
      /id_dsa/i,
      /id_ecdsa/i,
      /id_ed25519/i,
      /\.ssh\//i,
      /\.gnupg\//i,
      /\.aws\//i,
      /\.docker\//i,
      /passwd$/i,
      /shadow$/i,
      /sam$/i, // Windows SAM database
      /system32/i,
      /\/etc\/shadow/i,
      /\/etc\/passwd/i,
      /\.key$/i,
      /\.pem$/i,
      /\.p12$/i,
      /\.pfx$/i,
    ];

    const normalizedPath = filePath.toLowerCase();

    for (const pattern of sensitivePatterns) {
      if (pattern.test(normalizedPath)) {
        const error = new PathValidationError(
          filePath,
          `Access to sensitive file pattern blocked: ${pattern.source}`,
          1,
        );
        return err(error);
      }
    }

    return ok(filePath);
  }

  /**
   * Check rate limit for operation (Layer 2)
   *
   * @param operation - Operation type identifier
   * @param filePath - File path for context
   * @returns Result with void or RateLimitError
   */
  private checkRateLimit(
    operation: string,
    filePath: string,
  ): Result<void, RateLimitError> {
    const rateCheck = this.rateLimiter.checkLimit(operation);

    if (!rateCheck.allowed) {
      const limitType =
        rateCheck.resetIn && rateCheck.resetIn > 60 ? "perHour" : "perMinute";
      const error = new RateLimitError(
        filePath,
        rateCheck.resetIn || 60,
        limitType,
      );
      return err(error);
    }

    return ok(undefined);
  }

  /**
   * Read file content via streaming (for large files)
   *
   * @param fileHandle - Open file handle
   * @param filePath - Path for metadata
   * @param stats - File stats
   * @param options - Read options
   * @returns Result with FileReadResult or FileReadError
   */
  private async readViaStream(
    fileHandle: fs.FileHandle,
    filePath: string,
    stats: { size: number; birthtime: Date; mtime: Date },
    options: FileReadOptions,
  ): Promise<Result<FileReadResult, FileReadError>> {
    try {
      // Check abort signal
      if (options.signal?.aborted) {
        throw new FileReadAbortedError(filePath, "Operation aborted");
      }

      const offset = options.offset;
      const bytesToRead = Math.min(stats.size - offset, options.maxBytes);

      if (bytesToRead <= 0) {
        throw new FileReadError(
          "Offset exceeds file size",
          filePath,
          "OFFSET_EXCEEDED",
        );
      }

      // Create a readable stream from file handle
      const stream = fileHandle.createReadStream({
        start: offset,
        end: offset + bytesToRead - 1,
        highWaterMark: 64 * 1024, // 64KB chunks
      });

      const chunks: Buffer[] = [];
      let totalBytes = 0;

      for await (const chunk of stream) {
        // Check abort signal during streaming
        if (options.signal?.aborted) {
          throw new FileReadAbortedError(
            filePath,
            "Operation aborted during read",
          );
        }

        const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        chunks.push(bufferChunk);
        totalBytes += bufferChunk.length;

        // Safety check
        if (totalBytes > options.maxBytes) {
          throw new FileTooLargeError(filePath, totalBytes, options.maxBytes);
        }
      }

      // Combine chunks
      const combinedBuffer = Buffer.concat(chunks);

      // Calculate checksum
      const checksum = this.calculateChecksum(combinedBuffer);

      // Convert to string if encoding specified
      const data =
        options.encoding !== null
          ? combinedBuffer.toString(
              options.encoding ?? SecureFileReader.DEFAULT_ENCODING,
            )
          : combinedBuffer;

      const result: FileReadResult = {
        data,
        bytesRead: totalBytes,
        metadata: {
          path: filePath,
          mimeType: this.getMimeType(filePath),
          size: stats.size,
          readAt: new Date(),
          checksum,
          encoding: options.encoding ?? undefined,
        },
      };

      return ok(result);
    } catch (error) {
      return err(this.convertToFileReadError(filePath, error));
    }
  }

  /**
   * Read file content via direct buffer (for small files)
   *
   * @param fileHandle - Open file handle
   * @param filePath - Path for metadata
   * @param stats - File stats
   * @param options - Read options
   * @returns Result with FileReadResult or FileReadError
   */
  private async readViaBuffer(
    fileHandle: fs.FileHandle,
    filePath: string,
    stats: { size: number; birthtime: Date; mtime: Date },
    options: FileReadOptions,
  ): Promise<Result<FileReadResult, FileReadError>> {
    try {
      // Check abort signal
      if (options.signal?.aborted) {
        throw new FileReadAbortedError(filePath, "Operation aborted");
      }

      const offset = options.offset;
      const bytesToRead = Math.min(stats.size - offset, options.maxBytes);

      if (bytesToRead <= 0) {
        throw new FileReadError(
          "Offset exceeds file size",
          filePath,
          "OFFSET_EXCEEDED",
        );
      }

      // Allocate buffer
      const buffer = Buffer.alloc(bytesToRead);

      // Read file content
      const { bytesRead } = await fileHandle.read(
        buffer,
        0,
        bytesToRead,
        offset,
      );

      // Calculate SHA-256 checksum
      const checksum = this.calculateChecksum(buffer);

      // Convert to string if encoding specified
      const data =
        options.encoding !== null
          ? buffer.toString(
              options.encoding ?? SecureFileReader.DEFAULT_ENCODING,
            )
          : buffer;

      const result: FileReadResult = {
        data,
        bytesRead,
        metadata: {
          path: filePath,
          mimeType: this.getMimeType(filePath),
          size: stats.size,
          readAt: new Date(),
          checksum,
          encoding: options.encoding ?? undefined,
        },
      };

      return ok(result);
    } catch (error) {
      return err(this.convertToFileReadError(filePath, error));
    }
  }

  /**
   * Calculate SHA-256 checksum of buffer
   *
   * @param buffer - Data to hash
   * @returns Hex-encoded SHA-256 checksum
   */
  private calculateChecksum(buffer: Buffer): string {
    return crypto.createHash("sha256").update(buffer).digest("hex");
  }

  /**
   * Get MIME type from file extension
   *
   * @param filePath - File path
   * @returns MIME type string
   */
  private getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
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
    return mimeTypes[ext] || "application/octet-stream";
  }

  /**
   * Merge user options with defaults
   *
   * @param options - User-provided options
   * @returns Merged options with defaults
   */
  private mergeOptions(options?: Partial<FileReadOptions>): FileReadOptions {
    return {
      encoding: options?.encoding ?? DEFAULT_READ_OPTIONS.encoding,
      maxBytes: options?.maxBytes ?? this.maxReadSize,
      offset: options?.offset ?? DEFAULT_READ_OPTIONS.offset,
      signal: options?.signal ?? DEFAULT_READ_OPTIONS.signal,
    };
  }

  /**
   * Convert unknown error to FileReadError
   *
   * @param filePath - File path for context
   * @param error - Error to convert
   * @returns FileReadError instance
   */
  private convertToFileReadError(
    filePath: string,
    error: unknown,
  ): FileReadError {
    if (error instanceof FileReadError) {
      return error;
    }

    if (error instanceof Error) {
      const code = (error as NodeJS.ErrnoException).code;

      switch (code) {
        case "ENOENT":
          return new FileNotFoundError(filePath);
        case "EACCES":
        case "EPERM":
          return new FileAccessDeniedError(filePath, error.message);
        case "ELOOP":
          return new PathValidationError(filePath, "Symlink loop detected", 5);
        case "ENOTDIR":
          return new PathValidationError(
            filePath,
            "Path is not a directory",
            4,
          );
        case "EISDIR":
          return new FileReadError(
            filePath,
            "Cannot read a directory as a file",
            "EISDIR",
          );
        case "EINVAL":
          return new InvalidEncodingError(filePath, "utf-8");
        default:
          return new FileReadError(
            error.message,
            filePath,
            code ?? "FILE_READ_ERROR",
          );
      }
    }

    return new FileReadError(
      "Unknown error occurred",
      filePath,
      "UNKNOWN_ERROR",
      String(error),
    );
  }

  /**
   * Generate unique operation ID for tracing
   *
   * @returns Unique operation identifier
   */
  private generateOperationId(): string {
    const randomValue = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
    return `${Date.now()}-${(randomValue / 0xffffffff).toString(36).substring(2, 11)}`;
  }
}
