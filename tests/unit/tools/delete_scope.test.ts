import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import { handleDeleteDuplicates } from '../../../src/tools/duplicate-management.js';

const tempRoot = (): string => path.join(process.cwd(), 'tests', 'temp');

/** `ToolResponse.content[0]` is optional under noUncheckedIndexedAccess. */
function textOf(result: { content: { text: string }[] }): string {
  const first = result.content[0];
  if (!first) throw new Error('expected the tool to return content');
  return first.text;
}


async function write(base: string, rel: string, content: string): Promise<string> {
    const p = path.join(base, rel);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, content);
    return p;
}

/**
 * The tool description tells a caller where a surviving copy is searched for,
 * and that text is a contract: it decides whether the caller passes
 * `candidate_directories`. These tests pin the actual behaviour so the two
 * cannot drift apart.
 */
describe('delete_duplicates verification scope', () => {
    let base: string;

    beforeEach(async () => {
        await fs.mkdir(tempRoot(), { recursive: true });
        base = await fs.mkdtemp(path.join(tempRoot(), 'scope-'));
    });

    afterEach(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        await fs.rm(base, { recursive: true, force: true });
    });

    /**
     * Candidate lives at <root>/a/b/dup.txt, so the parent is a/b and the
     * grandparent is a. Returns whether the delete went through.
     */
    async function deleteWithCopyAt(
        rootName: string,
        copyRel: string,
        options: Record<string, unknown> = {},
    ): Promise<{ deleted: number; refused: number; copySurvived: boolean }> {
        const root = path.join(base, rootName);
        const candidate = await write(root, 'a/b/dup.txt', 'identical-content');
        const copy = await write(root, copyRel, 'identical-content');

        const result = await handleDeleteDuplicates({
            files_to_delete: [candidate],
            create_backup_manifest: false,
            verify_before_delete: true,
            response_format: 'json',
            ...options,
        });
        const out = result.structuredContent as {
            deleted_count: number;
            failed_count: number;
        };

        let copySurvived = true;
        try {
            await fs.access(copy);
        } catch {
            copySurvived = false;
        }
        return {
            deleted: out.deleted_count,
            refused: out.failed_count,
            copySurvived,
        };
    }

    it('finds a surviving copy in a subfolder of the parent, because the scan is recursive', async () => {
        const r = await deleteWithCopyAt('nested', 'a/b/nested/deeper/keep.txt');

        expect(r.deleted).toBe(1);
        expect(r.refused).toBe(0);
        expect(r.copySurvived).toBe(true);
    });

    it('finds a surviving copy in a sibling of the parent, inside the grandparent', async () => {
        const r = await deleteWithCopyAt('sibling', 'a/other/keep.txt');

        expect(r.deleted).toBe(1);
        expect(r.refused).toBe(0);
    });

    it('refuses the delete when the only copy is outside the grandparent', async () => {
        const r = await deleteWithCopyAt('outside', '../outside-copy/keep.txt');

        expect(r.deleted).toBe(0);
        expect(r.refused).toBe(1);
        expect(r.copySurvived).toBe(true);
    });

    it('searches candidate_directories, which is the documented way to widen the scope', async () => {
        const root = path.join(base, 'viaopt');
        const candidate = await write(root, 'a/b/dup.txt', 'identical-content');
        const elsewhere = await write(base, 'declared-root/keep.txt', 'identical-content');

        const result = await handleDeleteDuplicates({
            files_to_delete: [candidate],
            create_backup_manifest: false,
            verify_before_delete: true,
            candidate_directories: [path.join(base, 'declared-root')],
            response_format: 'json',
        });
        const out = result.structuredContent as { deleted_count: number };

        expect(out.deleted_count).toBe(1);
        await expect(fs.access(elsewhere)).resolves.not.toThrow();
    });

    it('deletes without verification when the caller opts out', async () => {
        const root = path.join(base, 'unverified');
        const candidate = await write(root, 'a/b/dup.txt', 'identical-content');

        const result = await handleDeleteDuplicates({
            files_to_delete: [candidate],
            create_backup_manifest: false,
            verify_before_delete: false,
            response_format: 'json',
        });
        const out = result.structuredContent as { deleted_count: number };

        expect(out.deleted_count).toBe(1);
        await expect(fs.access(candidate)).rejects.toThrow();
    });
});