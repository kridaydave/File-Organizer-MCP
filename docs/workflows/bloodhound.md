# Bloodhound Workflows

This document describes workflows for the Bloodhound agent (backup, versioning, and restore operations).

---

## Overview

Bloodhound provides safe file operations through automatic backup, versioning, and restore capabilities.

---

## Workflow 1: Safe File Operations

Automatic backup before destructive operations.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Safe File Operations Workflow                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────┐    ┌──────────────┐    ┌──────────┐    ┌────────────────┐  │
│  │  Kane     │───▶│  Bloodhound   │───▶│  Kane     │───▶│  Bloodhound    │  │
│  │ Request   │    │  Create       │    │ Execute  │    │  Cleanup/      │  │
│  │ Operation │    │  Backup       │    │ Operation│    │  Restore       │  │
│  └──────────┘    └──────────────┘    └──────────┘    └────────────────┘  │
│                        │                    │                    │          │
│                        │                    │                    │          │
│                        ▼                    ▼                    ▼          │
│                 ┌──────────────┐    ┌──────────┐    ┌────────────────┐  │
│                 │  Manifest  Success │     │    │    │  On Success:   │  │
│                 │  Stored       │    │  ?       │───▶│  Delete Backup │  │
│                 └──────────────┘    └──────────┘    │  On Failure:   │  │
│                                                     │  Restore       │  │
│                                                     └────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### TypeScript Implementation

```typescript
import { BloodhoundAgent } from "./bloodhound.js";

interface OperationContext {
  operationId: string;
  targetPath: string;
  operation: "move" | "rename" | "delete" | "organize";
  options?: Record<string, unknown>;
}

interface OperationResult {
  success: boolean;
  backupManifestId?: string;
  restoredFiles?: string[];
  error?: string;
}

class SafeOperationWorkflow {
  private bloodhound: BloodhoundAgent;

  constructor(bloodhound: BloodhoundAgent) {
    this.bloodhound = bloodhound;
  }

  async executeSafeOperation(
    context: OperationContext,
    operation: () => Promise<void>,
  ): Promise<OperationResult> {
    // Step 1: Create backup before operation
    const backupManifest = await this.bloodhound.createBackup({
      source: context.targetPath,
      destination: this.getBackupPath(context.operationId),
      retentionDays: 7,
      verifyIntegrity: true,
      compression: "gzip",
    });

    try {
      // Step 2: Execute the operation
      await operation();

      // Step 3: Cleanup backup on success
      await this.bloodhound.cleanupBackup(backupManifest.id);

      return {
        success: true,
        backupManifestId: backupManifest.id,
      };
    } catch (error) {
      // Step 4: Restore on failure
      await this.bloodhound.restore(backupManifest.id, context.targetPath);

      return {
        success: false,
        backupManifestId: backupManifest.id,
        restoredFiles: await this.getRestoredFiles(context.targetPath),
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  private getBackupPath(operationId: string): string {
    return `.backups/${operationId}-${Date.now()}`;
  }

  private async getRestoredFiles(path: string): Promise<string[]> {
    // Return list of restored files
    return [];
  }
}
```

---

## Workflow 2: Version History Management

Track and manage file versions over time.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Version History Management Workflow                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐        │
│  │  File Modified  │───▶│  Bloodhound      │───▶│  Version        │        │
│  │                 │    │  Capture Version │    │  Stored         │        │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘        │
│                                 │                                             │
│                                 ▼                                             │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐        │
│  │  User Requests  │───▶│  List Versions  │───▶│  Select Version  │        │
│  │  Restore        │    │                 │    │                 │        │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘        │
│                                                              │            │
│                                                              ▼            │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐        │
│  │  Verify         │───▶│  Restore         │───▶│  Operation      │        │
│  │  Integrity      │    │  Version         │    │  Complete       │        │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### TypeScript Implementation

