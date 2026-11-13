import fs from 'fs/promises';
import path from 'path';
import { handleBatchReadFiles } from '../../../src/tools/batch-file-reader.js';
import { jest } from '@jest/globals';

describe('Batch File Reader (BUG-71)', () => {
    let testDir: string;
    let baseTempDir: string;

    beforeEach(async () => {
        baseTempDir = path.join(process.cwd(), 'tests', 'temp');
        await fs.mkdir(baseTempDir, { recursive: true });
        testDir = await fs.mkdtemp(path.join(baseTempDir, 'test-batch-'));
    });

    afterEach(async () => {
        try {
            await new Promise(resolve => setTimeout(resolve, 100));
            await fs.rm(testDir, { recursive: true, force: true });
        } catch (error) {
            console.error('Cleanup error:', error);
        }
    });

    it('should not decode PDF as UTF-8 text garbage', async () => {
        const pdfPath = path.join(testDir, 'document.pdf');
        // Create a fake PDF with binary content
        await fs.writeFile(pdfPath, Buffer.from('%PDF-1.4\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF'));

        const result = await handleBatchReadFiles({
            directory: testDir,
            include_content: true,
            response_format: 'json'
        });

        expect(result.isError).toBeUndefined();
        const data = JSON.parse(result.content[0].text);
        expect(data.files).toHaveLength(1);
        const file = data.files[0];
        expect(file.extension.toLowerCase()).toBe('.pdf');
        expect(file.contentType).not.toBe('text');
        expect(file.content).toBeUndefined();
    });

    it('should not decode DOCX as UTF-8 text garbage', async () => {
        const docxPath = path.join(testDir, 'document.docx');
        // DOCX is a ZIP file (binary)
        await fs.writeFile(docxPath, Buffer.from([0x50, 0x4B, 0x03, 0x04, 0x14, 0x00]));

        const result = await handleBatchReadFiles({
            directory: testDir,
            include_content: true,
            response_format: 'json'
        });

        expect(result.isError).toBeUndefined();
        const data = JSON.parse(result.content[0].text);
        expect(data.files).toHaveLength(1);
        const file = data.files[0];
        expect(file.extension.toLowerCase()).toBe('.docx');
        expect(file.contentType).not.toBe('text');
        expect(file.content).toBeUndefined();
    });

    it('should not decode DOC as UTF-8 text garbage', async () => {
        const docPath = path.join(testDir, 'document.doc');
        // Old DOC format (binary)
        await fs.writeFile(docPath, Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA5, 0xB5]));

        const result = await handleBatchReadFiles({
            directory: testDir,
            include_content: true,
            response_format: 'json'
        });

        expect(result.isError).toBeUndefined();
        const data = JSON.parse(result.content[0].text);
        expect(data.files).toHaveLength(1);
        const file = data.files[0];
        expect(file.extension.toLowerCase()).toBe('.doc');
        expect(file.contentType).not.toBe('text');
        expect(file.content).toBeUndefined();
    });
});
