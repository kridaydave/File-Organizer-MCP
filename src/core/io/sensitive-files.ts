/**
 * Sensitive file patterns.
 * Checked BEFORE any read operation. A match means the read is denied.
 */

import { FileOrganizerError } from "../../errors.js";

export const SENSITIVE_PATTERNS: RegExp[] = [
  // Environment files - secrets, API keys, database credentials
  /\.env(?:~|\.(?:bak|backup|old|orig))?$/i,
  /\.env\.local(?:~|\.(?:bak|backup|old|orig))?$/i,
  /\.env\.[a-z]+(?:~|\.(?:bak|backup|old|orig))?$/i,
  /\.env\./i,

  // SSH keys
  /\.ssh\//i,
  /id_rsa/i,
  /id_ed25519/i,
  /id_ecdsa/i,
  /id_dsa/i,
  /\.pem(?:~|\.(?:bak|backup|old|orig))?$/i,
  /\.key(?:~|\.(?:bak|backup|old|orig))?$/i,
  /ssh_key/i,
  /private.*key/i,

  // AWS credentials
  /\.aws\//i,
  /aws\/(credentials|config)(?:~|\.(?:bak|backup|old|orig))?$/i,

  // Docker config may contain registry credentials
  /\.docker\/config\.json(?:~|\.(?:bak|backup|old|orig))?$/i,

  // Package manager configs with auth tokens
  /\.npmrc(?:~|\.(?:bak|backup|old|orig))?$/i,
  /\.pypirc(?:~|\.(?:bak|backup|old|orig))?$/i,
  /\.gemrc(?:~|\.(?:bak|backup|old|orig))?$/i,

  // System password files
  /shadow(?:~|\.(?:bak|backup|old|orig))?$/i,
  /passwd(?:~|\.(?:bak|backup|old|orig))?$/i,
  /master\.passwd(?:~|\.(?:bak|backup|old|orig))?$/i,
  /sam(?:~|\.(?:bak|backup|old|orig))?$/i,
  /system32(?:~|\.(?:bak|backup|old|orig))?$/i,

  // Generic sensitive names
  /password/i,
  /secret/i,
  /token/i,
  /credential/i,
  /api[_-]?key/i,
  /auth[_-]?token/i,
  /bearer/i,
  /confidential/i,
  /config\.json(?:~|\.(?:bak|backup|old|orig))?$/i,
  /secrets?\./i,
  /credentials?\./i,

  // Kubernetes secrets
  /kubeconfig(?:~|\.(?:bak|backup|old|orig))?$/i,
  /\.kube\/config(?:~|\.(?:bak|backup|old|orig))?$/i,

  // TLS/SSL material
  /\.pfx(?:~|\.(?:bak|backup|old|orig))?$/i,
  /\.p12(?:~|\.(?:bak|backup|old|orig))?$/i,
  /\.crt(?:~|\.(?:bak|backup|old|orig))?$/i,
  /\.cert(?:~|\.(?:bak|backup|old|orig))?$/i,
  /\.csr(?:~|\.(?:bak|backup|old|orig))?$/i,

  // Database files
  /\.sqlite(?:~|\.(?:bak|backup|old|orig))?$/i,
  /\.sqlite3(?:~|\.(?:bak|backup|old|orig))?$/i,
  /\.db(?:~|\.(?:bak|backup|old|orig))?$/i,

  // Backups that might contain sensitive data
  /\.bak$/i,
  /\.backup$/i,
  /\.old$/i,
  /\.orig$/i,

  // Environment files - secrets, API keys, database credentials
  /\.env(?:~|\.(?:bak|backup|old|orig))?$/i,
  /\.envrc(?:~|\.(?:bak|backup|old|orig))?$/i,
  /\.env\.local(?:~|\.(?:bak|backup|old|orig))?$/i,
  /\.env\.[a-z0-9_-]+(?:~|\.(?:bak|backup|old|orig))?$/i,
  /\.env\./i,

  // Package manager configs with auth tokens
  /\.npmrc(?:~|\.(?:bak|backup|old|orig))?$/i,
  /\.pypirc(?:~|\.(?:bak|backup|old|orig))?$/i,
  /\.gemrc(?:~|\.(?:bak|backup|old|orig))?$/i,
  /\.yarnrc(?:~|\.(?:bak|backup|old|orig))?$/i,
  /\.yarnrc\.ya?ml(?:~|\.(?:bak|backup|old|orig))?$/i,
  /\.dockercfg(?:~|\.(?:bak|backup|old|orig))?$/i,

  // Network & DB credentials
  /\.netrc(?:~|\.(?:bak|backup|old|orig))?$/i,
  /_netrc(?:~|\.(?:bak|backup|old|orig))?$/i,
  /\.pgpass(?:~|\.(?:bak|backup|old|orig))?$/i,

  // IDE/CI configs with potential credentials
  /\.vscode\/settings\.json(?:~|\.(?:bak|backup|old|orig))?$/i,
  /\.idea\/.*\.xml(?:~|\.(?:bak|backup|old|orig))?$/i,
  /\.github\/workflows\/.*\.yml(?:~|\.(?:bak|backup|old|orig))?$/i,
  /\.gitlab-ci\.yml(?:~|\.(?:bak|backup|old|orig))?$/i,
  /\.travis\.yml(?:~|\.(?:bak|backup|old|orig))?$/i,

  // Git repository internals (credentials, tokens, config)
  /\.git[\/\\]/i,
  /\.gitconfig(?:~|\.(?:bak|backup|old|orig))?$/i,
  /\.git-credentials(?:~|\.(?:bak|backup|old|orig))?$/i,

  // Shell history
  /\.bash_history(?:~|\.(?:bak|backup|old|orig))?$/i,
  /\.zsh_history(?:~|\.(?:bak|backup|old|orig))?$/i,
  /\.sh_history(?:~|\.(?:bak|backup|old|orig))?$/i,
  /fish_history(?:~|\.(?:bak|backup|old|orig))?$/i,
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