```typescript
interface VersionEntry {
  id: string;
  timestamp: Date;
  checksum: string;
  size: number;
  operation: string;
}

interface RestoreOptions {
  targetPath?: string;
  conflictStrategy?: "rename" | "overwrite" | "skip";
}

class VersionHistoryWorkflow {
  private bloodhound: BloodhoundAgent;

  constructor(bloodhound: BloodhoundAgent) {
    this.bloodhound = bloodhound;
  }

  async captureVersion(
    filePath: string,
    operation: string,
  ): Promise<VersionEntry> {
    const checksum = await this.calculateChecksum(filePath);
    const stats = await this.getFileStats(filePath);

    const entry = await this.bloodhound.recordVersion({
      filePath,
      checksum,
      size: stats.size,
      operation,
      timestamp: new Date(),
    });

    return entry;
  }

  async listVersions(filePath: string): Promise<VersionEntry[]> {
    return this.bloodhound.getVersionHistory(filePath);
  }

  async restoreToVersion(
    filePath: string,
    versionId: string,
    options?: RestoreOptions,
  ): Promise<RestoreResult> {
    // Verify integrity before restore
    const integrity = await this.bloodhound.verifyVersionIntegrity(versionId);
    if (!integrity.valid) {
      throw new Error(`Version integrity check failed: ${integrity.reason}`);
    }

    return this.bloodhound.restoreVersion(
      versionId,
      options?.targetPath || filePath,
    );
  }

  async cleanupOldVersions(
    filePath: string,
    keepCount: number,
  ): Promise<CleanupResult> {
    const versions = await this.listVersions(filePath);
    const toDelete = versions.slice(0, versions.length - keepCount);

    let deletedBytes = 0;
    for (const version of toDelete) {
      await this.bloodhound.deleteVersion(version.id);
      deletedBytes += version.size;
    }

    return {
      deleted: toDelete.length,
      freedBytes: deletedBytes,
    };
  }
}
```

---

## Workflow 3: Scheduled Backup

Automated backup with retention policies.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Scheduled Backup Workflow                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐        │
│  │  Scheduler      │───▶│  Find Targets   │───▶│  Create Backups │        │
│  │  Trigger        │    │                 │    │  for All Targets│        │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘        │
│                                                              │            │
│                                                              ▼            │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐        │
│  │  Verify          │───▶│  Apply           │───▶│  Send            │        │
│  │  Integrity       │    │  Retention       │    │  Notification   │        │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### TypeScript Implementation

```typescript
interface BackupTarget {
  path: string;
  label: string;
  retentionDays: number;
  compression: "none" | "gzip" | "lz4";
  excludePatterns?: string[];
}

interface ScheduledBackupConfig {
  targets: BackupTarget[];
  schedule: string; // cron expression
  notificationEnabled: boolean;
  integrityCheck: boolean;
}

class ScheduledBackupWorkflow {
  private bloodhound: BloodhoundAgent;
  private config: ScheduledBackupConfig;

  constructor(bloodhound: BloodhoundAgent, config: ScheduledBackupConfig) {
    this.bloodhound = bloodhound;
    this.config = config;
  }

  async executeScheduledBackup(): Promise<BackupReport> {
    const results: BackupTargetResult[] = [];
    let totalBytes = 0;
    let totalDuration = 0;

    for (const target of this.config.targets) {
      const startTime = Date.now();

      try {
        const manifest = await this.bloodhound.createBackup({
          source: target.path,
          destination: this.getBackupDestination(target),
          retentionDays: target.retentionDays,
          compression: target.compression,
          excludePatterns: target.excludePatterns,
          verifyIntegrity: this.config.integrityCheck,
        });

        const duration = Date.now() - startTime;
        totalDuration += duration;

        // Verify integrity
        let integrity: IntegrityResult | null = null;
        if (this.config.integrityCheck) {
          integrity = await this.bloodhound.verifyIntegrity(manifest.id);
        }

        results.push({
          target: target.label,
          success: true,
          manifestId: manifest.id,
          filesBackedUp: manifest.fileCount,
          bytesBackedUp: manifest.totalSize,
          duration,
          integrity: integrity ? { passed: integrity.valid } : null,
        });

        totalBytes += manifest.totalSize;
      } catch (error) {
        results.push({
          target: target.label,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
          duration: Date.now() - startTime,
        });
      }
    }

    // Apply retention policies
    await this.enforceRetention();

    // Send notification
    if (this.config.notificationEnabled) {
      await this.sendNotification(results, totalBytes, totalDuration);
    }

    return {
      timestamp: new Date(),
      targets: results,
      totalBytes,
      totalDuration,
      success: results.every((r) => r.success),
    };
  }

  async enforceRetention(): Promise<void> {
    for (const target of this.config.targets) {
      await this.bloodhound.enforceRetentionForPath(
        target.path,
        target.retentionDays,
      );
    }
  }

  private getBackupDestination(target: BackupTarget): string {
    const date = new Date().toISOString().split("T")[0];
    return `.backups/${target.label}/${date}`;
  }

  private async sendNotification(
    results: BackupTargetResult[],
    totalBytes: number,
    duration: number,
  ): Promise<void> {
    // Implementation for notification (email, Slack, etc.)
  }
}

interface BackupTargetResult {
  target: string;
  success: boolean;
  manifestId?: string;
  filesBackedUp?: number;
  bytesBackedUp?: number;
  duration: number;
  error?: string;
  integrity?: { passed: boolean };
}

interface BackupReport {
  timestamp: Date;
  targets: BackupTargetResult[];
  totalBytes: number;
  totalDuration: number;
  success: boolean;
}
```

