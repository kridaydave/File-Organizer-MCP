# AGENTS.md

This document serves as the main index for the File Organizer MCP agent system documentation.

---

## Documentation Structure

```
docs/
├── AGENTS.md                    # Main index (this file)
├── agents.md                    # Agent profiles & core responsibilities
├── communication/
│   └── protocols.md             # Agent communication patterns
├── technical/
│   └── guardrails.md            # Non-negotiable code standards
├── workflows/
│   ├── multi-shepherd-debate.md # Collaborative decision-making
│   └── parallel-kane.md         # Parallel task distribution
└── integration/
    └── external.md              # External service integrations
```

---

## Table of Contents

### Core Documentation

| Document                                                                   | Description                                               |
| -------------------------------------------------------------------------- | --------------------------------------------------------- |
| [agents.md](./agents.md)                                                   | Agent profiles, roles, and responsibilities               |
| [communication/protocols.md](./communication/protocols.md)                 | Message formats, patterns, and error recovery             |
| [technical/guardrails.md](./technical/guardrails.md)                       | 8-layer path validation, code style, and testing patterns |
| [workflows/multi-shepherd-debate.md](./workflows/multi-shepherd-debate.md) | Specialist shepherd debate system for complex decisions   |
| [workflows/parallel-kane.md](./workflows/parallel-kane.md)                 | Horizontal scaling for high-throughput file operations    |
| [integration/external.md](./integration/external.md)                       | GitHub, Slack, MongoDB, Redis, CI/CD integrations         |

---

## Agent Profiles

| Agent     | Designation    | Primary Function                        |
| --------- | -------------- | --------------------------------------- |
| Shepherd  | The Architect  | Task decomposition and planning         |
| Retriever | The Scout      | Context gathering and codebase analysis |
| Kane      | The Builder    | Implementation and development          |
| Sentinel  | The Gatekeeper | Security and quality assurance          |
| Bones     | The Tester     | Testing and quality validation          |
| Jonnah    | The Scribe     | Result synthesis and reporting          |
| Echo      | The Documenter | Documentation maintenance               |

See [agents.md](./agents.md) for detailed profiles.

---

## Command Palette

Available commands for agent interactions:

### Task Management

| Command          | Description                           |
| ---------------- | ------------------------------------- |
| `task:decompose` | Shepherd breaks down complex requests |
| `task:execute`   | Kane implements the solution          |
| `task:validate`  | Sentinel audits the output            |
| `task:report`    | Jonnah synthesizes results            |

### Communication

| Command         | Description                   |
| --------------- | ----------------------------- |
| `msg:request`   | Request-response pattern      |
| `msg:broadcast` | Topic-based pub/sub messaging |
| `msg:heartbeat` | Agent health checks           |

### Workflow Triggers

| Command             | Description                    |
| ------------------- | ------------------------------ |
| `workflow:debate`   | Invoke multi-shepherd debate   |
| `workflow:parallel` | Enable parallel Kane execution |
| `workflow:retry`    | Retry failed operations        |
| `workflow:rollback` | Rollback to last checkpoint    |

---

## Workflows

### TDD Safety Net

Test-driven development workflow ensuring all code has corresponding tests before implementation.

**File**: See [technical/guardrails.md](./technical/guardrails.md)

**Process**:

1. Bones writes failing tests first
2. Kane implements code to pass tests
3. Sentinel validates test coverage
4. Jonnah reports pass/fail status

### Echo Chamber

Documentation synchronization workflow that keeps docs in sync with code changes.

**Process**:

1. Echo detects code changes
2. Scans for JSDoc updates needed
3. Updates README.md and related docs
4. Reports documentation deltas

### Multi-Shepherd Debate

Collaborative decision-making for complex architectural choices.

**File**: [workflows/multi-shepherd-debate.md](./workflows/multi-shepherd-debate.md)

**Phases**:

1. Idea Generation - Multiple specialists propose solutions
2. Cross-Validation - Proposals evaluated by all specialists
3. Conflict Resolution - Address objections and concerns
4. Consensus - Reach agreement with quality gate approval

### Parallel Kane

Horizontal scaling for bulk file operations.

**File**: [workflows/parallel-kane.md](./workflows/parallel-kane.md)

**Features**:

- Task distribution across multiple Kane instances
- Load balancing (least-loaded, round-robin, capability-based)
- Heartbeat monitoring and automatic failover
- Circuit breaker for agent health

---

## Communication Protocols

**File**: [communication/protocols.md](./communication/protocols.md)

### Patterns

- **Request-Response**: With correlation IDs and timeout handling
- **Broadcast**: Topic-based pub/sub with filtering
- **Message Queue**: Priority-based with dead letter handling

### Resilience

- **Circuit Breaker**: Prevents cascade failures
- **Retry Handler**: Exponential backoff with configurable limits
- **Checkpoint Recovery**: Periodic state snapshots for recovery

---

## Technical Standards

**File**: [technical/guardrails.md](./technical/guardrails.md)

### 8-Layer Path Validation

1. Length Check - Maximum path length enforcement
2. Character Check - Forbidden character validation
3. Traversal Check - Path traversal prevention
4. Reserved Check - Reserved Windows names
5. Type Check - File/directory type validation
6. Permission Check - Runtime permission verification
7. Quota Check - Storage quota enforcement
8. Symlink Check - Symbolic link regularity

### Code Standards

- TypeScript strict mode
- ESM imports with `.js` extensions
- kebab-case.ts file naming
- > 90% test coverage requirement

---

## Quick Reference

### File Locations

| Path            | Purpose               |
| --------------- | --------------------- |
| `src/agents/`   | Agent implementations |
| `src/services/` | Business logic        |
| `src/schemas/`  | Validation schemas    |
| `tests/`        | Test files            |
| `docs/`         | Documentation         |

### Naming Conventions

| Type      | Convention           | Example             |
| --------- | -------------------- | ------------------- |
| Files     | kebab-case           | `file-organizer.ts` |
| Classes   | PascalCase           | `FileProcessor`     |
| Functions | camelCase            | `processFile()`     |
| Constants | SCREAMING_SNAKE_CASE | `MAX_RETRY_COUNT`   |

---

## Related Documents

- [README.md](../README.md) - Project overview
- [API.md](../API.md) - API reference
- [ARCHITECTURE.md](../ARCHITECTURE.md) - System architecture
- [TESTS.md](../TESTS.md) - Testing guidelines
