/**
 * File Organizer MCP Server v5.0.0
 * Services Module Exports
 */

export * from "./path-validator.service.js";
export * from "../core/scan/scanner.js";
export * from "../core/hash/hasher.js";
export * from "./categorizer.service.js";
export * from "../core/organize/organizer.js";
export * from "../core/hash/duplicate-finder.js";
export * from "../core/organize/rename.js";
export * from "./system-organize.service.js";

// Metadata Services
export type {
  AudioMetadata,
  AudioMetadataOptions,
} from "./metadata/types.js";
export { AudioMetadataService } from "./metadata/audio.js";
export type {
  ImageMetadata,
  ImageMetadataOptions,
} from "./metadata/types.js";
export { ImageMetadataService } from "./metadata/image.js";
export * from "./metadata/service.js";

// Organizer Services (Phase 2.3)
export {
  MusicOrganizerService,
  type MusicOrganizationConfig,
  type MusicOrganizationResult,
} from "./music-organizer.service.js";
export {
  PhotoOrganizerService,
  type PhotoOrganizationConfig,
  type PhotoOrganizationResult,
} from "./photo-organizer.service.js";

import { CategorizerService } from "./categorizer.service.js";
import { OrganizerService } from "../core/organize/organizer.js";

export { CategorizerService };
export { OrganizerService };

// Additional Services

export {
  SmartSuggestService,
  type DirectoryHealthReport,
  type SmartSuggestOptions,
} from "./smart-suggest.service.js";

export {
  HistoryLoggerService,
  historyLogger,
  type HistoryEntry,
  type HistoryQuery,
  type HistoryResult,
} from "./history-logger.service.js";
