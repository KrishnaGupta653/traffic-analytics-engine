/**
 * ClickHouse Service - High-Volume Event Logging
 * Optimized for time-series analytics
 */

const { ClickHouse } = require('clickhouse');

class ClickHouseService {
  constructor(config = {}) {
    this.client = new ClickHouse({
      url: config.url || process.env.CLICKHOUSE_URL || 'http://localhost',
      port: config.port || process.env.CLICKHOUSE_PORT || 8123,
      debug: config.debug || false,
      basicAuth: config.basicAuth || null,
      isUseGzip: config.isUseGzip !== undefined ? config.isUseGzip : true,
      format: 'json',
      config: {
        database: config.database || process.env.CLICKHOUSE_DB || 'traffic_analytics'
      }
    });

    this.database = config.database || 'traffic_analytics';
    this.batchSize = config.batchSize || 100;
    this.flushInterval = config.flushInterval || 5000;

    // Event batch queue
    this.eventQueue = [];
    this.flushTimer = null;

    // Start flush timer
    this.startFlushTimer();

    console.log('[ClickHouse] Service initialized');
  }

  /**
   * Log single event
   */
  async logEvent(event) {
    const row = this.formatEventRow(event);
    this.eventQueue.push(row);

    // Flush if batch size reached
    if (this.eventQueue.length >= this.batchSize) {
      await this.flush();
    }
  }

  /**
   * Format event for ClickHouse
   */
  formatEventRow(event) {
    return {
      event_id: event.eventId || null,
      timestamp: event.timestamp ? new Date(event.timestamp) : new Date(),
      session_hash: event.sessionHash || '',
      event_type: event.eventType || event.type || 'unknown',
      
      ip_address: event.ipAddress || '0.0.0.0',
      user_agent: event.userAgent || '',
      
      country: event.country || event.geoip?.country || '',
      city: event.city || event.geoip?.city || '',
      isp: event.isp || '',
      latitude: event.latitude || event.geoip?.latitude || 0,
      longitude: event.longitude || event.geoip?.longitude || 0,
      
      screen_width: event.screenWidth || event.metadata?.screenWidth || 0,
      screen_height: event.screenHeight || event.metadata?.screenHeight || 0,
      timezone: event.timezone || event.metadata?.timezone || 'Unknown',
      network_type: event.networkType || event.metadata?.networkType || 'unknown',
      battery_level: event.batteryLevel || event.metadata?.batteryLevel || null,
      
      interaction_type: event.interactionType || '',
      element_tag: event.element?.tag || null,
      element_id: event.element?.id || null,
      element_class: event.element?.class || null,
      page_url: event.pageUrl || '',
      
      latency_ms: event.latencyMs || 0,
      is_throttled: event.isThrottled || 0,
      
      risk_score: event.riskScore || 0,
      is_bot: event.isBot || 0,
      
      payload: JSON.stringify(event.payload || {})
    };
  }

  /**
   * Flush event queue to ClickHouse
   */
  async flush() {
    if (this.eventQueue.length === 0) return;

    const batch = [...this.eventQueue];
    this.eventQueue = [];

    try {
      await this.client.insert(
        `INSERT INTO ${this.database}.events`,
        batch
      ).toPromise();

      console.log(`[ClickHouse] Flushed ${batch.length} events`);
    } catch (error) {
      console.error('[ClickHouse] Flush error:', error);
      // Re-queue failed events
      this.eventQueue.unshift(...batch);
    }
  }

  /**
   * Start automatic flush timer
   */
  startFlushTimer() {
    this.flushTimer = setInterval(async () => {
      await this.flush();
    }, this.flushInterval);
  }

  /**
   * Log command execution
   */
  async logCommandExecution(command) {
    const row = {
      command_id: command.commandId,
      timestamp: new Date(),
      session_hash: command.sessionHash || '',
      command_type: command.commandType,
      admin_id: command.adminId || '',
      admin_ip: command.adminIp || '0.0.0.0',
      command_payload: JSON.stringify(command.commandPayload || {}),
      execution_status: command.status || 'pending',
      error_message: command.errorMessage || null
    };

    try {
      await this.client.insert(
        `INSERT INTO ${this.database}.command_log`,
        [row]
      ).toPromise();
    } catch (error) {
      console.error('[ClickHouse] Failed to log command:', error);
    }
  }

