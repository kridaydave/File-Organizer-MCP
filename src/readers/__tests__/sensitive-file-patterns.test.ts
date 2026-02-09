import { describe, it, expect } from "@jest/globals";
import {
  isSensitiveFile,
  checkSensitiveFile,
  sanitizePathForLogging,
  getMatchedPattern,
  checkSensitiveFileStrict,
  SENSITIVE_PATTERNS,
  SENSITIVE_DIRECTORIES,
  STRICT_SENSITIVE_PATTERNS,
} from "../security/sensitive-file-patterns.js";

describe("Sensitive File Patterns", () => {
  describe("isSensitiveFile()", () => {
    it("should detect .env files", () => {
      expect(isSensitiveFile("/path/.env")).toBe(true);
      expect(isSensitiveFile("/path/.env.local")).toBe(true);
      expect(isSensitiveFile("/path/.env.production")).toBe(true);
      expect(isSensitiveFile("/path/.env.development")).toBe(true);
    });

    it("should detect SSH keys", () => {
      expect(isSensitiveFile("/home/user/.ssh/id_rsa")).toBe(true);
      expect(isSensitiveFile("/home/user/.ssh/id_ed25519")).toBe(true);
      expect(isSensitiveFile("/home/user/.ssh/id_ecdsa")).toBe(true);
      expect(isSensitiveFile("/home/user/.ssh/id_dsa")).toBe(true);
      expect(isSensitiveFile("/home/user/.ssh/private.key")).toBe(true);
    });

    it("should detect AWS credentials", () => {
      expect(isSensitiveFile("/home/user/.aws/credentials")).toBe(true);
      expect(isSensitiveFile("/home/user/.aws/config")).toBe(true);
    });

    it("should detect password files", () => {
      expect(isSensitiveFile("/etc/shadow")).toBe(true);
      expect(isSensitiveFile("/etc/passwd")).toBe(true);
    });

    it("should detect Kubernetes config", () => {
      expect(isSensitiveFile("/home/user/.kube/config")).toBe(true);
      expect(isSensitiveFile("/path/kubeconfig")).toBe(true);
    });

    it("should detect TLS/SSL keys", () => {
      expect(isSensitiveFile("/path/server.pfx")).toBe(true);
      expect(isSensitiveFile("/path/certificate.p12")).toBe(true);
      expect(isSensitiveFile("/path/private.crt")).toBe(true);
    });

    it("should detect database files", () => {
      expect(isSensitiveFile("/path/data.sqlite")).toBe(true);
      expect(isSensitiveFile("/path/data.sqlite3")).toBe(true);
      expect(isSensitiveFile("/path/app.db")).toBe(true);
    });

    it("should detect backup files", () => {
      expect(isSensitiveFile("/path/backup.bak")).toBe(true);
      expect(isSensitiveFile("/path/file.backup")).toBe(true);
      expect(isSensitiveFile("/path/config.old")).toBe(true);
    });

    it("should detect files with sensitive names", () => {
      expect(isSensitiveFile("/path/passwords.txt")).toBe(true);
      expect(isSensitiveFile("/path/secrets.json")).toBe(true);
      expect(isSensitiveFile("/path/api_key.env")).toBe(true);
      expect(isSensitiveFile("/path/auth_token.txt")).toBe(true);
      expect(isSensitiveFile("/path/credentials.xml")).toBe(true);
    });

    it("should detect shell history", () => {
      expect(isSensitiveFile("/home/user/.bash_history")).toBe(true);
      expect(isSensitiveFile("/home/user/.zsh_history")).toBe(true);
    });

    it("should allow normal files", () => {
      expect(isSensitiveFile("/path/readme.txt")).toBe(false);
      expect(isSensitiveFile("/path/main.ts")).toBe(false);
      expect(isSensitiveFile("/path/data.json")).toBe(false);
      expect(isSensitiveFile("/path/image.png")).toBe(false);
      expect(isSensitiveFile("/path/document.pdf")).toBe(false);
    });

    it("should handle case-insensitive paths", () => {
      expect(isSensitiveFile("/PATH/.ENV")).toBe(true);
      expect(isSensitiveFile("/Path/.Env.Local")).toBe(true);
      expect(isSensitiveFile("/HOME/USER/.SSH/ID_RSA")).toBe(true);
    });

    it("should handle Windows paths", () => {
      expect(isSensitiveFile("C:\\Users\\test\\.env")).toBe(true);
      expect(isSensitiveFile("C:\\Users\\test\\.ssh\\id_rsa")).toBe(true);
    });

    it("should handle null/undefined/empty input", () => {
      expect(isSensitiveFile("")).toBe(false);
      expect(isSensitiveFile(null as any)).toBe(false);
      expect(isSensitiveFile(undefined as any)).toBe(false);
    });

    it("should detect sensitive directories", () => {
      expect(isSensitiveFile("/home/user/.ssh/")).toBe(true);
      expect(isSensitiveFile("/home/user/.aws/")).toBe(true);
      expect(isSensitiveFile("/etc/shadow")).toBe(true);
    });
  });

  describe("checkSensitiveFile()", () => {
    it("should return success for safe files", () => {
      const result = checkSensitiveFile("/path/safe.txt");
      expect(result.success).toBe(true);
    });

    it("should return error result for sensitive files", () => {
      const result = checkSensitiveFile("/path/.env");
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should return error result with FileReadError details", () => {
      const result = checkSensitiveFile("/home/user/.ssh/id_rsa");
      if (!result.success && result.error) {
        expect(result.error.sensitivePath).toBe("/home/user/.ssh/id_rsa");
      }
    });

    it("should return error result for invalid paths", () => {
      const result = checkSensitiveFile(null as any);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      if (!result.success && result.error) {
        expect(result.error.message).toContain("Invalid");
      }
    });
  });

  describe("sanitizePathForLogging()", () => {
    it("should redact sensitive file paths", () => {
      expect(sanitizePathForLogging("/home/user/.env")).toBe(
        "/home/user/[REDACTED_SENSITIVE]",
      );
      expect(sanitizePathForLogging("/path/secrets.txt")).toBe(
        "/path/[REDACTED_SENSITIVE]",
      );
    });

    it("should preserve normal paths", () => {
      expect(sanitizePathForLogging("/path/readme.txt")).toBe(
        "/path/readme.txt",
      );
      expect(sanitizePathForLogging("/home/user/documents/file.pdf")).toBe(
        "/home/user/documents/file.pdf",
      );
    });

    it("should handle invalid paths", () => {
      expect(sanitizePathForLogging("")).toBe("[INVALID_PATH]");
      expect(sanitizePathForLogging(null as any)).toBe("[INVALID_PATH]");
    });

    it("should handle paths without directory", () => {
      expect(sanitizePathForLogging(".env")).toBe("[REDACTED_SENSITIVE]");
    });
  });

  describe("getMatchedPattern()", () => {
    it("should return matched pattern for sensitive files", () => {
      const pattern = getMatchedPattern("/path/.env");
      expect(pattern).toBeDefined();
      expect(pattern).not.toBeNull();
    });

    it("should return null for safe files", () => {
      expect(getMatchedPattern("/path/safe.txt")).toBeNull();
      expect(getMatchedPattern("/path/main.ts")).toBeNull();
    });

    it("should return directory pattern for sensitive directories", () => {
      const pattern = getMatchedPattern("/home/user/.ssh/");
      expect(pattern).toBeDefined();
      expect(pattern).toContain(".ssh");
    });
  });

  describe("checkSensitiveFileStrict()", () => {
    it("should return success for safe files", () => {
      const result = checkSensitiveFileStrict("/path/safe.txt");
      expect(result.success).toBe(true);
    });

    it("should detect additional patterns in strict mode", () => {
      const result = checkSensitiveFileStrict("/path/config.json");
      expect(result.success).toBe(false);
    });

    it("should detect all regular sensitive patterns", () => {
      const result = checkSensitiveFileStrict("/path/.env");
      expect(result.success).toBe(false);
    });
  });

  describe("SENSITIVE_PATTERNS", () => {
    it("should be an array of RegExp", () => {
      expect(Array.isArray(SENSITIVE_PATTERNS)).toBe(true);
      for (const pattern of SENSITIVE_PATTERNS) {
        expect(pattern).toBeInstanceOf(RegExp);
      }
    });

    it("should include .env pattern", () => {
      const envPattern = SENSITIVE_PATTERNS.find((p) =>
        p.source.includes("\\.env"),
      );
      expect(envPattern).toBeDefined();
    });
  });

  describe("SENSITIVE_DIRECTORIES", () => {
    it("should be an array of RegExp", () => {
      expect(Array.isArray(SENSITIVE_DIRECTORIES)).toBe(true);
      for (const pattern of SENSITIVE_DIRECTORIES) {
        expect(pattern).toBeInstanceOf(RegExp);
      }
    });

    it("should include .ssh directory", () => {
      const sshPattern = SENSITIVE_DIRECTORIES.find((p) =>
        p.source.includes("\\.ssh"),
      );
      expect(sshPattern).toBeDefined();
    });
  });

  describe("STRICT_SENSITIVE_PATTERNS", () => {
    it("should include all SENSITIVE_PATTERNS", () => {
      expect(STRICT_SENSITIVE_PATTERNS.length).toBeGreaterThan(
        SENSITIVE_PATTERNS.length,
      );
    });

    it("should be an array of RegExp", () => {
      for (const pattern of STRICT_SENSITIVE_PATTERNS) {
        expect(pattern).toBeInstanceOf(RegExp);
      }
    });
  });
});
