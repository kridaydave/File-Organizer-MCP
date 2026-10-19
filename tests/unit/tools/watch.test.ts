/**
 * File Organizer MCP Server - Watch Tools Tests
 * Tests for watch_directory, unwatch_directory, and list_watches tools
 */

import { describe, it, expect } from '@jest/globals';
import {
  WatchDirectoryInputSchema,
  UnwatchDirectoryInputSchema,
  ListWatchesInputSchema,
} from '../../../src/extensions/scheduler/watch.schemas.js';
import {
  watchDirectoryToolDefinition,
  unwatchDirectoryToolDefinition,
  listWatchesToolDefinition,
} from '../../../src/tools/watch-tools.js';

describe('Watch Tools Input Schemas', () => {
  describe('WatchDirectoryInputSchema', () => {
    it('should validate minimal valid input', () => {
      const input = {
        directory: '/test/dir',
        schedule: '0 10 * * *',
      };

      const result = WatchDirectoryInputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.auto_organize).toBe(true); // default
      }
    });

    it('should validate full configuration', () => {
      const input = {
        directory: '/test/dir',
        schedule: '*/30 * * * *',
        auto_organize: true,
        min_file_age_minutes: 5,
        max_files_per_run: 100,
        response_format: 'json',
      };

      const result = WatchDirectoryInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject empty directory', () => {
      const input = {
        directory: '',
        schedule: '0 10 * * *',
      };

      const result = WatchDirectoryInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject negative min_file_age_minutes', () => {
      const input = {
        directory: '/test/dir',
        schedule: '0 10 * * *',
        min_file_age_minutes: -1,
      };

      const result = WatchDirectoryInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject zero max_files_per_run', () => {
      const input = {
        directory: '/test/dir',
        schedule: '0 10 * * *',
        max_files_per_run: 0,
      };

      const result = WatchDirectoryInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject non-integer min_file_age_minutes', () => {
      const input = {
        directory: '/test/dir',
        schedule: '0 10 * * *',
        min_file_age_minutes: 5.5,
      };

      const result = WatchDirectoryInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should accept zero min_file_age_minutes', () => {
      const input = {
        directory: '/test/dir',
        schedule: '0 10 * * *',
        min_file_age_minutes: 0,
      };

      const result = WatchDirectoryInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept various valid cron expressions', () => {
      const validCrons = [
        '0 10 * * *',
        '*/30 * * * *',
        '0 */6 * * *',
        '0 9 * * 1',
        '* * * * *',
      ];

      validCrons.forEach((cron) => {
        const input = { directory: '/test/dir', schedule: cron };
        const result = WatchDirectoryInputSchema.safeParse(input);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('UnwatchDirectoryInputSchema', () => {
    it('should validate valid input', () => {
      const input = { directory: '/test/dir' };
      const result = UnwatchDirectoryInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject empty directory', () => {
      const input = { directory: '' };
      const result = UnwatchDirectoryInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should accept with response_format', () => {
      const input = { directory: '/test/dir', response_format: 'json' };
      const result = UnwatchDirectoryInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });

  describe('ListWatchesInputSchema', () => {
    it('should validate empty input', () => {
      const input = {};
      const result = ListWatchesInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should validate with response_format', () => {
      const input = { response_format: 'json' };
      const result = ListWatchesInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should validate with markdown response_format', () => {
      const input = { response_format: 'markdown' };
      const result = ListWatchesInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });
});

describe('Watch tools are part of the core MCP server', () => {
  it('registers all four watch tools in the core registry', async () => {
    const { TOOLS } = await import('../../../src/mcp/registry.js');
    const names = TOOLS.map((t) => t.name);

    expect(names).toContain('file_organizer_watch_directory');
    expect(names).toContain('file_organizer_unwatch_directory');
    expect(names).toContain('file_organizer_list_watches');
    expect(names).toContain('file_organizer_watch_status');
  });

  it('keeps the watch manager handlers available for the standalone CLI', async () => {
    const manager = await import('../../../src/extensions/scheduler/watch-manager.js');

    expect(typeof manager.handleWatchDirectory).toBe('function');
    expect(typeof manager.handleUnwatchDirectory).toBe('function');
    expect(typeof manager.handleListWatches).toBe('function');
  });
});

// The hand-written JSON inputSchema is what the MCP client reads off the wire;
// the Zod schema is what the handler parses with. Nothing else checks the two
// against each other, so this holds the line: every Zod field must be visible
// in the JSON schema, and vice versa, with the same required set.
describe('Watch tool definitions stay in step with their Zod schemas', () => {
  // Only the two members this test reads off a Zod object: its shape, and
  // whether each field tolerates undefined (= not required). A structural type
  // keeps the cases array homogeneous without wrestling Zod's generics.
  type ReadableZodObject = {
    shape: Record<string, { isOptional(): boolean }>;
  };

  const cases: Array<{
    name: string;
    definition: typeof watchDirectoryToolDefinition;
    schema: ReadableZodObject;
  }> = [
    {
      name: 'file_organizer_watch_directory',
      definition: watchDirectoryToolDefinition,
      schema: WatchDirectoryInputSchema,
    },
    {
      name: 'file_organizer_unwatch_directory',
      definition: unwatchDirectoryToolDefinition,
      schema: UnwatchDirectoryInputSchema,
    },
    {
      name: 'file_organizer_list_watches',
      definition: listWatchesToolDefinition,
      schema: ListWatchesInputSchema,
    },
  ];

  it.each(cases)(
    '$name exposes every Zod field in its JSON schema and marks the same ones required',
    ({ definition, schema }) => {
      const properties = definition.inputSchema.properties ?? {};
      const jsonKeys = Object.keys(properties).sort();
      const zodKeys = Object.keys(schema.shape).sort();
      expect(jsonKeys).toEqual(zodKeys);

      // A field is required in Zod when undefined is not accepted for it. A
      // .default() field accepts undefined (the default fills it in), so it is
      // not required — which is why auto_organize and response_format are
      // optional here while directory and schedule are not.
      const zodRequired = zodKeys.filter((k) => !schema.shape[k]?.isOptional());
      const jsonRequired = [...(definition.inputSchema.required ?? [])].sort();
      expect(jsonRequired).toEqual(zodRequired);
    },
  );

  it.each(cases)(
    '$name keeps its response_format enum in step with the common params',
    ({ definition }) => {
      expect(definition.inputSchema.properties?.response_format).toEqual({
        type: 'string',
        enum: ['json', 'markdown'],
        default: 'markdown',
        description: expect.any(String),
      });
    },
  );
});
