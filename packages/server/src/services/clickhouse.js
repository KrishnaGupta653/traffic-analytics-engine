/**
 * ClickHouse Service - High-Volume Event Logging
 * FIXED: Using @clickhouse/client (correct library)
 * 
 * CRITICAL FIXES:
 * 1. Replaced deprecated 'clickhouse' with '@clickhouse/client'
 * 2. Fixed IP address handling (IPv4 to integer)
 * 3. Added proper error recovery
 * 4. Fixed SQL injection vulnerabilities
 * 5. Added query parameterization
 */

const { createClient } = require('@clickhouse/client');

class ClickHouseService {
  constructor(config = {}) {
    // SECURITY: Never log connection details
    this.client = createClient({
      host: config.url || process.env.CLICKHOUSE_URL || 'http://localhost:8123',
      database: config.database || process.env.CLICKHOUSE_DB || 'traffic_analytics',
      compression: {
        request: true,
        response: true
      },
      // PERFORMANCE: Set timeouts
      request_timeout: 30000,
      max_open_connections: 10
    });

    this.database = config.database || 'traffic_analytics';
    this.batchSize = config.batchSize || 100;
    this.flushInterval = config.flushInterval || 5000;

    // MEMORY LEAK FIX: Cap queue size
    this.MAX_QUEUE_SIZE = 10000;
    this.eventQueue = [];
    this.flushTimer = null;
    this.isShuttingDown = false;

    this.startFlushTimer();
    console.log('[ClickHouse] Service initialized');
  }

  /**
   * Log single event with validation
   */
  async logEvent(event) {
    if (this.isShuttingDown) {
      console.warn('[ClickHouse] Rejecting event during shutdown');
      return;
    }

    // MEMORY LEAK FIX: Prevent unbounded queue growth
    if (this.eventQueue.length >= this.MAX_QUEUE_SIZE) {
      console.error('[ClickHouse] Queue full, dropping event');
      return;
    }

    const row = this.formatEventRow(event);
    this.eventQueue.push(row);

    if (this.eventQueue.length >= this.batchSize) {
      await this.flush();
    }
  }

  /**
   * Format and VALIDATE event data
   */
  formatEventRow(event) {
    // VALIDATION: Ensure required fields exist
    if (!event.sessionHash || typeof event.sessionHash !== 'string') {
      throw new Error('Invalid session hash');
    }

    return {
      // SECURITY: Sanitize all inputs
      session_hash: String(event.sessionHash).substring(0, 64),
      event_type: String(event.eventType || event.type || 'unknown').substring(0, 50),
      timestamp: event.timestamp ? new Date(event.timestamp) : new Date(),
      
      // IP handling with validation
      ip_address: this.ipToInt(event.ipAddress || '0.0.0.0'),
      user_agent: String(event.userAgent || '').substring(0, 500),
      
      // GeoIP with bounds checking
      country: String(event.country || event.geoip?.country || '').substring(0, 2),
      city: String(event.city || event.geoip?.city || '').substring(0, 100),
      isp: String(event.isp || '').substring(0, 255),
      latitude: this.clampFloat(event.latitude || event.geoip?.latitude || 0, -90, 90),
      longitude: this.clampFloat(event.longitude || event.geoip?.longitude || 0, -180, 180),
      
      // Device metadata with validation
      screen_width: this.clampInt(event.screenWidth || event.metadata?.screenWidth || 0, 0, 10000),
      screen_height: this.clampInt(event.screenHeight || event.metadata?.screenHeight || 0, 0, 10000),
      timezone: String(event.timezone || event.metadata?.timezone || 'Unknown').substring(0, 50),
      network_type: String(event.networkType || event.metadata?.networkType || 'unknown').substring(0, 20),
      battery_level: this.clampInt(event.batteryLevel || event.metadata?.batteryLevel, 0, 100, true),
      
      // Interaction data
      interaction_type: String(event.interactionType || '').substring(0, 50),
      element_tag: event.element?.tag ? String(event.element.tag).substring(0, 50) : null,
      element_id: event.element?.id ? String(event.element.id).substring(0, 100) : null,
      element_class: event.element?.class ? String(event.element.class).substring(0, 200) : null,
      page_url: String(event.pageUrl || '').substring(0, 1000),
      
      // Performance metrics
      latency_ms: this.clampInt(event.latencyMs || 0, 0, 60000),
      is_throttled: event.isThrottled ? 1 : 0,
      
      // Risk scoring
      risk_score: this.clampFloat(event.riskScore || 0, 0, 100),
      is_bot: event.isBot ? 1 : 0,
      
      // SECURITY: Sanitize JSON payload
      payload: JSON.stringify(event.payload || {}).substring(0, 10000)
    };
  }

