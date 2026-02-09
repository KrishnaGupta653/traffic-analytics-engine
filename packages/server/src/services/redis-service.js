/**
 * Redis Service - Pub/Sub and Caching
 * Handles real-time event streaming and session state caching
 */

const Redis = require('ioredis');

class RedisService {
  constructor(config = {}) {
    this.config = {
      host: config.host || process.env.REDIS_HOST || 'localhost',
      port: config.port || process.env.REDIS_PORT || 6379,
      password: config.password || process.env.REDIS_PASSWORD,
      db: config.db || 0,
      keyPrefix: config.keyPrefix || 'traffic:',
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      }
    };

    // Create Redis clients
    this.client = new Redis(this.config);
    this.subscriber = new Redis(this.config);
    this.publisher = new Redis(this.config);

    // Event handlers
    this.eventHandlers = new Map();

    // Setup subscriber
    this.setupSubscriber();

    // Connection events
    this.client.on('connect', () => {
      console.log('[Redis] Connected to Redis server');
    });

    this.client.on('error', (err) => {
      console.error('[Redis] Connection error:', err);
    });
  }

  /**
   * Setup Redis subscriber
   */
  setupSubscriber() {
    this.subscriber.on('message', (channel, message) => {
      this.handleMessage(channel, message);
    });

    this.subscriber.on('pmessage', (pattern, channel, message) => {
      this.handleMessage(channel, message, pattern);
    });
  }

  /**
   * Handle incoming Pub/Sub message
   */
  handleMessage(channel, message, pattern = null) {
    try {
      const data = JSON.parse(message);
      const handlers = this.eventHandlers.get(channel) || [];

      handlers.forEach(handler => {
        try {
          handler(data, channel, pattern);
        } catch (error) {
          console.error(`[Redis] Handler error for ${channel}:`, error);
        }
      });
    } catch (error) {
      console.error('[Redis] Failed to parse message:', error);
    }
  }

  /**
   * Subscribe to channel
   */
  async subscribe(channel, handler) {
    if (!this.eventHandlers.has(channel)) {
      this.eventHandlers.set(channel, []);
      await this.subscriber.subscribe(channel);
    }

    this.eventHandlers.get(channel).push(handler);
  }

  /**
   * Subscribe to pattern
   */
  async psubscribe(pattern, handler) {
    if (!this.eventHandlers.has(pattern)) {
      this.eventHandlers.set(pattern, []);
      await this.subscriber.psubscribe(pattern);
    }

    this.eventHandlers.get(pattern).push(handler);
  }

  /**
   * Publish message to channel
   */
  async publish(channel, data) {
    const message = JSON.stringify(data);
    await this.publisher.publish(channel, message);
  }

  /**
   * Store session state
   */
  async setSession(sessionHash, data, ttl = 3600) {
    const key = `${this.config.keyPrefix}session:${sessionHash}`;
    await this.client.setex(key, ttl, JSON.stringify(data));
  }

  /**
   * Get session state
   */
  async getSession(sessionHash) {
    const key = `${this.config.keyPrefix}session:${sessionHash}`;
    const data = await this.client.get(key);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Update session field
   */
  async updateSessionField(sessionHash, field, value) {
    const key = `${this.config.keyPrefix}session:${sessionHash}`;
    const session = await this.getSession(sessionHash);
    
    if (session) {
      session[field] = value;
      await this.setSession(sessionHash, session);
    }
  }

  /**
   * Delete session
   */
  async deleteSession(sessionHash) {
    const key = `${this.config.keyPrefix}session:${sessionHash}`;
    await this.client.del(key);
  }

  /**
   * Add event to stream
   */
  async addEventToStream(streamName, data) {
    const key = `${this.config.keyPrefix}stream:${streamName}`;
    await this.client.xadd(
      key,
      'MAXLEN', '~', '10000', // Keep last 10k events (approximate)
      '*', // Auto-generate ID
      'data', JSON.stringify(data)
    );
  }

  /**
   * Read from stream
   */
  async readStream(streamName, count = 100, lastId = '0') {
    const key = `${this.config.keyPrefix}stream:${streamName}`;
    const results = await this.client.xread('COUNT', count, 'STREAMS', key, lastId);
    
    if (!results) return [];

    return results[0][1].map(([id, fields]) => ({
      id,
      data: JSON.parse(fields[1])
    }));
  }

  /**
   * Increment counter
   */
  async increment(key, amount = 1) {
    const fullKey = `${this.config.keyPrefix}${key}`;
    return await this.client.incrby(fullKey, amount);
  }

  /**
   * Set with expiry
   */
  async setex(key, value, ttl = 3600) {
    const fullKey = `${this.config.keyPrefix}${key}`;
    await this.client.setex(fullKey, ttl, JSON.stringify(value));
  }

  /**
   * Get value
   */
  async get(key) {
    const fullKey = `${this.config.keyPrefix}${key}`;
    const value = await this.client.get(fullKey);
    try {
      return value ? JSON.parse(value) : null;
    } catch {
      return value;
    }
  }

  /**
   * Add to sorted set (for leaderboards, rankings)
   */
  async zadd(key, score, member) {
    const fullKey = `${this.config.keyPrefix}${key}`;
    await this.client.zadd(fullKey, score, member);
  }

  /**
   * Get top N from sorted set
   */
  async ztopn(key, n = 10) {
    const fullKey = `${this.config.keyPrefix}${key}`;
    return await this.client.zrevrange(fullKey, 0, n - 1, 'WITHSCORES');
  }

  /**
   * Add to set
   */
  async sadd(key, ...members) {
    const fullKey = `${this.config.keyPrefix}${key}`;
    await this.client.sadd(fullKey, ...members);
  }

  /**
   * Get all members of set
   */
  async smembers(key) {
    const fullKey = `${this.config.keyPrefix}${key}`;
    return await this.client.smembers(fullKey);
  }

  /**
   * Cache active sessions list
   */
  async cacheActiveSessions(sessions) {
    const key = `${this.config.keyPrefix}active:sessions`;
    await this.client.setex(key, 60, JSON.stringify(sessions));
  }

  /**
   * Get cached active sessions
   */
  async getCachedActiveSessions() {
    const key = `${this.config.keyPrefix}active:sessions`;
    const data = await this.client.get(key);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Track online session
   */
  async trackOnlineSession(sessionHash) {
    const key = `${this.config.keyPrefix}online`;
    await this.client.zadd(key, Date.now(), sessionHash);
    await this.client.expire(key, 300); // 5 minute TTL
  }

  /**
   * Get online sessions
   */
  async getOnlineSessions() {
    const key = `${this.config.keyPrefix}online`;
    const now = Date.now();
    const fiveMinutesAgo = now - 300000;
    
    // Remove old entries
    await this.client.zremrangebyscore(key, 0, fiveMinutesAgo);
    
    // Get active sessions
    return await this.client.zrange(key, 0, -1);
  }

  /**
   * Pub/Sub for real-time events
   */
  async publishEvent(eventType, data) {
    const channel = `${this.config.keyPrefix}events:${eventType}`;
    await this.publish(channel, {
      type: eventType,
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Subscribe to event type
   */
  async subscribeToEvents(eventType, handler) {
    const channel = `${this.config.keyPrefix}events:${eventType}`;
    await this.subscribe(channel, handler);
  }

  /**
   * Broadcast to all connected dashboards
   */
  async broadcastToDashboards(data) {
    await this.publishEvent('dashboard', data);
  }

  /**
   * Get statistics
   */
  async getStats() {
    const info = await this.client.info('stats');
    const dbsize = await this.client.dbsize();
    const memory = await this.client.info('memory');

    return {
      connected: this.client.status === 'ready',
      dbsize,
      info,
      memory
    };
  }

  /**
   * Flush all data (use with caution)
   */
  async flush() {
    await this.client.flushdb();
  }

  /**
   * Close connections
   */
  async close() {
    await this.client.quit();
    await this.subscriber.quit();
    await this.publisher.quit();
  }
}

module.exports = RedisService;