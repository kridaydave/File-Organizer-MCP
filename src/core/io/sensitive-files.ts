/**
 * Sensitive file patterns.
 * Checked BEFORE any read operation. A match means the read is denied.
 */

import { FileOrganizerError } from "../../errors.js";

export const SENSITIVE_PATTERNS: RegExp[] = [
  // Environment files - secrets, API keys, database credentials
  /\.env$/i,
  /\.env\.local$/i,
  /\.env\.[a-z]+$/i,
  /\.env\./i,

  // SSH keys
  /\.ssh\//i,
  /id_rsa/i,
  /id_ed25519/i,
  /id_ecdsa/i,
  /id_dsa/i,
  /\.pem$/i,
  /\.key$/i,
  /ssh_key/i,
  /private.*key/i,

  // AWS credentials
  /\.aws\//i,
  /aws\/(credentials|config)$/i,

  // Docker config may contain registry credentials
  /\.docker\/config\.json$/i,

  // Package manager configs with auth tokens
  /\.npmrc$/i,
  /\.pypirc$/i,
  /\.gemrc$/i,

  // System password files
  /shadow$/i,
  /passwd$/i,
  /master\.passwd$/i,
  /sam$/i,
  /system32/i,

  // Generic sensitive names
  /password/i,
  /secret/i,
  /token/i,
  /credential/i,
  /api[_-]?key/i,
  /auth[_-]?token/i,
  /bearer/i,
  /confidential/i,
  /config\.json$/i,
  /secrets?\./i,
  /credentials?\./i,

  // Kubernetes secrets
  /kubeconfig$/i,
  /\.kube\/config$/i,

  // TLS/SSL material
  /\.pfx$/i,
  /\.p12$/i,
  /\.crt$/i,
  /\.cert$/i,
  /\.csr$/i,

  // Database files
  /\.sqlite$/i,
  /\.sqlite3$/i,
  /\.db$/i,

  // Backups that might contain sensitive data
  /\.bak$/i,
  /\.backup$/i,
  /\.old$/i,
  /\.orig$/i,

  // Environment files - secrets, API keys, database credentials
  /\.env$/i,
  /\.envrc$/i,
  /\.env\.local$/i,
  /\.env\.[a-z0-9_-]+$/i,
  /\.env\./i,

  // Package manager configs with auth tokens
  /\.npmrc$/i,
  /\.pypirc$/i,
  /\.gemrc$/i,
  /\.yarnrc$/i,
  /\.yarnrc\.ya?ml$/i,
  /\.dockercfg$/i,

  // Network & DB credentials
  /\.netrc$/i,
  /_netrc$/i,
  /\.pgpass$/i,

  // IDE/CI configs with potential credentials
  /\.vscode\/settings\.json$/i,
  /\.idea\/.*\.xml$/i,
  /\.github\/workflows\/.*\.yml$/i,
  /\.gitlab-ci\.yml$/i,
  /\.travis\.yml$/i,

  // Git repository internals (credentials, tokens, config)
  /\.git[\/\\]/i,
  /\.gitconfig$/i,
  /\.git-credentials$/i,

  // Shell history
  /\.bash_history$/i,
  /\.zsh_history$/i,
  /\.sh_history$/i,
  /fish_history$/i,
];

/** Directories blocked recursively. */
export const SENSITIVE_DIRECTORIES: RegExp[] = [
  /(?:^|\/)\.git(?:\/|$)/i,
  /(?:^|\/)\.ssh(?:\/|$)/i,
  /(?:^|\/)\.aws(?:\/|$)/i,
  /(?:^|\/)\.azure(?:\/|$)/i,
  /(?:^|\/)\.gnupg(?:\/|$)/i,
  /(?:^|\/)\.kube(?:\/|$)/i,
  /(?:^|\/)\.docker(?:\/|$)/i,
  /(?:^|\/)\.config\/gcloud(?:\/|$)/i,
  /(?:^|\/)\.config\/git(?:\/|$)/i,
  /(?:^|\/)etc\/shadow(?:\/|$)/i,
  /(?:^|\/)etc\/passwd(?:\/|$)/i,
  /(?:^|\/)System\/Keychains(?:\/|$)/i,
  /(?:^|\/)Keychains(?:\/|$)/i,
];

export function normalizeForSensitiveCheck(filePath: string): string {
  if (!filePath) return "";
  let decoded = filePath;
  for (let i = 0; i < 3; i++) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }

  // Strip Windows NTFS Alternate Data Stream suffixes (e.g. ::$DATA, :stream:$DATA, :custom-stream)
  decoded = decoded.replace(/::\$DATA/gi, "");
  decoded = decoded.replace(/(?<!^[a-zA-Z]):[^\\/]+(?=[\\/]|$)/gi, "");

  // Strip trailing dots and spaces from path components (Windows auto-trims them on disk access)
  decoded = decoded.replace(/[.\s]+(?=[\\/]|$)/g, "");

  return decoded.toLowerCase().replace(/\\/g, "/");
}

export function isSensitiveFile(filePath: string): boolean {
  if (!filePath) return false;
  const normalized = normalizeForSensitiveCheck(filePath);
  return (
    SENSITIVE_PATTERNS.some((p) => p.test(normalized)) ||
    SENSITIVE_DIRECTORIES.some((p) => p.test(normalized))
  );
}

/**
 * Throws E_SENSITIVE_FILE if the path matches a sensitive pattern.
 * The error message names the matched pattern, never the path.
 */
export function assertNotSensitive(filePath: string): void {
  if (!filePath) {
    throw new FileOrganizerError(
      "Invalid file path provided",
      "E_SENSITIVE_FILE",
    );
  }

  const normalized = normalizeForSensitiveCheck(filePath);

  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(normalized)) {
      throw new FileOrganizerError(
        `Access denied: file matches sensitive pattern ${pattern.source}`,
        "E_SENSITIVE_FILE",
        undefined,
        "This file may contain sensitive information and cannot be read",
      );
    }
  }

  for (const pattern of SENSITIVE_DIRECTORIES) {
    if (pattern.test(normalized)) {
      throw new FileOrganizerError(
        `Access denied: path is within sensitive directory matching ${pattern.source}`,
        "E_SENSITIVE_FILE",
        undefined,
        "This directory is blocked from reads",
      );
    }
  }
}
