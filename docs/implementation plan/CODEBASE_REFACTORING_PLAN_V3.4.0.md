# Codebase Improvement and Refactoring Plan

This plan outlines the refactoring and improvements for the `File-Organizer-MCP` project to enhance maintainability, consistency, and robustness.

## User Review Required

> [!NOTE]
> This refactoring focuses on internal code structure and does not change the external API or behavior of the MCP tools. However, it will improve the reliability of large-scale operations.

> [!IMPORTANT]
> The refactoring of `OrganizerService.organize` involves changing how files are moved atomically. While the goal is to improve robustness, thorough verification is required to ensure no regressions in file handling.

## Proposed Changes

### [Component] Utilities & Security

#### [MODIFY] [file-utils.ts](file:///c:/Users/NewAdmin/Desktop/File-Organizer-MCP/src/utils/file-utils.ts)
- Add `isWindowsReservedName(name: string): boolean` to centralize Windows-specific file naming restrictions.
- Add `performAtomicMove(source: string, destination: string): Promise<void>` to encapsulate the `copyFile` + `unlink` + `cleanup` logic.

#### [MODIFY] [path-validator.service.ts](file:///c:/Users/NewAdmin/Desktop/File-Organizer-MCP/src/services/path-validator.service.ts)
- Use the centralized `isWindowsReservedName` in `validatePathBase`.

---

### [Component] Core Services

#### [MODIFY] [organizer.service.ts](file:///c:/Users/NewAdmin/Desktop/File-Organizer-MCP/src/services/organizer.service.ts)
- **Refactor `organize` method**:
    - Extract `handleConflictResolution()`
    - Extract `executeBatchMove()`
    - Use `FileUtils.performAtomicMove()` instead of inline move logic.
    - Use `FileUtils.isWindowsReservedName()` for destination validation.
- **Improve `generateOrganizationPlan`**:
    - Update collision detection to handle all `ConflictStrategy` types consistently.
    - Improve estimating duration logic.

#### [MODIFY] [metadata.service.ts](file:///c:/Users/NewAdmin/Desktop/File-Organizer-MCP/src/services/metadata.service.ts)
- Use centralized `isWindowsReservedName` in `sanitizeMetadataValue`.

---

### [Component] Testing

#### [NEW] [organizer.unit.test.ts](file:///c:/Users/NewAdmin/Desktop/File-Organizer-MCP/tests/unit/services/organizer_refactored.unit.test.ts)
- Add comprehensive unit tests for the extracted methods in `OrganizerService`.

## Verification Plan

### Automated Tests
- Run existing security suite: `npm run test:security`
- Run all unit tests: `npm test tests/unit`
- Run new organizer tests: `npm test tests/unit/services/organizer_refactored.unit.test.ts`

### Manual Verification
- **Organization Flow**:
    1. Prepare a folder with various file types (images, docs, audio).
    2. Trigger `file_organizer_organize_files` via an MCP client.
    3. Verify files are correctly categorized and moved.
- **Conflict Handling**:
    1. Create a collision scenario (file with same name in destination).
    2. Test different conflict strategies (`rename`, `skip`, `overwrite`).
    3. Verify the outcome matches the chosen strategy.
- **Rollback Verification**:
    1. Perform an organization.
    2. Trigger `file_organizer_undo_last_operation`.
    3. Verify files are returned to their original locations.
