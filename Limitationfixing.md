# Smart Scheduler Catchup Implementation

## Problem Statement

The current [runMissedSchedules()](file:///c:/Users/NewAdmin/Desktop/File-Organizer-MCP/src/services/auto-organize.service.ts#354-386) function in [auto-organize.service.ts](file:///c:/Users/NewAdmin/Desktop/File-Organizer-MCP/src/services/auto-organize.service.ts) runs organization for **all** enabled directories on every server startup, regardless of whether a scheduled run was actually missed. This is inefficient and can be surprising to users.

## Goal

Implement a **smart catchup** mechanism that:
1. **Persists** the last successful run time for each watched directory
2. **Parses** the cron schedule to determine the next expected run
3. **Compares** the current time with the expected run time
4. **Only triggers** catchup if the scheduled run was actually missed

---

## Proposed Changes

### State Persistence

#### [NEW] [scheduler-state.service.ts](file:///c:/Users/NewAdmin/Desktop/File-Organizer-MCP/src/services/scheduler-state.service.ts)

Creates a new service to persist scheduler state to disk.

**Responsibilities:**
- Store last successful run timestamps per directory in a JSON file
- Located at the same config directory as user config (`%APPDATA%/file-organizer-mcp/scheduler-state.json` on Windows)
- Provide methods: `getLastRunTime(directory)`, `setLastRunTime(directory, timestamp)`, `clearState()`
- Handle file I/O errors gracefully with fallback to "never ran"

**State file schema:**
```json
{
  "version": 1,
  "directories": {
    "C:\\Users\\Example\\Downloads": {
      "lastRunTime": "2026-02-08T09:00:00.000Z",
      "schedule": "0 9 * * *"
    }
  }
}
```

---

### Cron Parsing Utilities

#### [NEW] [cron-utils.ts](file:///c:/Users/NewAdmin/Desktop/File-Organizer-MCP/src/utils/cron-utils.ts)

Creates utility functions to work with cron expressions.

**Functions:**
- `getNextRunTime(cronExpression: string, fromDate: Date): Date` - Computes the next scheduled run time from a given date
- `getPreviousRunTime(cronExpression: string, fromDate: Date): Date` - Computes the most recent scheduled run time before a given date
- `shouldCatchup(cronExpression: string, lastRunTime: Date | null, currentTime: Date): boolean` - Determines if a catchup run is needed

**Implementation:**
- Uses the `node-cron` library's internal parsing, or a simple custom parser for common cron patterns (hourly, daily, weekly)
- For complex cron expressions, falls back to a heuristic: if `currentTime - lastRunTime > minimumIntervalFromCron`, then catchup is needed

---

### Service Updates

#### [MODIFY] [auto-organize.service.ts](file:///c:/Users/NewAdmin/Desktop/File-Organizer-MCP/src/services/auto-organize.service.ts)

Updates the auto-organize service to use smart catchup.

**Changes:**
1. **Inject `SchedulerStateService`** as a dependency
2. **Update [runMissedSchedules()](file:///c:/Users/NewAdmin/Desktop/File-Organizer-MCP/src/services/auto-organize.service.ts#354-386):**
   - For each watch config with `auto_organize: true`:
     - Get `lastRunTime` from state service
     - Use `shouldCatchup()` to determine if a run is needed
     - If catchup needed, run organization and update `lastRunTime` on success
3. **Update [runOrganization()](file:///c:/Users/NewAdmin/Desktop/File-Organizer-MCP/src/services/auto-organize.service.ts#189-266):**
   - After successful organization, call `stateService.setLastRunTime(directory, new Date())`
4. **Add [shouldRunOnStartup()](file:///c:/Users/NewAdmin/Desktop/File-Organizer-MCP/src/services/auto-organize.service.ts#345-353) enhancement:**
   - Rename current logic to `shouldIncludeInCatchupCheck()`
   - New [shouldRunOnStartup()](file:///c:/Users/NewAdmin/Desktop/File-Organizer-MCP/src/services/auto-organize.service.ts#345-353) uses smart catchup logic

---

### Configuration Updates

#### [MODIFY] [config.ts](file:///c:/Users/NewAdmin/Desktop/File-Organizer-MCP/src/config.ts)

Adds a new configuration option to control catchup behavior.

**Changes:**
1. Add to `WatchConfig.rules`:
   ```typescript
   /** Catchup behavior when server starts */
   catchup_mode?: 'smart' | 'always' | 'never';
   ```
   - `'smart'` (default): Only run if schedule was missed
   - `'always'`: Always run on startup (current behavior)
   - `'never'`: Never run catchup on startup

---

### Index Updates

#### [MODIFY] [services/index.ts](file:///c:/Users/NewAdmin/Desktop/File-Organizer-MCP/src/services/index.ts)

Export the new `SchedulerStateService`.

---

## Verification Plan

### Automated Tests

All tests run via:
```powershell
npm test -- --testPathPattern="auto-organize"
```

#### [MODIFY] [auto-organize.test.ts](file:///c:/Users/NewAdmin/Desktop/File-Organizer-MCP/tests/unit/services/auto-organize.test.ts)

Add new test cases for smart catchup:

1. **`shouldCatchup` returns `true` when schedule was missed**
   - Set lastRunTime to 25 hours ago for a daily schedule
   - Verify [runMissedSchedules()](file:///c:/Users/NewAdmin/Desktop/File-Organizer-MCP/src/services/auto-organize.service.ts#354-386) triggers organization

2. **`shouldCatchup` returns `false` when recently ran**
   - Set lastRunTime to 1 hour ago for a daily schedule
   - Verify [runMissedSchedules()](file:///c:/Users/NewAdmin/Desktop/File-Organizer-MCP/src/services/auto-organize.service.ts#354-386) does NOT trigger organization

3. **`catchup_mode: 'always'` always runs**
   - Set lastRunTime to 1 minute ago
   - Verify organization still runs

4. **`catchup_mode: 'never'` never runs catchup**
   - Clear lastRunTime (simulate missed schedule)
   - Verify organization does NOT run

5. **State persistence works correctly**
   - Run organization
   - Verify lastRunTime is written to state file
   - Create new service instance
   - Verify lastRunTime is read correctly

#### [NEW] [scheduler-state.test.ts](file:///c:/Users/NewAdmin/Desktop/File-Organizer-MCP/tests/unit/services/scheduler-state.test.ts)

New test file for state service:

1. **Writes state to file correctly**
2. **Reads state from file correctly**
3. **Handles missing state file gracefully**
4. **Handles corrupted state file gracefully**
5. **Clears state correctly**

#### [NEW] [cron-utils.test.ts](file:///c:/Users/NewAdmin/Desktop/File-Organizer-MCP/tests/unit/utils/cron-utils.test.ts)

New test file for cron utilities:

1. **`getNextRunTime` for hourly cron**
2. **`getNextRunTime` for daily cron**
3. **`getNextRunTime` for weekly cron**
4. **`getPreviousRunTime` accuracy**
5. **`shouldCatchup` edge cases (first run, exact boundary)**

### Manual Verification

> [!IMPORTANT]
> After implementing, perform the following manual test:

1. **Configure a watched directory** with daily schedule (`0 9 * * *`)
2. **Start the server** and verify catchup runs (first time, no prior state)
3. **Stop the server** and check `%APPDATA%/file-organizer-mcp/scheduler-state.json` for saved timestamp
4. **Restart the server immediately** (within the schedule interval) and verify **no** catchup runs
5. **Manually edit** `scheduler-state.json` to set `lastRunTime` to 25+ hours ago
6. **Restart the server** and verify catchup **does** run

---

## Implementation Order

1. Create `src/utils/cron-utils.ts` with utility functions
2. Create `src/services/scheduler-state.service.ts` for state persistence
3. Update [src/config.ts](file:///c:/Users/NewAdmin/Desktop/File-Organizer-MCP/src/config.ts) to add `catchup_mode` option
4. Update [src/services/auto-organize.service.ts](file:///c:/Users/NewAdmin/Desktop/File-Organizer-MCP/src/services/auto-organize.service.ts) with smart catchup logic
5. Update [src/services/index.ts](file:///c:/Users/NewAdmin/Desktop/File-Organizer-MCP/src/services/index.ts) to export new service
6. Write unit tests for new functionality
7. Run all tests and fix any issues
8. Manual verification
