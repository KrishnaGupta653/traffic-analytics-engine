/**
 * Token Bucket Rate Limiter
 * Implements token bucket algorithm for WebSocket rate limiting
 */

class TokenBucket {
  constructor(capacity, refillRate, refillInterval = 1000) {
    this.capacity = capacity; // Maximum tokens
    this.tokens = capacity; // Current tokens
    this.refillRate = refillRate; // Tokens added per interval
    this.refillInterval = refillInterval; // Interval in ms
    this.lastRefill = Date.now();
  }

  /**
   * Refill tokens based on time elapsed
   */
  refill() {
    const now = Date.now();
    const timePassed = now - this.lastRefill;
    const intervalsElapsed = Math.floor(timePassed / this.refillInterval);

    if (intervalsElapsed > 0) {
      const tokensToAdd = intervalsElapsed * this.refillRate;
      this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }
  }

  /**
   * Try to consume tokens
   */
  tryConsume(tokens = 1) {
    this.refill();

    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }

    return false;
  }

  /**
   * Get current token count
   */
  getTokens() {
    this.refill();
    return this.tokens;
  }
}

class RateLimiter {
  constructor(options = {}) {
    this.options = {
      capacity: options.capacity || 10, // 10 tokens max
      refillRate: options.refillRate || 5, // 5 tokens per second
      refillInterval: options.refillInterval || 1000,
      maxEventsPerSecond: options.maxEventsPerSecond || 5,
      autoThrottle: options.autoThrottle !== undefined ? options.autoThrottle : true,
      throttleLatency: options.throttleLatency || 2000,
      banThreshold: options.banThreshold || 50, // Ban after 50 violations
      banDuration: options.banDuration || 300000, // 5 minutes
      ...options
    };

    // Store buckets per session/IP
    this.buckets = new Map();
    this.violations = new Map();
    this.bannedSessions = new Map();

    // Cleanup timer
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Get or create bucket for session
   */
  getBucket(sessionId) {
    if (!this.buckets.has(sessionId)) {
      this.buckets.set(sessionId, new TokenBucket(
        this.options.capacity,
        this.options.refillRate,
        this.options.refillInterval
      ));
    }
    return this.buckets.get(sessionId);
  }

  /**
   * Check if request is allowed
   */
  isAllowed(sessionId, cost = 1) {
    // Check if banned
    if (this.isBanned(sessionId)) {
      return {
        allowed: false,
        reason: 'banned',
        retryAfter: this.getBanTimeRemaining(sessionId)
      };
    }

    const bucket = this.getBucket(sessionId);
    const allowed = bucket.tryConsume(cost);

    if (!allowed) {
      this.recordViolation(sessionId);

      return {
        allowed: false,
        reason: 'rate_limit',
        tokensAvailable: bucket.getTokens(),
        retryAfter: this.calculateRetryAfter(bucket)
      };
    }

    return {
      allowed: true,
      tokensRemaining: bucket.getTokens()
    };
  }

  /**
   * Record rate limit violation
   */
  recordViolation(sessionId) {
    if (!this.violations.has(sessionId)) {
      this.violations.set(sessionId, {
        count: 0,
        firstViolation: Date.now(),
        lastViolation: Date.now()
      });
    }

    const violation = this.violations.get(sessionId);
    violation.count++;
    violation.lastViolation = Date.now();

    // Auto-ban if threshold exceeded
    if (violation.count >= this.options.banThreshold) {
      this.ban(sessionId, this.options.banDuration);
    }

    return violation;
  }

  /**
   * Get violation stats
   */
  getViolationStats(sessionId) {
    const violation = this.violations.get(sessionId);
    if (!violation) return null;

    const now = Date.now();
    const duration = now - violation.firstViolation;
    const eventsPerSecond = (violation.count / duration) * 1000;

    return {
      count: violation.count,
      eventsPerSecond,
      shouldThrottle: eventsPerSecond > this.options.maxEventsPerSecond,
      throttleLatency: this.options.throttleLatency
    };
  }

  /**
   * Ban a session
   */
  ban(sessionId, duration = this.options.banDuration) {
    this.bannedSessions.set(sessionId, {
      bannedAt: Date.now(),
      duration,
      reason: 'excessive_rate_limit_violations'
    });
  }

  /**
   * Check if session is banned
   */
  isBanned(sessionId) {
    const ban = this.bannedSessions.get(sessionId);
    if (!ban) return false;

    const now = Date.now();
    const elapsed = now - ban.bannedAt;

    if (elapsed >= ban.duration) {
      // Ban expired, remove it
      this.bannedSessions.delete(sessionId);
      return false;
    }

    return true;
  }

  /**
   * Get remaining ban time
   */
  getBanTimeRemaining(sessionId) {
    const ban = this.bannedSessions.get(sessionId);
    if (!ban) return 0;

    const now = Date.now();
    const elapsed = now - ban.bannedAt;
    return Math.max(0, ban.duration - elapsed);
  }

  /**
   * Unban a session
   */
  unban(sessionId) {
    this.bannedSessions.delete(sessionId);
    this.violations.delete(sessionId);
  }

  /**
   * Calculate retry-after time
   */
  calculateRetryAfter(bucket) {
    const tokensNeeded = 1;
    const intervalsNeeded = Math.ceil(tokensNeeded / this.options.refillRate);
    return intervalsNeeded * this.options.refillInterval;
  }

  /**
   * Reset bucket for session
   */
  reset(sessionId) {
    this.buckets.delete(sessionId);
    this.violations.delete(sessionId);
  }

  /**
   * Cleanup old entries
   */
  cleanup() {
    const now = Date.now();
    const maxAge = 3600000; // 1 hour

    // Clean up old buckets
    for (const [sessionId, bucket] of this.buckets.entries()) {
      const age = now - bucket.lastRefill;
      if (age > maxAge) {
        this.buckets.delete(sessionId);
      }
    }

    // Clean up old violations
    for (const [sessionId, violation] of this.violations.entries()) {
      const age = now - violation.lastViolation;
      if (age > maxAge) {
        this.violations.delete(sessionId);
      }
    }

    // Clean up expired bans
    for (const [sessionId, ban] of this.bannedSessions.entries()) {
      const elapsed = now - ban.bannedAt;
      if (elapsed >= ban.duration) {
        this.bannedSessions.delete(sessionId);
      }
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      activeBuckets: this.buckets.size,
      violatedSessions: this.violations.size,
      bannedSessions: this.bannedSessions.size,
      totalViolations: Array.from(this.violations.values())
        .reduce((sum, v) => sum + v.count, 0)
    };
  }

  /**
   * Destroy rate limiter
   */
  destroy() {
    clearInterval(this.cleanupInterval);
    this.buckets.clear();
    this.violations.clear();
    this.bannedSessions.clear();
  }
}

module.exports = RateLimiter;