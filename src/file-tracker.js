// src/file-tracker.js
const chokidar = require('chokidar');
const path = require('path');
const fs = require('fs/promises');

class FileTracker {
  constructor() {
    this.configPath = path.join(process.cwd(), 'config.json');
    this.watchers = new Map();
    this.pendingFiles = new Set();
    this.debounceTimeout = null;
  }

  async init() {
    await this.loadConfig();
    this.watchConfig();
    this.setupWatchers();
  }

  async loadConfig() {
    try {
      const data = await fs.readFile(this.configPath, 'utf8');
      const rawConfig = JSON.parse(data);

      // Validate config structure
      if (!rawConfig.rules || rawConfig.rules.length === 0) {
        throw new Error('No organization rules defined in config');
      }

      if (
        rawConfig.debounceTime &&
        (rawConfig.debounceTime < 100 || rawConfig.debounceTime > 10000)
      ) {
        console.warn('Invalid debounceTime, using default 1000ms');
        rawConfig.debounceTime = 1000;
      }

      this.config = {
        debounceTime: 1000,
        ...rawConfig,
      };
    } catch (error) {
      console.error('Config load error:', error);
      throw new Error('Invalid configuration - please check config.json');
    }
  }
}

module.exports = FileTracker;
