# AGENTS.md

This document serves as the main index for the File Organizer MCP agent system documentation.

**Framework Documentation:** [FRAMEWORK.md](./FRAMEWORK.md) - Complete guide to the Multi-Shepherd Debate System with 5-phase lifecycle, pattern learning, and production feedback loops.

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
│   ├── parallel-kane.md         # Parallel task distribution
│   ├── bloodhound.md            # Backup, versioning & restore
│   ├── borzoi.md                # Pattern analysis & debate intelligence
│   └── debugging.md             # Issue diagnosis & debugging
└── integration/
    └── external.md              # GitHub, Slack, MongoDB, Redis, CI/CD integrations
```

docs/
├── AGENTS.md # Main index (this file)
├── agents.md # Agent profiles & core responsibilities
├── communication/
│ └── protocols.md # Agent communication patterns
├── technical/
│ └── guardrails.md # Non-negotiable code standards
├── workflows/
│ ├── multi-shepherd-debate.md # Collaborative decision-making
│ └── parallel-kane.md # Parallel task distribution
└── integration/
└── external.md # External service integrations

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
| [workflows/bloodhound.md](./workflows/bloodhound.md)                      | Backup, versioning, and restore operations                |
| [workflows/borzoi.md](./workflows/borzoi.md)                               | Pattern analysis & debate intelligence                    |
| [workflows/debugging.md](./workflows/debugging.md)                         | Issue diagnosis and debugging workflows                  |
| [integration/external.md](./integration/external.md)                       | GitHub, Slack, MongoDB, Redis, CI/CD integrations         |

---

## Agent Profiles

| Agent            | Designation    | Primary Function                              |
| ---------------- | -------------- | --------------------------------------------- |
| Shepherd         | The Architect  | Task decomposition and planning               |
| Retriever-Beagle | The Scout      | Context gathering, advanced search & analysis |
| Kane             | The Builder    | Implementation and development                |
| Sentinel         | The Gatekeeper | Security and quality assurance                |
| Bones            | The Tester     | Testing and quality validation                |
| Jonnah           | The Scribe     | Result synthesis and reporting                |
| Echo             | The Documenter | Documentation maintenance                     |
| Bloodhound       | The Keeper     | Backup, versioning, and restore               |
| Borzoi           | The Advisor    | Pattern analysis & debate intelligence        |

See [agents.md](./agents.md) for detailed profiles.

## New Agent Capabilities

### Retriever-Beagle

- Enhanced context gathering with Beagle's advanced search
- Deep file content search with regex support
- Historical file tracking and pattern analysis

### Bloodhound

- Automated backup creation before operations
- Point-in-time restore capabilities
- Version history management and retention policies

### Borzoi

- Pattern analysis and predictive organizing
- **NEW:** Intelligence Shepherd in Multi-Shepherd Debate
- Smart categorization recommendations

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
| `workflow:backup`   | Create pre-operation backup    |
| `workflow:restore`  | Restore from backup            |
| `workflow:analyze`  | Invoke Borzoi pattern analysis |

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

**NEW: Borzoi Intelligence Shepherd**

Borzoi now participates as the **Intelligence Shepherd** in debates, providing:

- Pattern analysis of all proposals
- Predictive success probability
- Risk assessment and mitigation suggestions
- Optimal pattern recommendations

**Intelligence Shepherd Phases**:

1. **Idea Generation** - Borzoi suggests proven patterns
2. **Cross-Validation** - Borzoi analyzes proposal patterns
3. **Conflict Resolution** - Borzoi predicts potential conflicts
4. **Consensus** - Borzoi provides confidence scoring

### Parallel Kane

Horizontal scaling for bulk file operations.

**File**: [workflows/parallel-kane.md](./workflows/parallel-kane.md)

**Features**:

- Task distribution across multiple Kane instances
- Load balancing (least-loaded, round-robin, capability-based)
- Heartbeat monitoring and automatic failover
- Circuit breaker for agent health

### Bloodhound Operations

Safe file operations with automatic backup and restore.

**Features**:

- **Pre-Operation Backup**: Automatically backup before file operations
- **Point-in-Time Restore**: Restore to any previous backup state
- **Version History**: Track all file versions with timestamps
- **Retention Policies**: Automatic cleanup of old backups
- **Integrity Verification**: Verify backup integrity before restore

**Process**:

1. Bloodhound creates snapshot before operations
2. Kane performs file operations
3. On failure: Bloodhound restores from snapshot
4. On success: Bloodhound cleans up temporary backups

### Borzoi Intelligence

Pattern analysis and predictive organizing.

**Features**:

- **Pattern Learning**: Learn organization patterns from user behavior
- **Predictive Suggestions**: Suggest optimal file organization
- **Debate Intelligence**: Analyze proposals in multi-shepherd debates
- **Risk Assessment**: Predict potential issues with proposed solutions
- **Continuous Improvement**: Learn from operation outcomes

**Process**:

1. Borzoi analyzes file patterns and usage
2. Generates organization suggestions with confidence scores
3. Participates in debates as Intelligence Shepherd
4. Refines predictions based on outcomes

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
```
