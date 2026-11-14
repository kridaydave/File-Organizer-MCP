/**
 * Config loader — custom rule write/load round trip.
 *
 * The write side is what makes set_custom_rules survive a restart, so it is
 * tested here at the loader level rather than through the tool: write rules,
 * read them back, and confirm the write does not disturb unrelated keys.
 *
 * getUserConfigPath is redirected to a temp dir so the developer's real
 * config file is never read or written.
 */

import { describe, it, expect, beforeEach, afterAll, jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { CustomRule } from '../../../../src/types.js';

const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'test-config-'));
const configPath = path.join(tempDir, 'config.json');
let activeConfigPath = configPath;

// Import the real module before registering the mock — importing the same
// specifier inside the factory would resolve to the mock and loop forever.
const actualPaths = await import('../../../../src/core/config/paths.js');

jest.unstable_mockModule('../../../../src/core/config/paths.js', () => ({
    ...actualPaths,
    getUserConfigPath: () => activeConfigPath,
}));

const { loadUserConfig, updateUserConfig } = await import(
    '../../../../src/core/config/loader.js'
);

const WIDGET_RULE: CustomRule = {
    category: 'Widgets',
    filenamePattern: '\\.widget$',
    priority: 100,
};

describe('custom rules config persistence', () => {
    beforeEach(() => {
        activeConfigPath = configPath;
        fs.rmSync(configPath, { force: true, recursive: true });
        fs.rmSync(path.join(tempDir, 'blocked.json'), { force: true, recursive: true });
    });

    afterAll(async () => {
        // Windows keeps handles briefly after a write; give them a moment.
        await new Promise((resolve) => setTimeout(resolve, 100));
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('reports no custom rules before anything is written', () => {
        expect(loadUserConfig().customRules).toBeUndefined();
    });

    it('round-trips custom rules through the config file', () => {
        expect(updateUserConfig({ customRules: [WIDGET_RULE] })).toBe(true);

        // On disk, in the internal camelCase shape the categorizer consumes.
        const onDisk = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
            customRules?: CustomRule[];
        };
        expect(onDisk.customRules).toHaveLength(1);
        expect(onDisk.customRules?.[0]).toEqual(WIDGET_RULE);

        // And back through the loader, which is what every request reads.
        expect(loadUserConfig().customRules).toEqual([WIDGET_RULE]);
    });

    it('leaves no temp file behind after the atomic write', () => {
        updateUserConfig({ customRules: [WIDGET_RULE] });

        expect(fs.readdirSync(tempDir)).toEqual(['config.json']);
    });

    it('replaces the previous rule set on a later write', () => {
        updateUserConfig({ customRules: [WIDGET_RULE] });
        updateUserConfig({
            customRules: [{ category: 'Gadgets', extensions: ['.gadget'], priority: 5 }],
        });

        const loaded = loadUserConfig().customRules ?? [];
        expect(loaded).toHaveLength(1);
        expect(loaded[0]?.category).toBe('Gadgets');
    });

    it('keeps unrelated config keys when rules are written', () => {
        updateUserConfig({ conflictStrategy: 'skip' });
        updateUserConfig({ customRules: [WIDGET_RULE] });

        const loaded = loadUserConfig();
        expect(loaded.conflictStrategy).toBe('skip');
        expect(loaded.customRules).toEqual([WIDGET_RULE]);
    });

    it('returns false and cleans up its temp file when the write cannot land', () => {
        // A directory where the config file belongs: the final rename fails.
        const blockedPath = path.join(tempDir, 'blocked.json');
        fs.mkdirSync(blockedPath, { recursive: true });
        activeConfigPath = blockedPath;

        expect(updateUserConfig({ customRules: [WIDGET_RULE] })).toBe(false);
        expect(fs.readdirSync(tempDir).filter((name) => name.includes('tmp'))).toEqual([]);
    });
});