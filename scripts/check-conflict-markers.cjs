#!/usr/bin/env node
// Block conflict markers and em-dashes from being introduced in staged changes.
const { execSync } = require('child_process');

let diff = '';
try {
  diff = execSync('git diff --cached --unified=0 --no-color', { encoding: 'utf8' });
} catch {
  process.exit(0);
}

// Parse the unified diff and inspect only added lines.
const markerRe = /^(<<<<<<<|\|\|\|\|\|\|\||=======|>>>>>>>)/;
const emDash = '\u2014';
let bad = false;
let currentFile = '';
for (const line of diff.split('\n')) {
  const fileMatch = line.match(/^\+\+\+ b\/(.+)$/);
  if (fileMatch) {
    currentFile = fileMatch[1];
    continue;
  }
  if (!/\.(ts|md|json|js|cjs|mjs)$/.test(currentFile)) continue;
  if (!line.startsWith('+') || line.startsWith('+++')) continue;
  const added = line.slice(1);
  if (markerRe.test(added)) {
    console.error(`Conflict marker introduced in ${currentFile}: ${added}`);
    bad = true;
  }
  if (added.includes(emDash)) {
    console.error(`Em-dash introduced in ${currentFile}`);
    bad = true;
  }
}
if (bad) process.exit(1);
console.log('No conflict markers or em-dashes introduced in staged changes.');


