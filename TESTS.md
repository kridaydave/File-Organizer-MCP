# Test Suite Documentation

How the File Organizer MCP test suite is organized, how to run it, and the
conventions every test must follow. Counts are deliberately not written here -
prose counts drift the moment a test is added (see AGENTS.md, "Not machine-checked
yet"). Run `npm test` for the real number.

`AGENTS.md` wins on any conflict with this file.

## Test Organization

```
tests/
├── unit/                # Services, core modules, tools, schemas, utils - isolated
│   ├── services/        # Service-layer tests (path-validator, organizer, history, ...)
│   ├── core/            # Business-logic tests (scan, categorize, organize, hash, config)
│   ├── tools/           # Tool handler tests with mocked services
│   ├── schemas/         # Zod schema tests
│   ├── utils/           # Utility tests (logger, formatters, path-security)
│   ├── security_suite.test.ts        # Comprehensive security suite
│   ├── security_repro.test.ts        # Security vulnerability reproduction
│   └── category_security.test.ts     # Category name security
├── integration/         # Tool wiring tests - real handlers, real fs in sandboxes
│   └── tools/           # One contract test per tool group
├── performance/         # Smoke thresholds (scan latency, heap growth)
├── helpers/             # Shared fixtures: safe-index, rollback-storage, exif-fixture
└── sandbox/             # Reserved for on-disk test data; never commit fixtures here
```

Outside `tests/`:

- `scripts/security-gates/` - fuzzing, TOCTOU, sensitive-file, and static-analysis
  gates (`npm run test:security:gates`), plus static analysis alone
  (`npm run test:security:static`).
- `.opencode/skills/verify-file-organizer/` - the stdio harness that drives the
  real built server inside a throwaway sandbox. Unit tests do not prove a tool
  works; see AGENTS.md, "Proving a change".

## Running Tests

```bash
npm test                                   # all tests (Jest, ESM)
npm test tests/unit/services/organizer.test.ts   # single file
npm run test:coverage                      # with coverage
npm run test:security                      # static gates + the 7 security suites
npm run test:security:gates                # fuzzing + TOCTOU + sensitive files (needs build)
npm run typecheck:tests                    # bun check over src + tests - a real gate
npm run verify:all                         # everything: build, lint, types, docs, security, tests
```

## Conventions

### Sandbox rule

Test data lives in `tests/sandbox/` or `await fs.mkdtemp(path.join(os.tmpdir(), 'test-'))`.
Never `~/Documents`, never the developer's config dir. Data flows one way: into the
sandbox, never out. Redirect config roots with `jest.unstable_mockModule` plus
`...actualPaths` - see `tests/integration/tools/output-schema.test.ts` for the pattern.

### ESM mocking

The suite is Jest + ESM. Mock modules before importing, use dynamic `import()`, and
access default exports via `.default`:

```typescript
import { jest } from '@jest/globals';

const mockFn = jest.fn();
jest.unstable_mockModule('./path/to/module.js', () => ({
  default: mockFn,
  namedExport: jest.fn(),
}));

const moduleUnderTest = await import('./module-under-test.js');
```

Pitfalls: mock before import (imports hoist), always `await`, named exports come
through directly.

### Portability

CI runs 6 legs (3 OS × Node 20/22); a green Linux run proves nothing about the
other five. The five leak classes and their fixes live in AGENTS.md rule 3
("Baking in paths"). Short form: no raw absolute paths in assertions, sort both
sides of every `readdir` comparison, never `path.join` a value a human reads,
canonicalise realpaths once in `beforeEach`, and assert the setup fired so a
test cannot pass vacuously.

### A test that cannot fail is wrong

Break the code under test and confirm the test goes red before trusting it.
Assert the setup itself: `expect(swapped).toBe(true)` - see
`tests/unit/core/scan/sensitive-scan.test.ts` for the worked example.

### Integration tests that move files own their rollback storage

`getRollbackDirectory()` is shared across Jest workers, and a no-id
`undo_last_operation` takes whichever manifest is globally newest. Redirect the
config root per test file and pass the `manifest_id` the organize returned to
the undo - read it from `structuredContent`, not the markdown. See
`tests/integration/full_organization_flow.test.ts` (regression guard for #108).

### Timing

The organizer is async and event-ish. Wait on receipts and awaited promises,
never on `setTimeout` polling - a test that needs a sleep to pass is wrong.
Exception: on Windows, add a 100ms delay before `fs.rm` in `afterEach` to
release file locks:

```typescript
afterEach(async () => {
  await new Promise(r => setTimeout(r, 100));
  await fs.rm(testDir, { recursive: true, force: true });
});
```

## Adding New Tests

1. **Unit first** - services in isolation, tool handlers with mocked services.
2. **Integration second** - real handlers over real fs in a sandbox, covering
   undo/rollback and both `json` and `markdown` response formats.
3. **Prove it on the real server last** - drive the built binary with the
   `verify-file-organizer` skill (`node $C doctor && node $C call ...`).
   A passing unit test is not proof the tool works.

Behavior changes ship with a focused test that fails without the change. If the
change touches a tool shape, grep `tests/` and `API.md` before calling it done.