  /**
   * SECURITY: Validate and convert IP to integer
   */
  ipToInt(ip) {
    if (!ip || ip === '0.0.0.0') return 0;
    
    // IPv4 validation regex
    const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const match = ip.match(ipv4Regex);
    
    if (!match) return 0;
    
    const parts = match.slice(1).map(Number);
    
    // Validate octets are 0-255
    if (parts.some(p => p < 0 || p > 255)) return 0;
    
    return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
  }

  /**
   * Clamp integer values
   */
  clampInt(value, min, max, nullable = false) {
    if (nullable && (value === null || value === undefined)) return null;
    const num = parseInt(value, 10);
    if (isNaN(num)) return nullable ? null : min;
    return Math.max(min, Math.min(max, num));
  }

  /**
   * Clamp float values
   */
  clampFloat(value, min, max) {
    const num = parseFloat(value);
    if (isNaN(num)) return 0;
    return Math.max(min, Math.min(max, num));
  }

  /**
   * Flush with error recovery
   */
  async flush() {
    if (this.eventQueue.length === 0) return;

    const batch = [...this.eventQueue];
    this.eventQueue = [];

    try {
      await this.client.insert({
        table: 'events',
        values: batch,
        format: 'JSONEachRow'
      });

      console.log(`[ClickHouse] ✓ Flushed ${batch.length} events`);
    } catch (error) {
      console.error('[ClickHouse] ✗ Flush error:', error.message);
      
      // ERROR RECOVERY: Re-queue up to 1000 failed events
      if (this.eventQueue.length < 1000) {
        this.eventQueue.unshift(...batch.slice(0, 1000 - this.eventQueue.length));
        console.log(`[ClickHouse] Re-queued ${Math.min(batch.length, 1000)} events`);
      } else {
        console.error(`[ClickHouse] DROPPED ${batch.length} events - queue full`);
      }
    }
  }

  /**
   * Start flush timer with error handling
   */
  startFlushTimer() {
    this.flushTimer = setInterval(async () => {
      try {
        await this.flush();
      } catch (error) {
        console.error('[ClickHouse] Timer flush error:', error);
      }
    }, this.flushInterval);
  }

  /**
   * SECURITY FIX: Use parameterized queries
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
        any(IPv4NumToString(ip_address)) as ip_address
      FROM events
      WHERE timestamp >= now() - INTERVAL {minutes:UInt8} MINUTE
      GROUP BY session_hash
      ORDER BY last_seen DESC
    `;

    try {
      const resultSet = await this.client.query({
        query,
        query_params: { minutes: Math.min(Math.max(1, minutesAgo), 1440) }, // Clamp 1-1440
        format: 'JSONEachRow'
      });
      return await resultSet.json();
    } catch (error) {
      console.error('[ClickHouse] Query error:', error.message);
      return [];
    }
  }

  /**
   * Geographic distribution with params
   */
  async getGeographicDistribution(hoursAgo = 24) {
    const query = `
      SELECT 
        country,
        city,
        count() as events,
        uniq(session_hash) as sessions,
        avg(latency_ms) as avg_latency
      FROM events
      WHERE timestamp >= now() - INTERVAL {hours:UInt16} HOUR
      GROUP BY country, city
      ORDER BY events DESC
      LIMIT 100
    `;

    try {
      const resultSet = await this.client.query({
        query,
        query_params: { hours: Math.min(Math.max(1, hoursAgo), 720) },
        format: 'JSONEachRow'
      });
      return await resultSet.json();
    } catch (error) {
      console.error('[ClickHouse] Query error:', error.message);
      return [];
    }
  }

