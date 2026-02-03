/**
 * File Organizer MCP Server v3.0.0
 * TypeScript Type Definitions
 */

// ==================== Configuration Types ====================

export interface ServerConfig {
    readonly MAX_FILE_SIZE: number;
    readonly MAX_FILES: number;
    readonly MAX_DEPTH: number;
    readonly VERSION: string;
}

// ==================== File System Types ====================

export interface FileInfo {
    name: string;
    path: string;
    size: number;
    extension: string;
    created: Date;
    modified: Date;
}

export interface BasicFileInfo {
    name: string;
    path: string;
}

export interface FileWithSize {
    name: string;
    path: string;
    size: number;
    modified?: Date;
}

// ==================== Scan Types ====================

export interface ScanOptions {
    includeSubdirs?: boolean;
    maxDepth?: number;
}

export interface PaginatedResult<T> {
    items: T[];
    total_count: number;
    returned_count: number;
    offset: number;
    has_more: boolean;
    next_offset?: number;
}

export interface ScanResult extends PaginatedResult<FileInfo> {
    directory: string;
    total_size: number;
    total_size_readable: string;
}

export interface CustomRule {
    category: string;
    extensions?: string[];
    filenamePattern?: string;
    priority: number;
}

export interface CategoryDefinition {
    name: string;
    extensions: string[];
}

export interface FileOrganizerConfig {
    security: {
        maxFileSize: number;
        maxFiles: number;
        maxDepth: number;
        allowedRoots?: string[];
    };
    performance: {
        hashingBatchSize: number;
        scanBatchSize: number;
        enableCaching: boolean;
        cacheMaxAge: number;
    };
    organization: {
        defaultCategories: CategoryDefinition[];
        customRules: CustomRule[];
        conflictResolution: 'rename' | 'skip' | 'error';
    };
    output: {
        defaultFormat: 'json' | 'markdown';
        includeHiddenFiles: boolean;
        dateFormat: string;
    };
}

export interface ListResult extends PaginatedResult<BasicFileInfo> {
    directory: string;
}

// ==================== Category Types ====================

export type CategoryName =
    | 'Executables'
    | 'Videos'
    | 'Documents'
    | 'Presentations'
    | 'Spreadsheets'
    | 'Images'
    | 'Audio'
    | 'Archives'
    | 'Code'
    | 'Installers'
    | 'Ebooks'
    | 'Fonts'
    | 'Others';

export interface CategoryStats {
    count: number;
    total_size: number;
    total_size_readable?: string;
    files: string[];
}

export interface CategorizedResult {
    directory: string;
    categories: Partial<Record<CategoryName, CategoryStats>>;
}

// ==================== Duplicate Types ====================

export interface DuplicateFile {
    name: string;
    path: string;
    size: number;
    modified?: Date;
}

export interface DuplicateGroup {
    hash: string;
    count: number;
    size: string;
    size_bytes: number;
    files: DuplicateFile[];
}

export interface OrganizationPlan {
    moves: {
        source: string;
        destination: string;
        category: string;
        hasConflict: boolean;
        conflictResolution?: 'rename' | 'skip' | 'overwrite' | 'overwrite_if_newer';
    }[];
    categoryCounts: Record<string, number>;
    conflicts: any[];
    skippedFiles: { path: string; reason: string }[];
    estimatedDuration: number;
    warnings: string[];
}

export interface DuplicateResult extends PaginatedResult<DuplicateGroup> {
    directory: string;
    duplicate_groups: number;
    total_duplicate_files: number;
    wasted_space: string;
}

// ==================== Organize Types ====================

export interface OrganizeAction {
    file: string;
    from: string;
    to: string;
    category: CategoryName;
}

export interface OrganizeResult {
    directory: string;
    dry_run: boolean;
    total_files: number;
    statistics: Record<string, number>;
    actions: OrganizeAction[];
    errors: string[];
}

// ==================== Analysis Types ====================

export interface LargestFileInfo {
    name: string;
    path: string;
    size: number;
    size_readable: string;
}

export interface LargestFilesResult {
    directory: string;
    largest_files: LargestFileInfo[];
}

// ==================== Rollback Types ====================

export interface RollbackAction {
    type: 'move' | 'copy' | 'delete';
    originalPath: string;
    currentPath?: string; // For moves/copies
    backupPath?: string; // For deletions (where the file is temporarily stored)
    overwrittenBackupPath?: string; // If a move overwrote a file, this is where the ORIGINAL file is stored
    timestamp: number;
}

export interface RollbackManifest {
    id: string; // UUID or timestamp
    timestamp: number;
    description: string;
    actions: RollbackAction[];
}

// ==================== Tool Types ====================

export interface ToolResponse {
    content: Array<{
        type: 'text';
        text: string;
    }>;
    [key: string]: unknown;
}

export interface ToolDefinition {
    name: string;
    description: string;
    inputSchema: {
        type: 'object';
        properties: Record<string, unknown>;
        required: string[];
    };
    annotations?: {
        readOnlyHint?: boolean;
        destructiveHint?: boolean;
        idempotentHint?: boolean;
        openWorldHint?: boolean;
    };
    title?: string;
}

// ==================== Error Types ====================

export interface ValidationErrorDetails {
    field?: string;
    value?: unknown;
    constraint?: string;
}

export class AccessDeniedError extends Error {
    readonly code = 'EACCES';
    constructor(
        public readonly requestedPath: string,
        reason = 'Path is outside allowed directory'
    ) {
        super(`Access denied: ${reason}`);
        this.name = 'AccessDeniedError';
    }
}

export class ValidationError extends Error {
    constructor(
        message: string,
        public readonly details: ValidationErrorDetails = {}
    ) {
        super(message);
        this.name = 'ValidationError';
    }
}
