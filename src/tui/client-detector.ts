#!/usr/bin/env node

/**
 * MCP Client Detector - Auto-detects installed MCP-compatible clients
 *
 * Detects clients like:
 * - Claude Desktop
 * - Cursor
 * - Windsurf (Codeium)
 * - Cline (VS Code extension)
 * - Continue (VS Code extension)
 * - Roo Code (VS Code extension)
 */

import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const configWriteLocks = new Map<string, boolean>();

function acquireConfigLock(
  configFilePath: string,
  timeoutMs: number = 5000,
): boolean {
  const startTime = Date.now();
  while (configWriteLocks.has(configFilePath)) {
    if (Date.now() - startTime > timeoutMs) {
      return false;
    }
    const start = Date.now();
    while (Date.now() - start < 10) {
      /* spin */
    }
  }
  configWriteLocks.set(configFilePath, true);
  return true;
}

function releaseConfigLock(configFilePath: string): void {
  configWriteLocks.delete(configFilePath);
}

function atomicWriteConfig(configFilePath: string, content: string): void {
  const tempPath = configFilePath + ".tmp";
  try {
    fs.writeFileSync(tempPath, content, "utf-8");
    fs.renameSync(tempPath, configFilePath);
  } catch (error) {
    try {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

export interface MCPClient {
  id: string;
  name: string;
  description: string;
  icon: string;
  installed: boolean;
  configPath?: string;
  configFormat: "json" | "yaml" | "jsonc";
  website: string;
}

export interface ClientDetectionResult {
  clients: MCPClient[];
  detectedCount: number;
  platform: string;
}

// Common MCP client definitions
const CLIENT_DEFINITIONS = [
  {
    id: "claude-desktop",
    name: "Claude Desktop",
    description: "Anthropic's official desktop app for Claude",
    icon: "🤖",
    website: "https://claude.ai/download",
    configFile: "claude_desktop_config.json",
  },
  {
    id: "cursor",
    name: "Cursor",
    description: "AI-powered code editor with MCP support",
    icon: "✨",
    website: "https://cursor.com",
    configFile: "mcp.json",
  },
  {
    id: "windsurf",
    name: "Windsurf",
    description: "Codeium's AI code editor with MCP support",
    icon: "🌊",
    website: "https://codeium.com/windsurf",
    configFile: "mcp_config.json",
  },
  {
    id: "cline",
    name: "Cline (VS Code)",
    description: "VS Code extension for AI coding with MCP",
    icon: "👨‍💻",
    website: "https://github.com/cline/cline",
    configFile: "cline_mcp_settings.json",
    vsCodeExtension: "saoudrizwan.claude-dev",
  },
  {
    id: "roo-code",
    name: "Roo Code (VS Code)",
    description: "VS Code extension for AI coding (Cline fork)",
    icon: "🦘",
    website: "https://github.com/RooVetGit/Roo-Code",
    configFile: "roo_code_mcp_settings.json",
    vsCodeExtension: "RooVeterinaryInc.roo-cline",
  },
  {
    id: "continue",
    name: "Continue (VS Code)",
    description: "Open-source AI code assistant with MCP",
    icon: "⏩",
    website: "https://continue.dev",
    configFile: "config.json",
    vsCodeExtension: "Continue.continue",
    configSubdir: "continue",
  },
];

/**
 * Get the base config directory for the current platform
 */
function getPlatformConfigDir(): string {
  const platform = os.platform();
  const home = os.homedir();

  switch (platform) {
    case "win32":
      return process.env.APPDATA || path.join(home, "AppData", "Roaming");
    case "darwin":
      return path.join(home, "Library", "Application Support");
    default: // linux
      return process.env.XDG_CONFIG_HOME || path.join(home, ".config");
  }
}

/**
 * Get VS Code config directory
 */
function getVSCodeConfigDir(): string | null {
  const platform = os.platform();
  const home = os.homedir();

  switch (platform) {
    case "win32": {
      const paths = [
        path.join(home, "AppData", "Roaming", "Code", "User", "globalStorage"),
        path.join(
          home,
          "AppData",
          "Roaming",
          "Code - Insiders",
          "User",
          "globalStorage",
        ),
        path.join(home, ".vscode", "extensions"),
      ];
      for (const p of paths) {
        try {
          if (fs.existsSync(p)) return p;
        } catch {
          // Continue to next path
        }
      }
      return null;
    }
    case "darwin": {
      const paths = [
        path.join(
          home,
          "Library",
          "Application Support",
          "Code",
          "User",
          "globalStorage",
        ),
        path.join(
          home,
          "Library",
          "Application Support",
          "Code - Insiders",
          "User",
          "globalStorage",
        ),
        path.join(home, ".vscode", "extensions"),
      ];
      for (const p of paths) {
        try {
          if (fs.existsSync(p)) return p;
        } catch {
          // Continue to next path
        }
      }
      return null;
    }
    default: {
      const paths = [
        path.join(home, ".config", "Code", "User", "globalStorage"),
        path.join(home, ".config", "Code - Insiders", "User", "globalStorage"),
        path.join(home, ".vscode", "extensions"),
      ];
      for (const p of paths) {
        try {
          if (fs.existsSync(p)) return p;
        } catch {
          // Continue to next path
        }
      }
      return null;
    }
  }
}

/**
 * Check if a VS Code extension is installed
 */
function isVSCodeExtensionInstalled(extensionId: string): boolean {
  const vscodeDir = getVSCodeConfigDir();
  if (!vscodeDir) return false;

  try {
    // Check in globalStorage for extension settings
    const extensionPath = path.join(vscodeDir, extensionId);
    if (fs.existsSync(extensionPath)) return true;

    // Check in extensions folder
    const extensionsDir = vscodeDir.includes("globalStorage")
      ? path.join(vscodeDir, "..", "..", "..", "extensions")
      : vscodeDir;

    if (fs.existsSync(extensionsDir)) {
      const entries = fs.readdirSync(extensionsDir);
      return entries.some((entry) =>
        entry.toLowerCase().includes(extensionId.toLowerCase()),
      );
    }
  } catch {
    // Ignore errors
  }

  return false;
}

/**
 * Detect Claude Desktop
 */
function detectClaudeDesktop(): MCPClient | null {
  const configDir = path.join(getPlatformConfigDir(), "Claude");
  let installed = false;

  try {
    const configPath = path.join(configDir, "claude_desktop_config.json");
    installed = fs.existsSync(configPath) || fs.existsSync(configDir);
  } catch {
    installed = false;
  }

  return {
    id: "claude-desktop",
    name: "Claude Desktop",
    description: "Anthropic's official desktop app for Claude",
    icon: "🤖",
    installed,
    configPath: configDir,
    configFormat: "json",
    website: "https://claude.ai/download",
  };
}

/**
 * Detect Cursor
 */
function detectCursor(): MCPClient | null {
  const platform = os.platform();
  const home = os.homedir();
  let configDir: string | null = null;

  if (platform === "win32") {
    configDir = path.join(home, ".cursor");
  } else if (platform === "darwin") {
    configDir = path.join(home, ".cursor");
  } else {
    configDir = path.join(home, ".config", "Cursor");
  }

  const configPath = configDir ? path.join(configDir, "mcp.json") : null;

  // Check if Cursor is installed by looking for the app
  let appInstalled = false;
  try {
    if (platform === "win32" && process.env.LOCALAPPDATA) {
      const cursorPath = path.join(
        process.env.LOCALAPPDATA,
        "Programs",
        "cursor",
        "Cursor.exe",
      );
      appInstalled = fs.existsSync(cursorPath);
    } else if (platform === "darwin") {
      appInstalled = fs.existsSync("/Applications/Cursor.app");
    } else {
      appInstalled =
        fs.existsSync("/usr/bin/cursor") ||
        fs.existsSync("/usr/local/bin/cursor");
    }
  } catch {
    // Ignore
  }

  let installed = false;

  try {
    installed =
      appInstalled || (configDir !== null && fs.existsSync(configDir));
  } catch {
    installed = appInstalled;
  }

  return {
    id: "cursor",
    name: "Cursor",
    description: "AI-powered code editor with MCP support",
    icon: "✨",
    installed,
    configPath: configDir || undefined,
    configFormat: "json",
    website: "https://cursor.com",
  };
}

/**
 * Detect Windsurf (Codeium)
 */
function detectWindsurf(): MCPClient | null {
  const platform = os.platform();
  const home = os.homedir();
  let configDir: string | null = null;

  if (platform === "win32") {
    configDir = path.join(home, ".windsurf");
  } else if (platform === "darwin") {
    configDir = path.join(home, ".windsurf");
  } else {
    configDir = path.join(home, ".config", "Windsurf");
  }

  // Check if Windsurf is installed
  let appInstalled = false;
  try {
    if (platform === "win32" && process.env.LOCALAPPDATA) {
      const windsurfPath = path.join(
        process.env.LOCALAPPDATA,
        "Programs",
        "windsurf",
        "Windsurf.exe",
      );
      appInstalled = fs.existsSync(windsurfPath);
    } else if (platform === "darwin") {
      appInstalled = fs.existsSync("/Applications/Windsurf.app");
    }
  } catch {
    // Ignore
  }

  const installed =
    appInstalled || (configDir !== null && fs.existsSync(configDir));

  return {
    id: "windsurf",
    name: "Windsurf",
    description: "Codeium's AI code editor with MCP support",
    icon: "🌊",
    installed,
    configPath: configDir || undefined,
    configFormat: "json",
    website: "https://codeium.com/windsurf",
  };
}

/**
 * Detect Cline VS Code extension
 */
function detectCline(): MCPClient | null {
  const vscodeDir = getVSCodeConfigDir();
  const installed = isVSCodeExtensionInstalled("saoudrizwan.claude-dev");

  let configPath: string | undefined;
  if (vscodeDir) {
    configPath = path.join(
      vscodeDir,
      "saoudrizwan.claude-dev",
      "settings",
      "cline_mcp_settings.json",
    );

    try {
      if (!fs.existsSync(configPath)) {
        const parentDir = path.dirname(path.dirname(configPath));
        try {
          if (fs.existsSync(parentDir)) {
            const entries = fs.readdirSync(parentDir);
            const match = entries.find((e) =>
              e.toLowerCase().includes("claude-dev"),
            );
            if (match) {
              configPath = path.join(
                parentDir,
                match,
                "settings",
                "cline_mcp_settings.json",
              );
            }
          }
        } catch {
          // Continue with whatever configPath we have
        }
      }
    } catch {
      // Continue with undefined configPath
    }
  }

  return {
    id: "cline",
    name: "Cline (VS Code)",
    description: "VS Code extension for AI coding with MCP",
    icon: "👨‍💻",
    installed,
    configPath:
      configPath ||
      (vscodeDir ? path.join(vscodeDir, "saoudrizwan.claude-dev") : undefined),
    configFormat: "json",
    website: "https://github.com/cline/cline",
  };
}

/**
 * Detect Roo Code VS Code extension
 */
function detectRooCode(): MCPClient | null {
  const vscodeDir = getVSCodeConfigDir();
  const installed = isVSCodeExtensionInstalled("RooVeterinaryInc.roo-cline");

  let configPath: string | undefined;
  if (vscodeDir) {
    configPath = path.join(
      vscodeDir,
      "RooVeterinaryInc.roo-cline",
      "settings",
      "roo_code_mcp_settings.json",
    );
  }

  return {
    id: "roo-code",
    name: "Roo Code (VS Code)",
    description: "VS Code extension for AI coding (Cline fork)",
    icon: "🦘",
    installed,
    configPath:
      configPath ||
      (vscodeDir
        ? path.join(vscodeDir, "RooVeterinaryInc.roo-cline")
        : undefined),
    configFormat: "json",
    website: "https://github.com/RooVetGit/Roo-Code",
  };
}

/**
 * Detect Continue VS Code extension
 */
function detectContinue(): MCPClient | null {
  const vscodeDir = getVSCodeConfigDir();
  const installed = isVSCodeExtensionInstalled("Continue.continue");

  // Continue config is in a different location
  const platform = os.platform();
  const home = os.homedir();
  let configPath: string | undefined;

  if (platform === "win32") {
    configPath = path.join(home, ".continue", "config.json");
  } else if (platform === "darwin") {
    configPath = path.join(home, ".continue", "config.json");
  } else {
    configPath = path.join(home, ".config", "continue", "config.json");
  }

  return {
    id: "continue",
    name: "Continue (VS Code)",
    description: "Open-source AI code assistant with MCP",
    icon: "⏩",
    installed:
      installed || !!(configPath && fs.existsSync(path.dirname(configPath))),
    configPath: configPath ? path.dirname(configPath) : undefined,
    configFormat: "json",
    website: "https://continue.dev",
  };
}

/**
 * Detect all MCP clients
 */
export function detectMCPClients(): ClientDetectionResult {
  const clients: MCPClient[] = [
    detectClaudeDesktop(),
    detectCursor(),
    detectWindsurf(),
    detectCline(),
    detectRooCode(),
    detectContinue(),
  ].filter((client): client is MCPClient => client !== null);

  const detectedCount = clients.filter((c) => c.installed).length;

  return {
    clients,
    detectedCount,
    platform: os.platform(),
  };
}

/**
 * Generate MCP server configuration for a specific client
 */
export function generateClientConfig(
  clientId: string,
  serverName: string = "file-organizer",
): Record<string, unknown> | null {
  // Always use npx for maximum compatibility
  // npx will download the package if not installed, or use the installed version
  const serverConfig = {
    command: "npx",
    args: ["-y", "file-organizer-mcp"],
  };

  switch (clientId) {
    case "claude-desktop":
      return {
        mcpServers: {
          [serverName]: serverConfig,
        },
      };
    case "cursor":
      return {
        mcpServers: {
          [serverName]: serverConfig,
        },
      };
    case "windsurf":
      return {
        mcpServers: {
          [serverName]: serverConfig,
        },
      };
    case "cline":
    case "roo-code":
      return {
        mcpServers: {
          [serverName]: serverConfig,
        },
      };
    case "continue":
      return {
        server: {
          name: serverName,
          command: "npx",
          args: ["-y", "file-organizer-mcp"],
        },
      };
    default:
      return null;
  }
}

/**
 * Deep merge two objects recursively
 */
function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Partial<T>,
): T {
  const result: T = { ...target };
  for (const key in source) {
    const sourceValue = source[key];
    if (sourceValue !== undefined && sourceValue !== null) {
      const targetValue = result[key];
      if (
        typeof sourceValue === "object" &&
        !Array.isArray(sourceValue) &&
        typeof targetValue === "object" &&
        targetValue !== null &&
        !Array.isArray(targetValue)
      ) {
        (result as Record<string, unknown>)[key] = deepMerge(
          targetValue as Record<string, unknown>,
          sourceValue as Record<string, unknown>,
        );
      } else {
        (result as Record<string, unknown>)[key] = sourceValue;
      }
    }
  }
  return result;
}

/**
 * Deep merge mcpServers while preserving nested properties
 */
function mergeMcpServers(
  existingServers: Record<string, unknown> | undefined,
  newServers: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const merged: Record<string, unknown> = {
    ...((existingServers as Record<string, unknown>) || {}),
  };

  if (!newServers) {
    return merged;
  }

  for (const [serverName, serverConfig] of Object.entries(newServers)) {
    const existingServer = (existingServers as Record<string, unknown>)?.[
      serverName
    ];
    if (
      typeof serverConfig === "object" &&
      serverConfig !== null &&
      typeof existingServer === "object" &&
      existingServer !== null
    ) {
      merged[serverName] = deepMerge(
        existingServer as Record<string, unknown>,
        serverConfig as Record<string, unknown>,
      );
    } else {
      merged[serverName] = serverConfig;
    }
  }
  return merged;
}

/**
 * Write configuration to a client
 */
export async function writeClientConfig(
  client: MCPClient,
  serverName: string = "file-organizer",
): Promise<{ success: boolean; message: string }> {
  const config = generateClientConfig(client.id, serverName);
  if (!config) {
    return { success: false, message: "Unsupported client type" };
  }

  // Validate configPath exists before constructing file path
  if (!client.configPath) {
    return {
      success: false,
      message: `Client ${client.name} has no config path`,
    };
  }

  let configFilePath: string;

  switch (client.id) {
    case "claude-desktop":
      configFilePath = path.join(
        client.configPath,
        "claude_desktop_config.json",
      );
      break;
    case "cursor":
      configFilePath = path.join(client.configPath, "mcp.json");
      break;
    case "windsurf":
      configFilePath = path.join(client.configPath, "mcp_config.json");
      break;
    case "cline":
      configFilePath = path.join(client.configPath, "cline_mcp_settings.json");
      break;
    case "roo-code":
      configFilePath = path.join(
        client.configPath,
        "roo_code_mcp_settings.json",
      );
      break;
    case "continue":
      configFilePath = path.join(client.configPath, "config.json");
      break;
    default:
      return { success: false, message: "Unknown client" };
  }

  if (!acquireConfigLock(configFilePath)) {
    return { success: false, message: "Config write timeout - file locked" };
  }

  try {
    // Read existing config if present
    let existingConfig: Record<string, unknown> = {};
    if (fs.existsSync(configFilePath)) {
      try {
        // SEC-002: Reading application config file which is an internal file
        // The configFilePath is constructed from getConfigDir() which uses validated paths
        const content = fs.readFileSync(configFilePath, "utf-8");
        const parsed = JSON.parse(content);
        if (
          parsed !== null &&
          typeof parsed === "object" &&
          !Array.isArray(parsed)
        ) {
          existingConfig = parsed;
        }
      } catch {
        // If parse fails, start fresh
        existingConfig = {};
      }
    }

    // Merge configs - handle Continue's different structure with proper deep merge
    let mergedConfig: Record<string, unknown>;
    if (client.id === "continue") {
      mergedConfig = {
        ...existingConfig,
        ...config,
        server: mergeMcpServers(
          existingConfig.server as Record<string, unknown> | undefined,
          config.server as Record<string, unknown> | undefined,
        ),
      };
    } else {
      mergedConfig = {
        ...existingConfig,
        ...config,
        mcpServers: mergeMcpServers(
          existingConfig.mcpServers as Record<string, unknown> | undefined,
          config.mcpServers as Record<string, unknown> | undefined,
        ),
      };
    }

    // Ensure directory exists
    const configDir = path.dirname(configFilePath);
    if (!fs.existsSync(configDir)) {
      try {
        fs.mkdirSync(configDir, { recursive: true });
      } catch (mkdirError) {
        return {
          success: false,
          message: `Failed to create directory ${configDir}: ${(mkdirError as Error).message}`,
        };
      }
    }

    // Write config
    atomicWriteConfig(configFilePath, JSON.stringify(mergedConfig, null, 2));

    return {
      success: true,
      message: `Configuration saved to ${configFilePath}`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to write config${configFilePath ? ` to ${configFilePath}` : ""}: ${(error as Error).message}`,
    };
  } finally {
    releaseConfigLock(configFilePath);
  }
}

export default {
  detectMCPClients,
  generateClientConfig,
  writeClientConfig,
};
