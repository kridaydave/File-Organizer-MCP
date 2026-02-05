#!/usr/bin/env node
/**
 * Documentation Generator Script
 * Generates API.md from tool definitions
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TOOLS_DIR = path.join(__dirname, '../src/tools');
const OUTPUT_FILE = path.join(__dirname, '../API.md');

async function generateDocs() {
    console.log('🔍 Scanning tools directory...');

    const files = await fs.readdir(TOOLS_DIR);
    const toolFiles = files.filter(f => f.endsWith('.ts') && f !== 'index.ts');

    let markdown = '# <a id="top"></a>File Organizer MCP - API Reference\n\n';
    markdown += '> Auto-generated from tool definitions\n\n';
    markdown += '**Version:** 3.0.0  \n';
    markdown += `**Generated:** ${new Date().toISOString()}\n\n`;
    markdown += '[⬆ Back to Top](#top)\n\n';
    markdown += '---\n\n';
    markdown += '## Table of Contents\n\n';

    const tools = [];

    for (const file of toolFiles) {
        const content = await fs.readFile(path.join(TOOLS_DIR, file), 'utf-8');
        const fileTools = extractToolsInfo(content, file);
        tools.push(...fileTools);
    }

    // Sort tools alphabetically
    tools.sort((a, b) => a.name.localeCompare(b.name));

    for (const tool of tools) {
        markdown += `- [${tool.name}](#${tool.name})\n`;
    }

    markdown += '\n---\n\n';

    const toolSections = tools.map(generateToolSection);
    markdown += toolSections.join('\n---\n\n');


    await fs.writeFile(OUTPUT_FILE, markdown);
    console.log(`✅ Documentation generated: ${OUTPUT_FILE}`);
}

function extractToolsInfo(content, filename) {
    const tools = [];
    const toolDefRegex = /export const (\w+)ToolDefinition: ToolDefinition =/g;

    let match;
    while ((match = toolDefRegex.exec(content)) !== null) {
        const startIdx = match.index;
        const body = extractObject(content, startIdx + match[0].length);

        if (body) {
            const nameMatch = body.match(/name:\s*['"`]([^'"`]+)['"`]/);
            const descMatch = body.match(/description:\s*['"`]([^'"`]+)['"`]/);

            // Extract properties object manually finding "properties:"
            const propsIdx = body.indexOf('properties:');
            let parameters = [];

            if (propsIdx !== -1) {
                // Find where the properties object starts
                // It should be the first { after "properties:"
                let braceStart = -1;
                for (let i = propsIdx + 11; i < body.length; i++) {
                    if (body[i] === '{') {
                        braceStart = i;
                        break;
                    }
                }

                if (braceStart !== -1) {
                    const propsBlock = extractObject(body, braceStart);
                    if (propsBlock) {
                        parameters = parseParameters(propsBlock);
                    }
                }
            }

            if (nameMatch) {
                tools.push({
                    name: nameMatch[1],
                    description: descMatch ? descMatch[1] : 'No description available',
                    filename,
                    parameters
                });
            }
        }
    }

    return tools;
}

function extractObject(str, startIndex) {
    let braceCount = 0;
    let started = false;
    let endIndex = -1;
    let firstBraceFound = false;

    // Find first brace if not at startIndex
    for (let i = startIndex; i < str.length; i++) {
        if (!firstBraceFound) {
            if (str[i] === '{') {
                firstBraceFound = true;
                braceCount++;
                started = true;
            }
            continue;
        }

        if (str[i] === '{') {
            braceCount++;
        } else if (str[i] === '}') {
            braceCount--;
        }

        if (started && braceCount === 0) {
            endIndex = i + 1;
            break;
        }
    }

    if (endIndex !== -1) {
        return str.substring(startIndex, endIndex); // rough substring
    }
    return null;
}

function parseParameters(propertiesStr) {
    const params = [];
    // Remove outer braces
    const cleanStr = propertiesStr.trim().replace(/^{/, '').replace(/}$/, '');

    // Simple regex for top-level keys: key: { ... }
    const keyRegex = /([a-zA-Z0-9_]+)\s*:\s*{/g;
    let match;

    while ((match = keyRegex.exec(cleanStr)) !== null) {
        const key = match[1];
        // We can't rely on regex index for full object extraction easily on the original string due to cleanup
        // But let's try to extract from the point of match in cleanStr

        const start = match.index + match[0].length - 1; // pointing to {
        const objStr = extractObject(cleanStr, start);

        if (objStr) {
            const typeMatch = objStr.match(/type:\s*['"`]([^'"`]+)['"`]/);
            const descMatch = objStr.match(/description:\s*['"`]([^'"`]+)['"`]/);
            const defaultMatch = objStr.match(/default:\s*([^,}]+)/);

            params.push({
                name: key,
                type: typeMatch ? typeMatch[1] : 'unknown',
                description: descMatch ? descMatch[1] : '-',
                default: defaultMatch ? defaultMatch[1].trim() : undefined
            });
        }
    }

    return params;
}

function generateToolSection(tool) {
    let section = `## ${tool.name}\n`;
    section += '[⬆ Back to Top](#top)\n\n';
    section += `**Description:** ${tool.description}\n\n`;

    if (tool.parameters.length > 0) {
        section += '### Parameters\n\n';
        section += '| Parameter | Type | Description | Default |\n';
        section += '|-----------|------|-------------|---------|\n';

        for (const param of tool.parameters) {
            section += `| \`${param.name}\` | ${param.type} | ${param.description} | ${param.default || '-'} |\n`;
        }
        section += '\n';
    }

    section += '### Example\n\n';
    section += '```typescript\n';
    section += `${tool.name}({\n`;
    if (tool.parameters.length > 0) {
        tool.parameters.forEach(p => {
            section += `  ${p.name}: ${getDefaultValueExample(p.type)},\n`;
        });
    } else {
        section += '  // No parameters needed\n';
    }
    section += '});\n';
    section += '```\n';

    return section;
}

function getDefaultValueExample(type) {
    switch (type) {
        case 'string': return '"value"';
        case 'boolean': return 'true';
        case 'number': return '123';
        case 'array': return '[]';
        default: return 'value';
    }
}

generateDocs().catch(console.error);