  /**
   * Bot detection with params
   */
  async getBotCandidates(hoursAgo = 1) {
    const query = `
      SELECT 
        session_hash,
        count() as event_count,
        uniq(event_type) as unique_events,
        avg(latency_ms) as avg_latency,
        sum(is_throttled) as throttle_count,
        any(IPv4NumToString(ip_address)) as ip_address,
        any(city) as city
      FROM events
      WHERE timestamp >= now() - INTERVAL {hours:UInt8} HOUR
      GROUP BY session_hash
      HAVING event_count > 100 AND unique_events < 3
      ORDER BY event_count DESC
      LIMIT 50
    `;

    try {
      const resultSet = await this.client.query({
        query,
        query_params: { hours: Math.min(Math.max(1, hoursAgo), 24) },
        format: 'JSONEachRow'
      });
      return await resultSet.json();
    } catch (error) {
      console.error('[ClickHouse] Query error:', error.message);
      return [];
    }
  }

  /**
   * Session timeline with SECURITY
   */
  async getSessionTimeline(sessionHash, limit = 100) {
    // SECURITY: Validate session hash format
    if (!/^[a-f0-9]{64}$/.test(sessionHash)) {
      throw new Error('Invalid session hash format');
    }

    const query = `
      SELECT 
        timestamp,
        event_type,
        interaction_type,
        page_url,
        latency_ms,
        is_throttled
      FROM events
      WHERE session_hash = {hash:String}
      ORDER BY timestamp DESC
      LIMIT {limit:UInt16}
    `;

    try {
      const resultSet = await this.client.query({
        query,
        query_params: {
          hash: sessionHash,
          limit: Math.min(Math.max(1, limit), 1000)
        },
        format: 'JSONEachRow'
      });
      return await resultSet.json();
    } catch (error) {
      console.error('[ClickHouse] Query error:', error.message);
      return [];
    }
  }

  /**
   * Analytics summary
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
      FROM events
      WHERE timestamp >= now() - INTERVAL {hours:UInt16} HOUR
    `;

    try {
      const resultSet = await this.client.query({
        query,
        query_params: { hours: Math.min(Math.max(1, hoursAgo), 720) },
        format: 'JSONEachRow'
      });
      const result = await resultSet.json();
      return result[0] || {};
    } catch (error) {
      console.error('[ClickHouse] Query error:', error.message);
      return {};
    }
  }

  /**
   * Log command execution
   */
  async logCommandExecution(command) {
    const row = {
      command_id: command.commandId,
      timestamp: new Date(),
      session_hash: String(command.sessionHash || '').substring(0, 64),
      command_type: String(command.commandType).substring(0, 50),
      admin_id: String(command.adminId || '').substring(0, 100),
      admin_ip: this.ipToInt(command.adminIp || '0.0.0.0'),
      command_payload: JSON.stringify(command.commandPayload || {}).substring(0, 5000),
      execution_status: String(command.status || 'pending').substring(0, 20),
      error_message: command.errorMessage ? String(command.errorMessage).substring(0, 500) : null
    };

    try {
      await this.client.insert({
        table: 'command_log',
        values: [row],
        format: 'JSONEachRow'
      });
    } catch (error) {
      console.error('[ClickHouse] Failed to log command:', error.message);
    }
  }

  /**
   * Log rate violation
   */
  async logRateViolation(violation) {
    const row = {
      timestamp: new Date(),
      session_hash: String(violation.sessionHash).substring(0, 64),
      ip_address: this.ipToInt(violation.ipAddress),
      events_per_second: this.clampFloat(violation.eventsPerSecond, 0, 10000),
      threshold_exceeded: this.clampFloat(violation.thresholdExceeded, 0, 10000),
      auto_throttled: 1
    };

    try {
      await this.client.insert({
        table: 'rate_limit_violations',
        values: [row],
        format: 'JSONEachRow'
      });
    } catch (error) {
      console.error('[ClickHouse] Failed to log violation:', error.message);
    }
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const resultSet = await this.client.query({
        query: 'SELECT 1 as ok',
        format: 'JSONEachRow'
      });
      const result = await resultSet.json();
      return { healthy: true, result };
    } catch (error) {
      return { healthy: false, error: error.message };
    }
  }

  /**
   * Graceful shutdown
   */
  async close() {
    console.log('[ClickHouse] Shutting down...');
    this.isShuttingDown = true;

    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    // Flush remaining events
    await this.flush();

    await this.client.close();
    console.log('[ClickHouse] Shutdown complete');
  }
}

module.exports = ClickHouseService;