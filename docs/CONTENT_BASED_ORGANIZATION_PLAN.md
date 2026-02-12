# Content-Based Organization Plan

## Overview

This document outlines the planned implementation of **content-based file organization** - a system that reads and analyzes file contents to intelligently organize files beyond simple type-based categorization.

## Current State (Type-Based Organization)

```
/downloads/
├── Audio/          ← All music files
├── Documents/      ← All documents
├── Images/         ← All images
└── Videos/         ← All videos
```

## Target State (Content-Based Organization)

```
/downloads/
├── Music/
│   ├── Hip Hop/
│   │   ├── Drake/
│   │   │   └── Views/
│   │   └── Snoop Dogg/
│   │       └── Doggystyle/
│   └── Pop/
│       └── Taylor Swift/
├── Documents/
│   ├── Education/
│   │   ├── Mathematics/
│   │   │   └── Linear Algebra/
│   │   │       ├── linear_algebra_basics.pdf
│   │   │       ├── matrix_operations.docx
│   │   │       └── eigenvectors_notes.txt
│   │   └── History/
│   │       └── napoleon_history.pdf
│   └── Work/
│       └── Projects/
└── Photos/
    ├── 2024/
    │   └── Summer Vacation/
    └── 2023/
```

## Implementation Phases

### Phase 1: Document Content Analysis ✅ (Foundation Ready)

**Goal:** Analyze text documents to extract topics and subjects.

**Technical Approach:**
1. **Text Extraction Pipeline**
   - PDF: Use `pdf-parse` or `pdf-text-extract`
   - DOCX: Use `mammoth`
   - TXT/MD: Direct read
   - Code files: Parse comments and docstrings

2. **Content Analysis Service**
```typescript
export class DocumentAnalyzerService {
  async analyzeDocument(filePath: string): Promise<DocumentAnalysis> {
    const text = await this.extractText(filePath);
    return {
      topics: this.extractTopics(text),
      keywords: this.extractKeywords(text),
      documentType: this.classifyDocumentType(text),
      language: this.detectLanguage(text),
      summary: this.generateSummary(text),
    };
  }
}
```

3. **Topic Extraction**
   - Use keyword matching for common subjects (Math, History, Science, etc.)
   - TF-IDF for important term extraction
   - Simple heuristic rules for document classification

**Example Results:**
| File | Detected Topics | Document Type |
|------|----------------|---------------|
| linear_algebra_basics.pdf | Mathematics, Linear Algebra, Education | Educational |
| napoleon_history.pdf | History, Napoleon, France, Military | Historical |
| project_proposal.docx | Business, Proposal, Project | Business |

### Phase 2: Music Content Analysis ✅ (Partially Implemented)

**Goal:** Organize music by genre, mood, and artist relationships.

**Current Implementation:**
- ✅ Artist/Album organization via `AudioMetadataService`
- ✅ Basic metadata extraction (ID3 tags)

**Future Enhancements:**
1. **Genre Classification**
   - Use audio fingerprinting (AcoustID/AcousticBrainz)
   - BPM detection
   - Key detection

2. **Mood Analysis**
   - Audio feature extraction (energy, valence, danceability)
   - Categorize as: Energetic, Chill, Focus, Workout, etc.

3. **Artist Relationship Mapping**
   - Group by collaborations
   - Similar artists suggestions

**Organization Structure:**
```
Music/
├── By Genre/
│   ├── Hip Hop/
│   │   ├── Drake/
│   │   └── Snoop Dogg/
│   └── Pop/
├── By Mood/
│   ├── Energetic/
│   ├── Chill/
│   └── Focus/
└── By Artist/ (current implementation)
```

<!--
### Phase 3: Image Content Analysis 📝 (IGNORED - Too Complex for Now)

**Status:** This phase is intentionally deferred due to complexity.
**Reason:** Requires ML models, significant processing power, and privacy considerations.

**Original Plan (for future reference):**
**Goal:** Organize photos by content, not just dates.

**Technical Approach:**
1. **Object Detection**
   - Use TensorFlow.js or similar for local processing
   - Detect: People, Pets, Vehicles, Buildings, Nature, Documents, etc.

2. **Face Recognition** (Optional, privacy-sensitive)
   - Group photos by people present
   - Requires explicit user consent

3. **Scene Classification**
   - Beach, Mountain, City, Indoor, Party, etc.

4. **Text in Images (OCR)**
   - Extract text from screenshots and documents

**Organization Structure:**
```
Photos/
├── By Date/ (current)
│   └── 2024/
│       └── Summer Vacation/
├── By Subject/
│   ├── People/
│   │   ├── Family/
│   │   └── Friends/
│   ├── Nature/
│   │   ├── Beaches/
│   │   └── Mountains/
│   └── Documents/ (Screenshots with text)
└── By Location/ (if GPS available)
```
-->

