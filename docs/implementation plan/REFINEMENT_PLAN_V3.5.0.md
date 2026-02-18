# Refinement and Optimization Plan (v3.5.0)

This plan outlines the next phase of improvements for the `File-Organizer-MCP` project, focusing on operational robustness, performance optimization, and modernizing core components.

## User Review Required

> [!CAUTION]
> **Metadata Extractor Swap**: Replacing `exif-parser` with `exiftool-vendored` may require users to have Perl installed on some systems (though the vendored version usually includes it). This change should be thoroughly tested on Windows.

> [!IMPORTANT]
> **Retry Logic**: Implementing retries for file operations must be carefully tuned to avoid long blocking periods in the MCP server.

## Proposed Changes

### [Component] Core Services & Refactoring

#### [MODIFY] [organizer.service.ts](file:///c:/Users/NewAdmin/Desktop/File-Organizer-MCP/src/services/organizer.service.ts)
- Replace inline atomic move logic with calls to `FileUtils.performAtomicMove`.
- Implement a retry wrapper for `performAtomicMove` that handles `EBUSY` and `EPERM` errors with exponential backoff.
- Extract `executeBatchMove` logic to simplify the `organize` method.

#### [MODIFY] [metadata.service.ts](file:///c:/Users/NewAdmin/Desktop/File-Organizer-MCP/src/services/metadata.service.ts)
- Integrate `exiftool-vendored` for more robust EXIF extraction.
- Implement a fallback mechanism to the legacy `exif-parser` if `exiftool` is unavailable.

---

### [Component] Performance & Caching

#### [MODIFY] [categorizer.service.ts](file:///c:/Users/NewAdmin/Desktop/File-Organizer-MCP/src/services/categorizer.service.ts)
- Enhance the `ContentAnalysisCache` to persist results across server restarts (optional, requires a simple file-based cache).
- Add a "Trusted Paths" feature to skip content verification for directories known to be safe (e.g., standard media libraries).

---

### [Component] Diagnostics

#### [MODIFY] [logger.ts](file:///c:/Users/NewAdmin/Desktop/File-Organizer-MCP/src/utils/logger.ts)
- Add request context (Operation ID) to all logs emitted during an organization batch.
- Include file checksums in success logs for auditing.

## Verification Plan

### Automated Tests
- `npm test tests/unit/services/organizer.test.ts`
- `npm test tests/integration/full_organization_flow.test.ts`
- New unit tests for the retry mechanism in `organizer.service.test.ts`.

### Manual Verification
- Verify `exiftool` works correctly on high-res JPEG and RAW files.
- Simulate `EBUSY` errors (by locking files in another process) and verify the retry logic recovers.
- Check logs for the presence of Operation IDs during a batch run.
