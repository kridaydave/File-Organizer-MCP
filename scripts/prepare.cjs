#!/usr/bin/env node
/**
 * Prepare script - runs automatically on npm install and npm publish
 * Handles build gracefully to avoid install failures
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DIST_FILE = path.join(__dirname, '..', 'dist', 'src', 'index.js');

// Check if dist already exists and is valid
function distExists() {
  try {
    return fs.existsSync(DIST_FILE);
  } catch {
    return false;
  }
}

// Check if we're in a development environment (have devDependencies)
function isDevEnvironment() {
  try {
    // If typescript is installed, we can build
    const nodeModulesPath = path.join(__dirname, '..', 'node_modules', 'typescript');
    return fs.existsSync(nodeModulesPath);
  } catch {
    return false;
  }
}

// Main logic
function main() {
  // Skip if dist already exists (pre-built package)
  if (distExists()) {
    console.error('✓ dist/ already exists, skipping build');
    process.exit(0);
  }

  // Check if we can build (TypeScript installed)
  if (!isDevEnvironment()) {
    console.error('ℹ TypeScript not available, skipping build');
    console.error('  To build manually, run: npm install && npm run build');
    process.exit(0);
  }

  // Try to build
  console.error('🔨 Building project...');
  try {
    execSync('npm run build', { 
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });
    console.error('✓ Build successful');
    process.exit(0);
  } catch (error) {
    console.error('✗ Build failed');
    // Don't fail install if build fails - user can build manually later
    console.error('  You can build manually later with: npm run build');
    process.exit(0);
  }
}

main();
