/**
 * Config — security / blocked patterns
 * Extracted from src/config.ts (no behavior change)
 */

import os from "os";

/**
 * Returns true if the resolved path is a well-known external-volume mount
 * location on the current platform.
 *
 * - macOS : /Volumes/<name>/...
 * - Linux : /media/<name>/..., /mnt/..., /run/media/<name>/...
 * - Windows: not needed — drive letters work without a home-dir guard
 */
export function isExternalVolumePath(resolvedDir: string): boolean {
  const platform = os.platform();
  if (platform === "darwin") {
    return resolvedDir.startsWith("/Volumes/");
  }
  if (platform === "linux") {
    return (
      /^\/media\//.test(resolvedDir) ||
      /^\/mnt\//.test(resolvedDir) ||
      /^\/run\/media\//.test(resolvedDir)
    );
  }
  return false;
}

/**
 * Get always-blocked path patterns
 */
export function getAlwaysBlockedPatterns(): RegExp[] {
  const platform = os.platform();

  // Common patterns across all platforms
  const common = [
    /node_modules/i,
    /(?:^|[\/\\])\.git(?:[\/\\]|$)/i,
    /(?:^|[\/\\])\.vscode(?:[\/\\]|$)/i,
    /(?:^|[\/\\])\.idea(?:[\/\\]|$)/i,
    /(?:^|[\/\\])\.next(?:[\/\\]|$)/i,
    /(?:^|[\/\\])dist(?:[\/\\]|$)/i,
    /(?:^|[\/\\])build(?:[\/\\]|$)/i,
  ];

  if (platform === "win32") {
    return [
      ...common,
      /^[A-Z]:[\/\\]Windows(?:[\/\\]|$)/i,
      /^[A-Z]:[\/\\]Program Files(?:[\/\\]|$)/i,
      /^[A-Z]:[\/\\]Program Files \(x86\)(?:[\/\\]|$)/i,
      /^[A-Z]:[\/\\]ProgramData(?:[\/\\]|$)/i,
      // AppData holds user credentials/cache data, but %TEMP% lives under
      // AppData\Local\Temp and must stay usable when explicitly whitelisted.
      // Block Local (except Temp), LocalLow and Roaming instead of all of AppData.
      /[\/\\]AppData[\/\\](?:(?!Local[\/\\]Temp(?:[\/\\]|$))Local|LocalLow|Roaming)(?:[\/\\]|$)/i,
      /^[A-Z]:[\/\\]\$Recycle\.Bin(?:[\/\\]|$)/i,
      /^[A-Z]:[\/\\]System Volume Information(?:[\/\\]|$)/i,
    ];
  } else if (platform === "darwin") {
    return [
      ...common,
      /^\/System(?:[\/]|$)/i,
      /^\/Library(?:[\/]|$)/i,
      /^\/Applications(?:[\/]|$)/i,
      // /System, /Library, /Applications, /usr, /bin, /sbin and /opt are
      // symlinked INTO /private on macOS, and /var resolves to /private/var.
      // Block the canonical sensitive dirs explicitly instead of all of
      // /private, so per-user temp dirs (/private/var/folders) remain usable
      // when explicitly whitelisted.
      /^\/private\/(?:etc|tmp)(?:[\/]|$)/i,
      /^\/private\/var\/(?:db|root|vm|at|run|log|spool|audit|tmp)(?:[\/]|$)/i,
      /^\/usr(?:[\/]|$)/i,
      /^\/bin(?:[\/]|$)/i,
      /^\/sbin(?:[\/]|$)/i,
      /^\/opt(?:[\/]|$)/i,
      /\/Library\/Application Support(?:[\/]|$)/i,
    ];
  } else {
    return [
      ...common,
      /^\/etc(?:[\/]|$)/i,
      /^\/usr(?:[\/]|$)/i,
      /^\/bin(?:[\/]|$)/i,
      /^\/sbin(?:[\/]|$)/i,
      /^\/sys(?:[\/]|$)/i,
      /^\/proc(?:[\/]|$)/i,
      /^\/root(?:[\/]|$)/i,
      /^\/var(?:[\/]|$)/i,
      /^\/boot(?:[\/]|$)/i,
      /^\/opt(?:[\/]|$)/i,
    ];
  }
}