---

## Workflow 4: Emergency Restore

Rapid recovery from catastrophic failures.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Emergency Restore Workflow                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐        │
│  │  Failure        │───▶│  Stop All       │───▶│  Identify        │        │
│  │  Detected       │    │  Operations     │    │  Latest Backup   │        │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘        │
│                                                              │            │
│                                                              ▼            │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐        │
│  │  Verify          │───▶│  Restore         │───▶│  Validate        │        │
│  │  Backup          │    │  Files           │    │  Recovery        │        │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘        │
│                                                              │            │
│                                                              ▼            │
│  ┌─────────────────┐    ┌─────────────────┐                                 │
│  │  Resume          │    │  Send            │                                 │
│  │  Operations      │    │  Report          │                                 │
│  └─────────────────┘    └─────────────────┘                                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### TypeScript Implementation

```typescript
interface EmergencyRestoreConfig {
  stopOperations: boolean;
  restorePath: string;
  conflictStrategy: "rename" | "overwrite" | "skip";
  validateIntegrity: boolean;
  notificationChannels: string[];
}

class EmergencyRestoreWorkflow {
  private bloodhound: BloodhoundAgent;
  private config: EmergencyRestoreConfig;

  constructor(
    bloodhound: BloodhoundAgent,
    config: Partial<EmergencyRestoreConfig> = {},
  ) {
    this.bloodhound = bloodhound;
    this.config = {
      stopOperations: true,
      restorePath: "",
      conflictStrategy: "rename",
      validateIntegrity: true,
      notificationChannels: ["email"],
      ...config,
    };
  }

  async executeEmergencyRestore(
    targetPath: string,
  ): Promise<EmergencyRestoreReport> {
    const report: EmergencyRestoreReport = {
      startTime: new Date(),
      targetPath,
      steps: [],
      success: false,
    };

    try {
      // Step 1: Stop all operations
      if (this.config.stopOperations) {
        await this.stopAllOperations();
        report.steps.push({ step: "stop-operations", success: true });
      }

      // Step 2: Find latest backup
      const latestBackup = await this.bloodhound.getLatestBackup(targetPath);
      if (!latestBackup) {
        throw new Error("No backup found for target path");
      }
      report.latestBackupId = latestBackup.id;
      report.steps.push({
        step: "find-backup",
        success: true,
        details: latestBackup.id,
      });

      // Step 3: Verify integrity
      if (this.config.validateIntegrity) {
        const integrity = await this.bloodhound.verifyIntegrity(
          latestBackup.id,
        );
        if (!integrity.valid) {
          // Try previous backup
          const previous = await this.bloodhound.getPreviousBackup(
            latestBackup.id,
          );
          if (!previous) {
            throw new Error("No valid backup available");
          }
          report.fallbackBackupId = previous.id;
          report.latestBackupId = previous.id;
        }
        report.steps.push({
          step: "verify-integrity",
          success: integrity.valid,
          details: integrity.valid ? "Passed" : "Failed - using fallback",
        });
      }

      // Step 4: Restore files
      const restorePath = this.config.restorePath || targetPath;
      const result = await this.bloodhound.restore(
        latestBackup.id,
        restorePath,
        {
          conflictStrategy: this.config.conflictStrategy,
        },
      );

      report.restoredFiles = result.restoredCount;
      report.steps.push({
        step: "restore",
        success: true,
        details: `${result.restoredCount} files restored`,
      });

      // Step 5: Validate recovery
      const validation = await this.validateRecovery(restorePath);
      report.validation = validation;
      report.steps.push({
        step: "validate",
        success: validation.valid,
        details: validation.valid
          ? "All files verified"
          : `${validation.errors.length} errors`,
      });

      // Step 6: Resume operations
      await this.resumeOperations();
      report.steps.push({ step: "resume-operations", success: true });

      report.success = true;
    } catch (error) {
      report.steps.push({
        step: "error",
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      report.error = error instanceof Error ? error.message : "Unknown error";
    } finally {
      report.endTime = new Date();
      report.duration = report.endTime.getTime() - report.startTime.getTime();
    }

    // Send notification
    await this.sendEmergencyNotification(report);

    return report;
  }

  private async stopAllOperations(): Promise<void> {
    // Implementation to stop all file operations
  }

  private async resumeOperations(): Promise<void> {
    // Implementation to resume file operations
  }

  private async validateRecovery(
    path: string,
  ): Promise<{ valid: boolean; errors: string[] }> {
    // Implementation to validate recovered files
    return { valid: true, errors: [] };
  }

  private async sendEmergencyNotification(
    report: EmergencyRestoreReport,
  ): Promise<void> {
    // Implementation for emergency notifications
  }
}

interface EmergencyRestoreReport {
  startTime: Date;
  endTime?: Date;
  duration?: number;
  targetPath: string;
  latestBackupId?: string;
  fallbackBackupId?: string;
  restoredFiles?: number;
  validation?: { valid: boolean; errors: string[] };
  steps: Array<{
    step: string;
    success: boolean;
    details?: string;
    error?: string;
  }>;
  success: boolean;
  error?: string;
}
```

