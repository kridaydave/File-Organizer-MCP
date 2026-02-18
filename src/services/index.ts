/**
 * File Organizer MCP Server v3.4.0
 * Services Module Exports
 */

export * from "./manifest-integrity.service.js";
export * from "./path-validator.service.js";
export * from "./file-scanner.service.js";
export * from "./hash-calculator.service.js";
export * from "./categorizer.service.js";
export * from "./organizer.service.js";
export * from "./duplicate-finder.service.js";
export * from "./renaming.service.js";
export * from "./scheduler-state.service.js";
export * from "./metadata-cache.service.js";
export * from "./system-organize.service.js";

// Content Analysis Services (Phase 2.1)
export * from "./content-analyzer.service.js";
export * from "./content-screening.service.js";
export * from "./topic-extractor.service.js";

// Metadata Services (Phase 2.2)
export {
  AudioMetadataService,
  type AudioMetadataOptions,
} from "./audio-metadata.service.js";
export {
  ImageMetadataService,
  type ImageMetadataOptions,
} from "./image-metadata.service.js";
export * from "./metadata.service.js";

export {
  TextExtractionService,
  textExtractionService,
  type TextExtractionOptions,
  type TextExtractionResult,
} from "./text-extraction.service.js";

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
import { OrganizerService } from "./organizer.service.js";
import { ContentAnalyzerService } from "./content-analyzer.service.js";
import { MetadataCacheService } from "./metadata-cache.service.js";

// Global Instances for Session State
export const globalMetadataCache = new MetadataCacheService();
export const globalContentAnalyzer = new ContentAnalyzerService();
export const globalCategorizerService = new CategorizerService(
  globalContentAnalyzer,
  globalMetadataCache,
);
export const globalOrganizerService = new OrganizerService(
  globalCategorizerService,
);
