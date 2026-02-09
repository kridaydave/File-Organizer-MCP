/**
 * File Organizer MCP Server v3.2.0
 * Rate Limiter Service
 */

interface RequestRecord {
  timestamps: number[];
}

export class RateLimiter {
  private requests: Map<string, RequestRecord> = new Map();

  constructor(
    private maxRequestsPerMinute: number = 60,
    private maxRequestsPerHour: number = 500
  ) {}

  checkLimit(identifier: string): { allowed: boolean; resetIn?: number } {
    const now = Date.now();
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
