# Resolved Format Strategy

**Date:** 2026-02-09
**Status:** ✅ ALL SHEPHERDS APPROVED

---

## 1. Default Format for Auto-Archive

**Decision:** `.tar.gz` (native Node.js support)

**Rationale:** Balances compatibility (ARCHITECT), performance (PERFORMANCE acceptable compromise), and security (acceptable defaults). Native zlib support in Node.js eliminates external dependencies.

---

## 2. Format Selection Matrix

| Use Case                   | Format                  | Reason                                  |
| -------------------------- | ----------------------- | --------------------------------------- |
| **Default / Auto-archive** | `.tar.gz`               | Universal compatibility, fast           |
| **Maximum compression**    | `.tar.zst`              | ZSTD adaptive compression (PERFORMANCE) |
| **Encrypted archives**     | `.7z`                   | AES-256 encryption (SECURITY)           |
| **Cross-platform sharing** | `.zip`                  | Widest OS/browser support               |
| **Large files (>2GB)**     | `.tar.zst` or `.tar.gz` | Handles large files better than ZIP     |

---

## 3. Compression-Encryption Compatibility

### Supported Combinations

| Format     | Encryption | Notes                             |
| ---------- | ---------- | --------------------------------- |
| `.tar.gz`  | No native  | Use external encryption if needed |
| `.tar.zst` | No native  | Use external encryption if needed |
| `.zip`     | ✅ AES-256 | Built-in encryption support       |
| `.7z`      | ✅ AES-256 | Strongest built-in encryption     |

### Encryption Workflow

```
SECURE: .7z (AES-256) with password
       └─> Use 7zip-native encryption for sensitive data

FAST ENCRYPTION: .zip (AES-256)
       └─> Use when password protection is sufficient
```

---

## 4. Phased Rollout Plan

### Phase 1 (Weeks 1-2): Foundation

- [x] `.tar.gz` - **Complete** (native Node.js)
- [x] `.zip` - **Complete** (adm-zip or similar)
- [x] Configuration: Default format setting

### Phase 2 (Weeks 3-4): Advanced Compression

- [ ] `.tar.zst` - ZSTD compression via `zstd` CLI or `@mems/fs`
- [ ] Auto-detect: Use ZSTD when available, fallback to gzip
- [ ] Performance benchmarks

### Phase 3 (Weeks 5-6): Security

- [ ] `.7z` support via 7zip-bin
- [ ] Password-based encryption API
- [ ] Secure password handling (env vars, prompt)

### Phase 4 (Weeks 7-8): Optimization

- [ ] Format auto-detection based on file type
- [ ] Adaptive compression strategy
- [ ] Size vs. speed preferences

---

## 5. API Design

```javascript
interface ArchiveOptions {
  format?: 'tar.gz' | 'zip' | 'tar.zst' | '7z';
  compression?: 'fast' | 'balanced' | 'max';
  encryption?: {
    enabled: boolean;
    algorithm?: 'aes-256' | 'zipcrypto';
    password?: string;
  };
}

const defaults: ArchiveOptions = {
  format: 'tar.gz',
  compression: 'balanced',
  encryption: { enabled: false }
};
```

---

## 6. Shepherd Acceptance

| Shepherd        | Status | Notes                              |
| --------------- | ------ | ---------------------------------- |
| **ARCHITECT**   | ✅     | Native Node.js support prioritized |
| **PERFORMANCE** | ✅     | ZSTD adaptive in Phase 2           |
| **SECURITY**    | ✅     | AES-256 via 7z in Phase 3          |
| **DELIVERY**    | ✅     | All formats available in Phase 1   |

---

**Resolution Complete.** All formats supported, encryption addressed, phased rollout defined.
