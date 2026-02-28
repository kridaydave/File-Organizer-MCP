/**
 * File Organizer MCP Server v3.4.1
 * Rate Limiter Service
 */

interface RequestRecord {
  timestamps: number[];
}

export class RateLimiter {
  private requests: Map<string, RequestRecord> = new Map();
  private readonly MAX_IDENTIFIERS = 10000;
  private lastCleanup = Date.now();
  private readonly CLEANUP_INTERVAL = 60 * 1000; // 1 minute

  constructor(
    private maxRequestsPerMinute: number = 60,
    private maxRequestsPerHour: number = 500,
  ) {}

  private cleanupOldIdentifiers(now: number): void {
    if (now - this.lastCleanup < this.CLEANUP_INTERVAL) {
      return;
    }

    const oneHourAgo = now - 60 * 60 * 1000;
    for (const [identifier, record] of this.requests) {
      const hasRecentRequests = record.timestamps.some((t) => t > oneHourAgo);
      if (!hasRecentRequests) {
        this.requests.delete(identifier);
      }
    }

    // If still over limit after cleanup, remove oldest entries
    if (this.requests.size > this.MAX_IDENTIFIERS) {
      const entries = Array.from(this.requests.entries());
      entries.sort((a, b) => {
        const aTime = a[1].timestamps[0] || 0;
        const bTime = b[1].timestamps[0] || 0;
        return aTime - bTime;
      });
      const toRemove = entries.slice(
        0,
        this.requests.size - this.MAX_IDENTIFIERS,
      );
      for (const [identifier] of toRemove) {
        this.requests.delete(identifier);
      }
    }

    this.lastCleanup = now;
  }

  checkLimit(identifier: string): { allowed: boolean; resetIn?: number } {
    const now = Date.now();
    this.cleanupOldIdentifiers(now);

    // Enforce max identifiers limit
    if (
      !this.requests.has(identifier) &&
      this.requests.size >= this.MAX_IDENTIFIERS
    ) {
      return { allowed: false, resetIn: 60 };
    }

    const record = this.requests.get(identifier) || { timestamps: [] };

    // Clean old requests (older than 1 hour)
    const oneHourAgo = now - 60 * 60 * 1000;
    const recentRequests = record.timestamps.filter((t) => t > oneHourAgo);

    // Check per minute
    const oneMinuteAgo = now - 60 * 1000;
    const lastMinuteRequests = recentRequests.filter((t) => t > oneMinuteAgo);

    if (lastMinuteRequests.length >= this.maxRequestsPerMinute) {
      const oldestInMinute = lastMinuteRequests[0];
      if (oldestInMinute !== undefined) {
        const resetIn = Math.ceil((oldestInMinute + 60 * 1000 - now) / 1000);
        return { allowed: false, resetIn };
      }
    }

    // Check per hour
    if (recentRequests.length >= this.maxRequestsPerHour) {
      const oldestInHour = recentRequests[0];
      if (oldestInHour !== undefined) {
        const resetIn = Math.ceil((oldestInHour + 3600 * 1000 - now) / 1000);
        return { allowed: false, resetIn };
      }
    }

    // Record new request
    recentRequests.push(now);
    this.requests.set(identifier, { timestamps: recentRequests });

    return { allowed: true };
  }
}
