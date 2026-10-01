import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import { handleFindDuplicateFiles } from '../../../src/tools/file-duplicates.js';
import { handleAnalyzeDuplicates } from '../../../src/tools/duplicate-management.js';

const tempRoot = (): string => path.join(process.cwd(), 'tests', 'temp');

/** `ToolResponse.content[0]` is optional under noUncheckedIndexedAccess. */
function textOf(result: { content: { text: string }[] }): string {
  const first = result.content[0];
  if (!first) throw new Error('expected the tool to return content');
  return first.text;
}


/**
 * The skipped-file notice is one shared block spliced into two different
 * markdown templates. Those templates disagree about where the separators go,
 * so asserting the block in isolation cannot catch a caller that restyles its
 * own output. These tests assert the composed text instead.
 *
 * The separators differ per tool on purpose: find-duplicates ends its document
 * right after the notice, analyze ends with a newline. Both shapes match what
 * shipped before the notice was extracted.
 */
describe('skipped-file notice placement in composed output', () => {
    let testDir: string;

    beforeEach(async () => {
        await fs.mkdir(tempRoot(), { recursive: true });
        testDir = await fs.mkdtemp(path.join(tempRoot(), 'notice-place-'));
        await fs.writeFile(path.join(testDir, 'a.txt'), 'same content');
        await fs.writeFile(path.join(testDir, 'b.txt'), 'same content');
        await fs.writeFile(path.join(testDir, 'empty.txt'), '');
    });

    afterEach(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        await fs.rm(testDir, { recursive: true, force: true });
    });

    async function dirWithoutSkips(): Promise<string> {
        const clean = await fs.mkdtemp(path.join(tempRoot(), 'notice-clean-'));
        await fs.writeFile(path.join(clean, 'a.txt'), 'one');
        await fs.writeFile(path.join(clean, 'b.txt'), 'two');
        return clean;
    }

    it('find-duplicates separates the notice with a blank line and ends the document there', async () => {
        const text = textOf(await handleFindDuplicateFiles({ directory: testDir }));

        expect(text).toContain('\n\n⚠️ **Not analyzed: 1 file(s)**');
        expect(text).toContain(`- \`${path.join(testDir, 'empty.txt')}\` (0 Bytes)`);
        expect(text.endsWith('\n')).toBe(false);
    });

    it('analyze separates the notice with a single newline and ends with exactly one', async () => {
        const text = textOf(await handleAnalyzeDuplicates({ directory: testDir }));

        expect(text).toContain('\n⚠️ **Not analyzed: 1 file(s)**');
        expect(text).toContain(`- \`${path.join(testDir, 'empty.txt')}\` (0 Bytes)`);
        expect(text.endsWith('\n')).toBe(true);
        expect(text.endsWith('\n\n')).toBe(false);
    });

    it('find-duplicates adds no notice or separator when nothing was skipped', async () => {
        const clean = await dirWithoutSkips();
        try {
            const text = textOf(await handleFindDuplicateFiles({ directory: clean }));

            expect(text).not.toContain('⚠️');
            expect(text).not.toContain('Not analyzed');
        } finally {
            await fs.rm(clean, { recursive: true, force: true });
        }
    });

    it('analyze adds no notice or separator when nothing was skipped', async () => {
        const clean = await dirWithoutSkips();
        try {
            const text = textOf(await handleAnalyzeDuplicates({ directory: clean }));

            expect(text).not.toContain('⚠️');
            expect(text).not.toContain('Not analyzed');
        } finally {
            await fs.rm(clean, { recursive: true, force: true });
        }
    });
});