  /**
   * Log rate limit violation
   */
  async logRateViolation(violation) {
    const row = {
      violation_id: null,
      timestamp: new Date(),
      session_hash: violation.sessionHash,
      ip_address: violation.ipAddress,
      events_per_second: violation.eventsPerSecond,
      threshold_exceeded: violation.thresholdExceeded,
      auto_throttled: 1
    };

    try {
      await this.client.insert(
        `INSERT INTO ${this.database}.rate_limit_violations`,
        [row]
      ).toPromise();
    } catch (error) {
      console.error('[ClickHouse] Failed to log violation:', error);
    }
  }

  /**
   * Query active sessions
   */
  async getActiveSessions(minutesAgo = 5) {
    const query = `
      SELECT 
        session_hash,
        max(timestamp) as last_seen,
        count() as event_count,
        avg(latency_ms) as avg_latency,
        any(city) as city,
        any(country) as country,
        max(risk_score) as risk_score,
        any(ip_address) as ip_address
      FROM ${this.database}.events
      WHERE timestamp >= now() - INTERVAL ${minutesAgo} MINUTE
      GROUP BY session_hash
      ORDER BY last_seen DESC
    `;

    try {
      const result = await this.client.query(query).toPromise();
      return result;
    } catch (error) {
      console.error('[ClickHouse] Query error:', error);
      return [];
    }
  }

  /**
   * Query geographic distribution
   */
  async getGeographicDistribution(hoursAgo = 24) {
    const query = `
      SELECT 
        country,
        city,
        count() as events,
        uniq(session_hash) as sessions,
        avg(latency_ms) as avg_latency
      FROM ${this.database}.events
      WHERE timestamp >= now() - INTERVAL ${hoursAgo} HOUR
      GROUP BY country, city
      ORDER BY events DESC
      LIMIT 100
    `;

    try {
      const result = await this.client.query(query).toPromise();
      return result;
    } catch (error) {
      console.error('[ClickHouse] Query error:', error);
      return [];
    }
  }

  /**
   * Query bot detection candidates
   */
  async getBotCandidates(hoursAgo = 1) {
    const query = `
      SELECT 
        session_hash,
        count() as event_count,
        uniq(event_type) as unique_events,
        avg(latency_ms) as avg_latency,
        sum(is_throttled) as throttle_count,
        any(ip_address) as ip_address,
        any(city) as city
      FROM ${this.database}.events
      WHERE timestamp >= now() - INTERVAL ${hoursAgo} HOUR
      GROUP BY session_hash
      HAVING event_count > 100 AND unique_events < 3
      ORDER BY event_count DESC
      LIMIT 50
    `;

    try {
      const result = await this.client.query(query).toPromise();
      return result;
    } catch (error) {
      console.error('[ClickHouse] Query error:', error);
      return [];
    }
  }

  /**
   * Query session timeline
   */
  async getSessionTimeline(sessionHash, limit = 100) {
    const query = `
      SELECT 
        timestamp,
        event_type,
        interaction_type,
        page_url,
        latency_ms,
        is_throttled
      FROM ${this.database}.events
      WHERE session_hash = '${sessionHash}'
      ORDER BY timestamp DESC
      LIMIT ${limit}
    `;

    try {
      const result = await this.client.query(query).toPromise();
      return result;
    } catch (error) {
      console.error('[ClickHouse] Query error:', error);
      return [];
    }
  }

  /**
   * Get analytics summary
   */
  async getAnalyticsSummary(hoursAgo = 24) {
    const query = `
      SELECT 
        count() as total_events,
        uniq(session_hash) as unique_sessions,
        avg(latency_ms) as avg_latency,
        sum(is_throttled) as throttled_events,
        sum(is_bot) as bot_events,
        uniq(country) as countries,
        uniq(city) as cities
      FROM ${this.database}.events
      WHERE timestamp >= now() - INTERVAL ${hoursAgo} HOUR
    `;

    try {
      const result = await this.client.query(query).toPromise();
      return result[0] || {};
    } catch (error) {
      console.error('[ClickHouse] Query error:', error);
      return {};
    }
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const result = await this.client.query('SELECT 1').toPromise();
      return { healthy: true, result };
    } catch (error) {
      return { healthy: false, error: error.message };
    }
  }

  /**
   * Close connection
   */
  async close() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    await this.flush();
  }
}

module.exports = ClickHouseService;