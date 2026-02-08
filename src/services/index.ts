/**
 * File Organizer MCP Server v3.1.4
 * Services Module Exports
 */

export * from './path-validator.service.js';
export * from './file-scanner.service.js';
export * from './hash-calculator.service.js';
export * from './categorizer.service.js';
export * from './organizer.service.js';
export * from './duplicate-finder.service.js';
export * from './renaming.service.js';
export * from './scheduler-state.service.js';

import { CategorizerService } from './categorizer.service.js';
import { OrganizerService } from './organizer.service.js';

// Global Instances for Session State
export const globalCategorizerService = new CategorizerService();
export const globalOrganizerService = new OrganizerService(globalCategorizerService);