### Phase 3: Project/Context-Based Organization 📝 (Planned)

**Goal:** Detect related files across types and group by project.

**Example:**
```
Project_X_Website_Relaunch/ (detected project)
├── Design/
│   ├── logo_mockup.png
│   └── wireframe.pdf
├── Content/
│   ├── website_copy.docx
│   └── seo_keywords.txt
├── Code/
│   └── component_library.tsx
└── Research/
    └── competitor_analysis.pdf
```

**Detection Methods:**
- Common naming patterns
- Shared keywords across files
- Temporal clustering (files created together)
- Explicit project markers in content

<!-- 
### REMOVED: ML-Based Smart Suggestions

**Reason for Removal:** Violates security principles.

Learning from user behavior requires:
1. Storing patterns of user activity
2. Building predictive models based on user data
3. Potentially exposing sensitive organizational habits

This conflicts with our core security principle of minimal data retention 
and local-only processing without behavioral tracking.
-->

## Architecture Design

### Service Structure

```
src/services/content-analysis/
├── document-analyzer.service.ts      # Phase 1
├── music-analyzer.service.ts         # Phase 2 enhancements
├── project-detector.service.ts       # Phase 3
└── content-index.service.ts          # Search & retrieval
```

### Tool Integration

New tool: `organize_by_content`

```typescript
{
  directory: string,
  strategy: 'topic' | 'project' | 'mixed',
  include_media_metadata: boolean,
  create_project_folders: boolean,
  dry_run: boolean
}
```

### Configuration Options

```json
{
  "contentOrganization": {
    "documents": {
      "enabled": true,
      "depth": 3,
      "topics": ["Math", "Science", "History", "Business"],
      "min_confidence": 0.7
    },
    "music": {
      "enabled": true,
      "organize_by": ["artist", "genre", "mood"],
      "fetch_online_metadata": true
    }
  }
}
```

## Implementation Priorities

| Phase | Priority | Effort | Value |
|-------|----------|--------|-------|
| Phase 1: Document Analysis | 🔴 High | Medium | High |
| Phase 2: Music Enhancement | 🟡 Medium | Low | Medium |
| Phase 3: Project Detection | 🟡 Medium | High | High |

*Note: Image analysis (object detection, face recognition) and ML-based learning features are intentionally excluded due to complexity and security concerns.*

## Current Implementation Status

### ✅ Implemented
1. **Batch File Reader** - `batch_read_files` tool
   - Reads text content from documents
   - Reads metadata from media files
   - Provides LLM-friendly summary

2. **Music Metadata Extraction**
   - Artist/Album organization
   - ID3 tag parsing

3. **Content Analysis Foundation**
   - `ContentAnalyzerService` for file type detection
   - Security screening for suspicious files

### 🚧 In Progress
1. Document text extraction for major formats
2. Topic extraction heuristics

### 📝 Planned
1. Project detection algorithms
2. Keyword-based document classification

### ❌ Excluded
1. **Image content analysis** (object detection, face recognition) - Too complex
2. **ML-based user behavior learning** - Violates security principles

## Example Usage Flow

```typescript
// Step 1: Analyze folder contents
const analysis = await batch_read_files({
  directory: "/downloads",
  include_content: true,
  include_metadata: true
});

// Returns structured data about all files

// Step 2: Get organization suggestions (future tool)
const suggestions = await suggest_organization({
  directory: "/downloads",
  strategy: "content_based"
});

// Returns:
// {
//   "Music/Hip Hop/Drake/": ["song1.mp3", "song2.mp3"],
//   "Documents/Education/Math/": ["linear_algebra.pdf", ...],
//   "Projects/Website Redesign/": ["logo.png", "proposal.docx", ...]
// }

// Step 3: Apply organization
await organize_by_content({
  directory: "/downloads",
  suggestions: suggestions,
  dry_run: false
});
```

## Privacy & Security Considerations

1. **Local Processing**: All content analysis happens locally - no data sent to cloud
2. **Opt-in Features**: Online metadata fetching requires explicit consent
3. **Content Screening**: Suspicious files (executables disguised as documents) are quarantined
4. **Sensitive Data**: Documents with keywords like "password", "secret", "confidential" get special handling
5. **No Behavioral Tracking**: We don't learn from user patterns (no ML-based suggestions)

## Conclusion

This plan provides a roadmap for evolving from type-based to intelligent content-based organization. The foundation is already in place with the batch reader and metadata services.

**Immediate focus:** Phase 1 (Document Analysis) - extracting topics from text documents for smart folder organization.

**Security-first approach:** ML-based learning and image analysis features are excluded to maintain our commitment to privacy and simplicity.
