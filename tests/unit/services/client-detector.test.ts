import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import fs from "fs/promises";
import path from "path";
import os from "os";
import {
  parseJsonc,
  stripJsoncComments,
  stripTrailingCommas,
  writeClientConfig,
  type MCPClient,
} from "../../../src/tui/client-detector.js";

describe("Client Detector JSONC & Config Safety", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "test-client-detector-"));
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe("JSONC parser helpers", () => {
    it("should strip single-line and multi-line comments while preserving strings", () => {
      const input = `
        {
          // single line comment
          "url": "http://example.com//not-a-comment",
          /* multi-line
             comment */
          "text": "/* also not a comment */"
        }
      `;
      const stripped = stripJsoncComments(input);
      const parsed = JSON.parse(stripped);
      expect(parsed.url).toBe("http://example.com//not-a-comment");
      expect(parsed.text).toBe("/* also not a comment */");
    });

    it("should strip trailing commas from objects and arrays", () => {
      const input = `
        {
          "items": [1, 2, 3,],
          "obj": { "a": 1, "b": 2, },
        }
      `;
      const cleaned = stripTrailingCommas(input);
      const parsed = JSON.parse(cleaned);
      expect(parsed.items).toEqual([1, 2, 3]);
      expect(parsed.obj).toEqual({ a: 1, b: 2 });
    });

    it("should parse full JSONC with comments and trailing commas", () => {
      const input = `
        // Cursor MCP configuration
        {
          "mcpServers": {
            "existing-server": {
              "command": "node",
              "args": ["server.js",],
            },
          },
        }
      `;
      const parsed = parseJsonc(input) as Record<string, unknown>;
      expect(parsed).toHaveProperty("mcpServers");
      const servers = parsed.mcpServers as Record<string, unknown>;
      expect(servers["existing-server"]).toBeDefined();
    });
  });

  describe("writeClientConfig", () => {
    it("should preserve existing configuration when JSONC contains comments and trailing commas", async () => {
      const configFilePath = path.join(testDir, "mcp.json");
      const initialContent = `
        // User custom settings
        {
          "mcpServers": {
            "custom-tool": {
              "command": "my-tool",
              "args": ["--port", "8080",],
            },
          },
        }
      `;
      await fs.writeFile(configFilePath, initialContent, "utf-8");

      const client: MCPClient = {
        id: "cursor",
        name: "Cursor",
        description: "AI-powered code editor",
        icon: "✨",
        installed: true,
        configPath: testDir,
        configFormat: "json",
        website: "https://cursor.com",
      };

      const result = await writeClientConfig(client, "file-organizer");
      expect(result.success).toBe(true);

      const updatedContent = await fs.readFile(configFilePath, "utf-8");
      const parsed = JSON.parse(updatedContent);

      // Both the custom-tool and the new file-organizer should exist
      expect(parsed.mcpServers["custom-tool"]).toBeDefined();
      expect(parsed.mcpServers["file-organizer"]).toBeDefined();
    });
  });
});