---

## Workflow Integration

### With Existing Workflows

| Workflow              | Integration Point    | Description                      |
| --------------------- | -------------------- | -------------------------------- |
| TDD Safety Net        | Pre-operation backup | Create backup before refactoring |
| Parallel Kane         | Distributed backup   | Backup each Kane's operation     |
| Multi-Shepherd Debate | Decision backup      | Backup before major changes      |

### Command Triggers

```typescript
const bloodhoundCommands = {
  "workflow:backup": async (context: OperationContext) => {
    const workflow = new SafeOperationWorkflow(bloodhound);
    return workflow.executeSafeOperation(context, context.operation);
  },

  "workflow:restore": async (manifestId: string, targetPath: string) => {
    return bloodhound.restore(manifestId, targetPath);
  },

  "workflow:schedule-backup": async (config: ScheduledBackupConfig) => {
    const workflow = new ScheduledBackupWorkflow(bloodhound, config);
    return workflow.executeScheduledBackup();
  },

  "workflow:emergency-restore": async (targetPath: string) => {
    const workflow = new EmergencyRestoreWorkflow(bloodhound);
    return workflow.executeEmergencyRestore(targetPath);
  },
};
```

---

## Configuration Example

```typescript
const bloodhoundConfig = {
  backupDirectory: ".backups",
  maxRetries: 3,
  compression: "gzip",
  encryption: {
    enabled: true,
    algorithm: "aes-256-gcm",
  },
  retention: {
    defaultDays: 30,
    maxBackups: 100,
  },
  integrityCheck: {
    enabled: true,
    algorithm: "sha256",
  },
  notifications: {
    onBackupComplete: true,
    onRestoreComplete: true,
    onIntegrityFailure: true,
    channels: ["email", "slack"],
  },
};
```
