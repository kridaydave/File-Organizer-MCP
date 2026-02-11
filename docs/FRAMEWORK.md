# Multi-Shepherd Debate Framework

A comprehensive decision-making framework for architectural discussions with pattern learning, production feedback loops, and continuous improvement.

---

## Table of Contents

1. [Framework Overview](#framework-overview)
2. [The 5-Phase Debate Lifecycle](#the-5-phase-debate-lifecycle)
3. [Agent Profiles](#agent-profiles)
4. [Workflows](#workflows)
5. [File Organizer MCP Integration](#file-organizer-mcp-integration)
6. [File Organizer Workflows](#file-organizer-workflows)
7. [File Organizer Agent Capabilities](#file-organizer-agent-capabilities)
8. [Technical Implementation](#technical-implementation)
9. [File Organizer Quality Gates](#file-organizer-quality-gates)
10. [File Organizer Metrics](#file-organizer-metrics)
11. [Technical Guidelines](#technical-guidelines)
12. [Documentation Structure](#documentation-structure)
13. [Usage Guide](#usage-guide)
14. [Quick Reference](#quick-reference)

---

## Framework Overview

The Multi-Shepherd Debate Framework transforms architectural decision-making from subjective opinion into quantifiable, self-improving governance.

### Core Philosophy

| Principle                 | Description                                                           |
| ------------------------- | --------------------------------------------------------------------- |
| **Multi-Perspective**     | Every decision considers security, performance, reliability, and more |
| **Quantified Confidence** | Agents vote with confidence scores, not binary yes/no                 |
| **Conflict Resolution**   | Formal methods prevent infinite debate loops                          |
| **Pattern Learning**      | Historical outcomes inform future decisions                           |
| **Production Feedback**   | Real errors improve future debates                                    |

### Key Metrics

| Metric                  | Target | Description                 |
| ----------------------- | ------ | --------------------------- |
| Agreement Index         | ≥ 0.75 | Weighted consensus strength |
| Confidence Index        | ≥ 0.80 | Average confidence in votes |
| Participation Rate      | ≥ 80%  | Shepherd involvement        |
| Post-Mortem Integration | 100%   | All incidents feed back     |

---

## The 5-Phase Debate Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DEBATE LIFECYCLE                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐ │
│  │   PHASE 1  │───▶│   PHASE 2  │───▶│   PHASE 3  │───▶│   PHASE 4  │ │
│  │    IDEA    │    │    CROSS   │    │  CONFLICT  │    │  CONSENSUS  │ │
│  │ GENERATION │    │ VALIDATION │    │ RESOLUTION │    │             │ │
│  └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘ │
│         │                  │                  │                  │          │
│         ▼                  ▼                  ▼                  ▼          │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐ │
│  │ Proposals   │    │ Enhanced    │    │ Structured │    │ Quality     │ │
│  │ from 6+     │    │ Voting      │    │ Conflicts   │    │ Gates       │ │
│  │ Shepherds    │    │ (0-1 scale)│    │ Resolved   │    │ Approved    │ │
│  └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘ │
│                                                                              │
│                            FEEDBACK LOOP CLOSURE                             │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                         PHASE 5: POST-MORTEM                          │ │
│  │                                                                          │ │
│  │   Production Error → Analysis → Weight Adjustments → Pattern Learning  │ │
│  │                                                                              │ │
│  │   ┌─────────────────────────────────────────────────────────────────────┐  │ │
│  │   │ Debates get SMARTER with every production incident               │  │ │
│  │   │                                                                     │  │ │
│  │   │ Weight   → Based on who was right/wrong                         │  │ │
│  │   │ Patterns → Improved from failures                                │  │ │
│  │   │ Conditions → Added based on what was missed                      │  │ │
│  │   └─────────────────────────────────────────────────────────────────────┘  │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Phase 1: Idea Generation

**Purpose:** Collect multi-perspective proposals

**Duration:** 10-20 minutes (time-boxed)

**Participants:**

- Architect (weight: 1.2)
- Performance (weight: 1.1)
- Security (weight: 1.3)
- Maintainability (weight: 1.0)
- Delivery (weight: 0.9)
- Borzoi/Intelligence (weight: 1.1)

**Output:** Proposals with full rationale

### Phase 2: Cross-Validation

**Purpose:** Quantify agreement and confidence

**Duration:** 15-30 minutes (time-boxed)

**Enhanced Voting:**

```typescript
interface EnhancedVote {
  approval: number; // 0-1 scale
  confidence: number; // 0-1 scale
  concerns: string[]; // List of concerns
  conditions: string[]; // Requirements for approval
  rankedPreferences: string[]; // Ordered preference list
}
```

**Output:** Weighted voting results with metrics

### Phase 3: Conflict Resolution

**Purpose:** Resolve disagreements formally

**Duration:** 10-20 minutes (time-boxed)

**Resolution Methods:**

| Conflict Type | Method        | Criteria                   |
| ------------- | ------------- | -------------------------- |
| Security      | Expert        | Security shepherd has veto |
| Performance   | Data          | Benchmark results          |
| Architectural | Weighted Vote | Majority with weights      |
| Priority      | Vote          | Impact/effort analysis     |
| Scope         | Vote          | Value/feasibility          |

**Output:** Resolved conflicts with rationale

### Phase 4: Consensus

**Purpose:** Final quality gates and approval

**Duration:** 5-15 minutes (time-boxed)

**Quality Gates:**

| Gate                | Threshold | Status |
| ------------------- | --------- | ------ |
| Agreement Index     | ≥ 0.75    | ✅/❌  |
| Confidence Index    | ≥ 0.80    | ✅/❌  |
| Participation       | ≥ 80%     | ✅/❌  |
| Security Conditions | 100%      | ✅/❌  |

**Output:** Approved design + GitHub issues

### Phase 5: Post-Mortem

**Purpose:** Close the feedback loop

**Trigger:** Production incident

**Actions:**

1. **Root Cause Analysis** — Identify what went wrong
2. **Weight Adjustments** — Reward/penalize shepherds
3. **Pattern Improvement** — Update Borzoi patterns
4. **New Conditions** — Add requirements for future debates

**Output:** Smarter system for next debate

---

## Agent Profiles

| Agent                | Designation    | Primary Function                       |
| -------------------- | -------------- | -------------------------------------- |
| **Shepherd**         | The Architect  | Task decomposition and planning        |
| **Retriever-Beagle** | The Scout      | Context gathering and advanced search  |
| **Kane**             | The Builder    | Implementation and development         |
| **Sentinel**         | The Gatekeeper | Security and quality assurance         |
| **Bones**            | The Tester     | Testing and quality validation         |
| **Jonnah**           | The Scribe     | Result synthesis and documentation     |
| **Echo**             | The Documenter | Documentation maintenance              |
| **Bloodhound**       | The Keeper     | Backup, versioning, and restore        |
| **Borzoi**           | The Advisor    | Pattern analysis & debate intelligence |

### Agent Capabilities

#### Retriever-Beagle

- Enhanced context gathering with Beagle's advanced search
- Deep file content search with regex support
- Historical file tracking and pattern analysis

#### Bloodhound

- Automated backup creation before operations
- Point-in-time restore capabilities
- Version history management and retention policies

#### Borzoi

- Pattern analysis and predictive organizing
- **Intelligence Shepherd in Multi-Shepherd Debate**
- Smart categorization recommendations
- **Post-Mortem Pattern Learning**

---

## Workflows

### Core Workflows

| Workflow              | File                                 | Purpose                                |
| --------------------- | ------------------------------------ | -------------------------------------- |
| Multi-Shepherd Debate | `workflows/multi-shepherd-debate.md` | Collaborative decision-making          |
| Parallel Kane         | `workflows/parallel-kane.md`         | Horizontal scaling for bulk operations |
| Bloodhound            | `workflows/bloodhound.md`            | Safe operations with backup            |
| Borzoi                | `workflows/borzoi.md`                | Pattern analysis & debate intelligence |
| Debugging             | `workflows/debugging.md`             | Issue diagnosis and resolution         |

### Workflow Integration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         WORKFLOW RELATIONSHIPS                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────┐                                                     │
│  │ MULTI-SHEPHER DEBATE │◀──────────────────────────────────────────────┐  │
│  └─────────────────────┘                                              │      │
│         │                     │                                      │      │
│         ▼                     ▼                                      │      │
│  ┌───────────────┐    ┌─────────────────────┐                      │      │
│  │ PARALLEL KANE │    │ POST-MORTEM        │──────────────────────┘  │
│  │ (Execution)   │    │ (Feedback Loop)   │                             │
│  └───────────────┘    └─────────────────────┘                             │
│         │                     │                                              │
│         ▼                     ▼                                              │
│  ┌───────────────┐    ┌─────────────────────┐                              │
│  │ BLOODHOUND   │    │ BORZOI             │                              │
│  │ (Backup)     │    │ (Pattern Learning) │                              │
│  └───────────────┘    └─────────────────────┘                              │
│                                                                              │
│         │                     │                                              │
│         ▼                     ▼                                              │
│  ┌───────────────┐    ┌─────────────────────┐                              │
│  │ DEBUGGING    │    │ IMPROVED DEBATE    │────────────────────────────┘  │
│  │ (If Issues)   │    │ (Smarter Next Time)                              │
│  └───────────────┘    └─────────────────────┘                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Technical Guidelines

### Path Validation (8 Layers)

See: `technical/guardrails.md`

```typescript
interface ValidationLayer {
  layer: string;
  check: (path: string) => boolean;
  priority: number;
}

const VALIDATION_LAYERS: ValidationLayer[] = [
  { layer: "LENGTH", check: validateLength, priority: 1 },
  { layer: "CHARACTER", check: validateCharacters, priority: 2 },
  { layer: "TRAVERSAL", check: validateTraversal, priority: 3 },
  { layer: "RESERVED", check: validateReservedNames, priority: 4 },
  { layer: "TYPE", check: validateType, priority: 5 },
  { layer: "PERMISSION", check: validatePermissions, priority: 6 },
  { layer: "QUOTA", check: validateQuota, priority: 7 },
  { layer: "SYMLINK", check: validateSymlinks, priority: 8 },
];
```

### Error Codes

See: `error-codes.md`

| Code                     | Category    | Resolution                  |
| ------------------------ | ----------- | --------------------------- |
| `PATH_VALIDATION_FAILED` | Security    | Check path against 8 layers |
| `FILE_ACCESS_DENIED`     | Permissions | Check file permissions      |
| `RATE_LIMIT_EXCEEDED`    | Rate Limit  | Wait before retrying        |

### Performance Targets

See: `performance.md`

| Metric       | Target   | Description           |
| ------------ | -------- | --------------------- |
| Files/second | > 1000   | Processing throughput |
| Memory usage | < 500MB  | Peak consumption      |
| Latency      | < 100ms  | Time per operation    |
| Hash speed   | > 50MB/s | SHA-256 computation   |

---

## Documentation Structure

```
docs/
├── FRAMEWORK.md                          # This file
│
├── AGENTS.md                             # Agent index & command palette
├── agents.md                             # Detailed agent profiles
│
├── communication/
│   └── protocols.md                      # Agent communication patterns
│
├── debate_doc/                           # Auto-generated debate documentation
│   └── file_writer_function.md           # Example debate output
│
├── integration/
│   └── external.md                       # GitHub, Slack, CI/CD integrations
│
├── technical/
│   ├── debate-improvements.md            # Enhancement proposals
│   ├── guardrails.md                     # 8-layer validation & code standards
│   └── metrics.md                        # Performance metrics & benchmarks
│
├── troubleshooting/
│   └── common-issues.md                  # Error resolution guide
│
├── workflows/
│   ├── bloodhound.md                    # Backup & restore workflows
│   ├── borzoi.md                       # Pattern analysis & debate intelligence
│   ├── debugging.md                     # Issue diagnosis workflows
│   ├── multi-shepherd-debate.md         # Core debate workflow
│   └── parallel-kane.md                 # Parallel task distribution
│
├── API.md                                # MCP API reference
├── error-codes.md                        # Complete error code reference
├── NEW-AGENTS.md                         # Proposed new agents
├── performance.md                        # Optimization guide
└── SECURITY.md                           # Security guidelines
```

### Document Purposes

| Document               | Purpose             | Audience         |
| ---------------------- | ------------------- | ---------------- |
| `FRAMEWORK.md`         | High-level overview | All stakeholders |
| `agents.md`            | Agent capabilities  | Developers       |
| `workflows/*.md`       | How-to guides       | Implementers     |
| `technical/*.md`       | Technical specs     | Architects       |
| `troubleshooting/*.md` | Problem resolution  | Support          |

---

## File Organizer MCP Integration

The Multi-Shepherd Debate Framework is deeply integrated with the File Organizer MCP system, providing structured decision-making for file management operations.

### File Organization-Specific Debates

#### Template: File Organization Strategy

```typescript
import { TemplateManager } from "./src/debate/templates";

const template = templateManager.getTemplate("file_organization_strategy");
```

**Key Decisions Addressed:**

- File categorization rules
- Duplicate detection algorithms
- Renaming conventions
- Security protocols for sensitive files
- Performance optimization strategies

#### Template: Duplicate Management

```typescript
const template = templateManager.getTemplate("duplicate_management");
```

**Key Decisions Addressed:**

- Duplicate detection method (content hash vs metadata)
- Duplicate resolution strategy (delete, move, ignore)
- Batch processing thresholds
- Recovery options

---

## File Organizer Workflows

### File Categorization Debate

**Purpose:** Determine optimal file categorization strategy

**Participants:**

- **Categorization Expert** (weight: 1.4) - Deep knowledge of file types and patterns
- **Performance Shepherd** (weight: 1.1) - Concerned with processing speed
- **Security Sentinel** (weight: 1.3) - Focus on sensitive file handling
- **Maintainability Expert** (weight: 1.0) - Ease of configuration
- **User Experience** (weight: 1.2) - Intuitive organization

**Decision Criteria:**
| Factor | Weight | Description |
|--------|--------|-------------|
| Accuracy | 0.35 | How well files are categorized |
| Speed | 0.25 | Processing throughput |
| Security | 0.20 | Sensitive file protection |
| Usability | 0.20 | Ease of configuration |

### Duplicate Detection Debate

**Purpose:** Select duplicate detection algorithm

**Options:**

1. **Content Hash (SHA-256)** - High accuracy, slower
2. **Metadata Comparison** - Faster, less accurate
3. **Hybrid Approach** - Balanced accuracy and speed

**Decision Matrix:**
| Algorithm | Accuracy | Speed | Resource Usage |
|-----------|----------|-------|----------------|
| SHA-256 | 99.9% | Slow | High |
| Metadata | 85% | Fast | Low |
| Hybrid | 95% | Medium | Medium |

---

## File Organizer Agent Capabilities

### Categorization Agent

**Primary Function:** Intelligent file classification

**Capabilities:**

- Analyzes file extensions, content, and metadata
- Learns from user corrections
- Handles ambiguous file types
- Supports custom categorization rules
- **Pattern Learning:** Improves accuracy with each file processed

### Security Agent

**Primary Function:** Sensitive file protection

**Capabilities:**

- Detects sensitive content patterns
- Applies security labels to files
- Prevents accidental exposure
- Enforces access controls
- **Real-time Monitoring:** Scans files as they're processed

### Performance Agent

**Primary Function:** Processing optimization

**Capabilities:**

- Monitors system resources
- Optimizes batch processing
- Balances speed and accuracy
- Prevents system overload
- **Adaptive Throttling:** Adjusts processing based on system load

### Recovery Agent

**Primary Function:** File recovery and rollback

**Capabilities:**

- Maintains operation history
- Supports point-in-time recovery
- Validates recovered files
- Generates recovery reports
- **Incremental Backups:** Efficient recovery mechanisms

---

## Technical Implementation

### File System Integration

```typescript
import { FileSystemDebate } from "./src/debate/file-system";

const debate = new FileSystemDebate({
  rootDirectory: "/path/to/files",
  includePatterns: ["**/*.{jpg,png,pdf}"],
  excludePatterns: ["**/node_modules/**"],
});

const result = await debate.runCategorizationDebate();
```

### Real-time Feedback Loop

```typescript
import { PostMortemPhase } from "./src/debate/post-mortem";

// Capture user correction
const feedback = {
  file: "/path/to/misclassified/file.txt",
  actualCategory: "documents",
  proposedCategory: "media",
  confidence: 0.6,
};

const postMortem = new PostMortemPhase();
await postMortem.processUserFeedback(feedback);
```

---

## Usage Guide

### Starting a New Debate

1. **Choose a Template**

   ```typescript
   import { TemplateManager } from "./templates";

   const template = templateManager.getTemplate("feature_design");
   ```

2. **Configure Phases**
   - Set time boxes per phase
   - Assign required shepherds
   - Define success criteria

3. **Run Phase 1: Idea Generation**
   - Each shepherd proposes
   - Borzoi provides pattern analysis

4. **Run Phase 2: Cross-Validation**
   - Enhanced voting with confidence
   - Capture concerns and conditions

5. **Run Phase 3: Conflict Resolution**
   - Identify conflicts
   - Resolve using appropriate method

6. **Run Phase 4: Consensus**
   - Check quality gates
   - Approve or reject

7. **Generate Documentation**

   ```typescript
   import { DocumentationGenerator } from "./documentation-generator";

   const generator = new DocumentationGenerator();
   const { markdown, openapi } = await generator.generateAndSave(debate);
   ```

### Responding to Production Incidents

1. **Capture Incident**

   ```typescript
   const incident: ProductionIncident = {
     id: "INC-YYYY-MM-DD-001",
     severity: "critical",
     errorType: "reliability",
     relatedDebateId: "DEBATE-...",
     // ...
   };
   ```

2. **Run Post-Mortem**

   ```typescript
   import { PostMortemPhase } from "./post-mortem";

   const postMortem = new PostMortemPhase();
   await postMortem.startPhase(debateId, incident);
   ```

3. **Review Adjustments**
   - Weight changes applied
   - Patterns improved
   - New conditions added

### Adding New Agents

See: `NEW-AGENTS.md`

1. Define agent profile
2. Implement core capabilities
3. Integrate with workflows
4. Add to debate templates

---

## Quick Reference

### Command Palette

| Command             | Description                    |
| ------------------- | ------------------------------ |
| `workflow:debate`   | Invoke multi-shepherd debate   |
| `workflow:parallel` | Enable parallel Kane execution |
| `workflow:backup`   | Create pre-operation backup    |
| `workflow:analyze`  | Invoke Borzoi pattern analysis |
| `workflow:diagnose` | Run diagnostic on issue        |

### Quality Gates

| Gate             | Minimum | Critical          |
| ---------------- | ------- | ----------------- |
| Agreement Index  | 0.75    | ❌ Below = Reject |
| Confidence Index | 0.80    | ❌ Below = Reject |
| Participation    | 80%     | ❌ Below = Reopen |

### Weight Defaults

| Shepherd        | Weight | Reason                 |
| --------------- | ------ | ---------------------- |
| Architect       | 1.2    | Design authority       |
| Performance     | 1.1    | Optimization expertise |
| Security        | 1.3    | Safety critical        |
| Maintainability | 1.0    | Standard               |
| Delivery        | 0.9    | Timeline focus         |
| Intelligence    | 1.1    | Data-driven            |
| Reliability     | 1.6    | **NEW - Highest**      |

### Post-Mortem Impact

| Adjustment      | Trigger             | Max  |
| --------------- | ------------------- | ---- |
| Weight Increase | Correct prediction  | +0.6 |
| Weight Decrease | Missed prediction   | -0.2 |
| Pattern Update  | Production failure  | N/A  |
| New Condition   | Incident root cause | N/A  |

---

## The Feedback Loop

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│         DEBATE → IMPLEMENT → PRODUCE → INCIDENT → POST-MORTEM → IMPROVE   │
│                                                                              │
│                    ▲                                                        │
│                    │                                                        │
│           ┌───────┴───────┐                                                │
│           │  CLOSES THE  │                                                │
│           │    LOOP      │                                                │
│           └──────────────┘                                                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Why This Matters

| Before                 | After                       |
| ---------------------- | --------------------------- |
| Same mistakes repeated | Patterns prevent recurrence |
| Opinions dominate      | Data drives decisions       |
| No accountability      | Weights reflect accuracy    |
| Debates stall          | Conflicts resolved formally |
| Incidents forgotten    | System learns from errors   |

---

## File Organizer Quality Gates

### Categorization Quality Gates

| Gate                     | Threshold       | Status |
| ------------------------ | --------------- | ------ |
| Categorization Accuracy  | ≥ 90%           | ✅/❌  |
| Sensitive File Detection | 100%            | ✅/❌  |
| Processing Speed         | > 500 files/min | ✅/❌  |
| Memory Usage             | < 300MB         | ✅/❌  |

### Duplicate Detection Quality Gates

| Gate                     | Threshold       | Status |
| ------------------------ | --------------- | ------ |
| Duplicate Detection Rate | ≥ 95%           | ✅/❌  |
| False Positive Rate      | < 2%            | ✅/❌  |
| Processing Speed         | > 300 files/min | ✅/❌  |

---

## File Organizer Metrics

### Performance Metrics

| Metric                     | Target       | Description                 |
| -------------------------- | ------------ | --------------------------- |
| Files Processed per Minute | > 500        | Throughput                  |
| Memory Usage               | < 300MB      | Peak consumption            |
| Response Time              | < 50ms/file  | Average per-file processing |
| Categorization Time        | < 100ms/file | Content analysis duration   |

### Quality Metrics

| Metric                       | Target | Description                  |
| ---------------------------- | ------ | ---------------------------- |
| Categorization Accuracy      | ≥ 90%  | Correct category assignments |
| Duplicate Detection Accuracy | ≥ 95%  | True duplicates identified   |
| False Positive Rate          | < 2%   | Incorrect duplicate matches  |
| Sensitive File Detection     | 100%   | All sensitive files flagged  |

---

## Framework Version

| Version | Date       | Changes                              |
| ------- | ---------- | ------------------------------------ |
| 1.0     | 2026-02-09 | Initial framework                    |
| 1.1     | 2026-02-09 | Added Post-Mortem Phase 5            |
| 1.2     | 2026-02-09 | Enhanced voting & weighted consensus |
| 1.3     | 2026-02-11 | File Organizer MCP integration       |

---

## Contributing

To extend this framework:

1. **Add Workflows** → Create `workflows/new-workflow.md`
2. **Add Agents** → Update `NEW-AGENTS.md`
3. **Improve Patterns** → Extend `borzoi.md`
4. **Fix Issues** → Update `troubleshooting/`

---

_Framework generated from Multi-Shepherd Debate System_
