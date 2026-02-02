/**
 * Status Reporter for File Organizer MCP v3.0
 * Provides system status information and recommendations
 */

import { loadConfig } from '../config/config.loader.js';
import { getAllowedDirectoriesDetailed } from '../managers/directory-manager.js';

/**
 * Get mode display info
 * @param {string} mode - Security mode
 * @returns {Object} Mode display information
 */
function getModeInfo(mode) {
    const modes = {
        strict: {
            name: 'STRICT',
            emoji: '🟢',
            description: 'CWD-only access (safest)',
            riskLevel: 'Low'
        },
        sandboxed: {
            name: 'SANDBOXED',
            emoji: '🟡',
            description: 'Allow-list based access (recommended)',
            riskLevel: 'Medium'
        },
        unrestricted: {
            name: 'UNRESTRICTED',
            emoji: '🔴',
            description: 'Full filesystem access (advanced)',
            riskLevel: 'High'
        }
    };

    return modes[mode] || modes.strict;
}

/**
 * Get complete security status
 * @returns {Promise<Object>} Security status object
 */
export async function getSecurityStatus() {
    const config = await loadConfig();
    const modeInfo = getModeInfo(config.security.mode);

    const status = {
        mode: config.security.mode,
        modeDisplay: `${modeInfo.emoji} ${modeInfo.name}`,
        modeDescription: modeInfo.description,
        riskLevel: modeInfo.riskLevel,
        cwd: process.cwd(),
        limits: {
            maxFileSize: formatBytes(config.limits.max_file_size),
            maxFilesPerOperation: config.limits.max_files_per_operation,
            maxDirectoryDepth: config.limits.max_directory_depth
        },
        logging: {
            auditEnabled: config.logging.audit_enabled,
            logLevel: config.logging.log_level
        },
        warnings: [],
        recommendations: []
    };

    // Add mode-specific info
    if (config.security.mode === 'sandboxed') {
        const directories = await getAllowedDirectoriesDetailed();
        status.allowedDirectories = directories.map(d => ({
            path: d.original,
            resolved: d.normalized,
            exists: d.exists,
            status: d.exists ? '✅' : '⚠️ Not found'
        }));

        // Warning if no directories configured
        if (directories.length === 0) {
            status.warnings.push('No directories configured for SANDBOXED mode. Add directories to enable file operations.');
        }

        // Warning for missing directories
        const missing = directories.filter(d => !d.exists);
        if (missing.length > 0) {
            status.warnings.push(`${missing.length} configured directories do not exist.`);
        }
    }

    if (config.security.mode === 'strict') {
        status.recommendations.push('Consider switching to SANDBOXED mode for more flexibility with multiple directories.');
    }

    if (config.security.mode === 'unrestricted') {
        status.warnings.push('⚠️ RUNNING IN UNRESTRICTED MODE - Full filesystem access enabled');
        status.warnings.push('Audit logging is mandatory in this mode');
        if (!config.security.blacklist_system_paths) {
            status.warnings.push('⚠️ System path blacklist is DISABLED - critical system files are accessible');
        }
    }

    return status;
}

/**
 * Format status as text report
 * @returns {Promise<string>} Formatted status report
 */
export async function getStatusReport() {
    const status = await getSecurityStatus();

    let report = `═══════════════════════════════════════════════════════
  FILE ORGANIZER MCP - SECURITY STATUS
═══════════════════════════════════════════════════════

📍 Security Mode: ${status.modeDisplay}
   ${status.modeDescription}
   Risk Level: ${status.riskLevel}

📂 Working Directory: ${status.cwd}

⚙️  Limits:
   • Max file size: ${status.limits.maxFileSize}
   • Max files per operation: ${status.limits.maxFilesPerOperation}
   • Max directory depth: ${status.limits.maxDirectoryDepth}

📝 Logging:
   • Audit: ${status.logging.auditEnabled ? 'Enabled' : 'Disabled'}
   • Level: ${status.logging.logLevel}
`;

    if (status.allowedDirectories && status.allowedDirectories.length > 0) {
        report += `
📁 Allowed Directories:
`;
        for (const dir of status.allowedDirectories) {
            report += `   ${dir.status} ${dir.path}\n`;
            if (dir.resolved && dir.resolved !== dir.path) {
                report += `      → ${dir.resolved}\n`;
            }
        }
    }

    if (status.warnings.length > 0) {
        report += `
⚠️  Warnings:
`;
        for (const warning of status.warnings) {
            report += `   • ${warning}\n`;
        }
    }

    if (status.recommendations.length > 0) {
        report += `
💡 Recommendations:
`;
        for (const rec of status.recommendations) {
            report += `   • ${rec}\n`;
        }
    }

    report += `
═══════════════════════════════════════════════════════
Learn more: https://github.com/kridaydave/File-Organizer-MCP#security-modes
═══════════════════════════════════════════════════════`;

    return report;
}

/**
 * Format bytes to human readable string
 * @param {number} bytes - Bytes to format
 * @returns {string} Formatted string
 */
function formatBytes(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let unitIndex = 0;
    let value = bytes;

    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex++;
    }

    return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unitIndex]}`;
}

export default {
    getSecurityStatus,
    getStatusReport,
    getModeInfo: getModeInfo
};
