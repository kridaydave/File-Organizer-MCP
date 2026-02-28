/**
 * File Organizer MCP Server v3.4.1
 * Security Amendments - Security Constants & Limits
 *
 * These security limits are mandatory for all archive operations
 * and must be enforced at the earliest possible point.
 */

export const SECURITY_LIMITS = {
  /**
   * Decompression Bomb Mitigation Limits
   * Prevention: 256B → 10GB attack vectors
   */
  decompression: {
    /**
     * Maximum compression ratio (uncompressed / compressed)
     * 10x means 256KB compressed → 2.5MB max uncompressed
     */
    MAX_RATIO: 10,

    /**
     * Maximum absolute uncompressed size per chunk
     * 2.5GB per chunk prevents memory exhaustion
     */
    MAX_ABSOLUTE_BYTES: 2.5 * 1024 * 1024 * 1024, // 2.5 GB

    /**
     * Maximum total entries in an archive
     * Prevents zip bomb with millions of small files
     */
    MAX_ENTRIES: 10000,

    /**
     * Maximum individual file size within archive
     * 1GB per file limit
     */
    MAX_FILE_SIZE: 1 * 1024 * 1024 * 1024, // 1 GB

    /**
     * Stream chunk size for incremental processing
     * 64KB chunks for memory efficiency
     */
    CHUNK_SIZE: 64 * 1024, // 64 KB
  },

  /**
   * Thread Isolation Configuration
   * Prevention: Shared memory race conditions
   */
  threadIsolation: {
    /**
     * Prefix for dedicated temporary directories
     * Each operation gets unique temp dir
     */
    TEMP_DIR_PREFIX: "fo-",

    /**
     * Maximum temp directories allowed concurrently
     * Prevents resource exhaustion
     */
    MAX_CONCURRENT_TEMP_DIRS: 10,

    /**
     * Temp directory cleanup timeout (ms)
     * 5 minutes to complete operations
     */
    CLEANUP_TIMEOUT_MS: 5 * 60 * 1000,
  },

  /**
   * Archive Validation Configuration
   * Prevention: Zip-slip attacks
   */
  archiveValidation: {
    /**
     * Magic numbers for supported archive formats
     * Used to verify file type before processing
     */
    MAGIC_NUMBERS: {
      zip: [0x50, 0x4b, 0x03, 0x04], // PK..
      zipEmpty: [0x50, 0x4b, 0x05, 0x06], // PK..
      zipSpanned: [0x50, 0x4b, 0x07, 0x08], // PK..
      tar: [0x75, 0x73, 0x74, 0x61, 0x72], // ustar
      gz: [0x1f, 0x8b], // \x1F\x8B
      bz2: [0x42, 0x5a, 0x68], // BZh
      xz: [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00], // \xFD7zXZ
      "7z": [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c], // 7z\xAF\x27\x1C
    },

    /**
     * Maximum length for a single path component (filename/directory name)
     * 255 characters is the standard filesystem limit for individual names
     */
    MAX_PATH_COMPONENT_LENGTH: 255,

    /**
     * Maximum total path length for entries
     * 260 characters is a conservative cross-platform value (Windows MAX_PATH)
     * Note: Linux typically allows 4096, but we use conservative limit
     */
    MAX_PATH_LENGTH: 260,

    /**
     * Reserved paths that must never be extracted
     * Absolute paths and parent directory traversals
     */
    BLOCKED_PATTERNS: [
      /^\//, // Absolute paths
      /^[A-Z]:[\/\\]/i, // Windows absolute paths
      /\.\.[\/\\]/, // Parent directory traversal
      /^[\/\\]+/, // Leading slashes
      /^(etc|bin|usr|sbin|boot|lib|root|home|tmp)/i, // System directories
      /^(Windows|Program Files|Program Files \(x86\))/i, // Windows system
    ],
  },

  /**
   * Security Integration Phase Markers
   * These ensure security is embedded in all phases
   */
  phases: {
    INPUT: "input",
    PROCESSING: "processing",
    OUTPUT: "output",
    CLEANUP: "cleanup",
  },
} as const;

export type SecurityPhase =
  (typeof SECURITY_LIMITS.phases)[keyof typeof SECURITY_LIMITS.phases];
