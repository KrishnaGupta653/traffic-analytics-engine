/**
 * PostgreSQL Service - Session State Management
 * Handles transactional session data and admin actions
 */

const { Pool } = require("pg");

class PostgresService {
  constructor(config = {}) {
    this.pool = new Pool({
      host: config.host || process.env.POSTGRES_HOST || "localhost",
      port: config.port || process.env.POSTGRES_PORT || 5432,
      database:
        config.database || process.env.POSTGRES_DB || "traffic_analytics",
      user: config.user || process.env.POSTGRES_USER || "postgres",
      password: config.password || process.env.POSTGRES_PASSWORD || "",
      max: config.maxConnections || 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    this.pool.on("error", (err) => {
      console.error("[Postgres] Unexpected error on idle client", err);
    });

    console.log("[Postgres] Service initialized");
  }

  /**
   * Upsert session (insert or update)
   */
  // async upsertSession(session) {
  //   const query = `
  //     INSERT INTO sessions (
  //       session_hash, ip_address, user_agent, country_code, city,
  //       isp, latitude, longitude, screen_width, screen_height,
  //       timezone, network_type, battery_level, connected
  //     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, true)
  //     ON CONFLICT (session_hash)
  //     DO UPDATE SET
  //       last_seen = NOW(),
  //       connected = true,
  //       ip_address = EXCLUDED.ip_address,
  //       battery_level = EXCLUDED.battery_level
  //     RETURNING session_id
  //   `;

  //   const values = [
  //     session.sessionHash,
  //     session.ipAddress,
  //     session.userAgent || null,
  //     session.country || null,
  //     session.city || null,
  //     session.isp || null,
  //     session.latitude || null,
  //     session.longitude || null,
  //     session.screenWidth || null,
  //     session.screenHeight || null,
  //     session.timezone || null,
  //     session.networkType || null,
  //     session.batteryLevel || null
  //   ];

  //   try {
  //     const result = await this.pool.query(query, values);
  //     return result.rows[0];
  //   } catch (error) {
  //     console.error('[Postgres] Upsert session error:', error);
  //     throw error;
  //   }
  // }
  /**
   * Upsert session (insert or update) with graceful degradation
   */
  async upsertSession(session) {
    const query = `
    INSERT INTO sessions (
      session_hash, ip_address, user_agent, country_code, city,
      isp, latitude, longitude, screen_width, screen_height,
      timezone, network_type, battery_level, connected
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, true)
    ON CONFLICT (session_hash)
    DO UPDATE SET
      last_seen = NOW(),
      connected = true,
      ip_address = EXCLUDED.ip_address,
      battery_level = EXCLUDED.battery_level
    RETURNING session_id
  `;

    const values = [
      session.sessionHash,
      session.ipAddress,
      session.userAgent || null,
      session.country || null,
      session.city || null,
      session.isp || null,
      session.latitude || null,
      session.longitude || null,
      session.screenWidth || null,
      session.screenHeight || null,
      session.timezone || null,
      session.networkType || null,
      session.batteryLevel || null,
    ];

    try {
      const result = await this.pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error("[Postgres] Upsert session error:", error.message);
      // GRACEFUL DEGRADATION: Return null instead of crashing
      // The system continues working with in-memory state only
      return null;
    }
  }

  /**
   * Update session status with non-blocking error handling
   */
  async updateSessionStatus(sessionHash, connected) {
    const query = `
    UPDATE sessions
    SET connected = $1, last_seen = NOW()
    WHERE session_hash = $2
  `;

    try {
      await this.pool.query(query, [connected, sessionHash]);
    } catch (error) {
      // SILENT FAILURE: This is non-critical, just log it
      console.error("[Postgres] Update session status error:", error.message);
    }
  }

  /**
   * Update session status (connected/disconnected)
   */
  async updateSessionStatus(sessionHash, connected) {
    const query = `
      UPDATE sessions
      SET connected = $1, last_seen = NOW()
      WHERE session_hash = $2
    `;

    try {
      await this.pool.query(query, [connected, sessionHash]);
    } catch (error) {
      console.error("[Postgres] Update session status error:", error);
    }
  }

  /**
   * Increment event count
   */
  async incrementEventCount(sessionHash, count = 1) {
    const query = `
      UPDATE sessions
      SET total_events = total_events + $1, last_seen = NOW()
      WHERE session_hash = $2
    `;

    try {
      await this.pool.query(query, [count, sessionHash]);
    } catch (error) {
      console.error("[Postgres] Increment event count error:", error);
    }
  }

  /**
   * Update session mode (normal/upspin/downspin/terminated)
   */
  async updateSessionMode(sessionHash, mode, latency = 0) {
    const query = `
      UPDATE sessions
      SET mode = $1, current_latency_ms = $2, updated_at = NOW()
      WHERE session_hash = $3
      RETURNING *
    `;

    try {
      const result = await this.pool.query(query, [mode, latency, sessionHash]);
      return result.rows[0];
    } catch (error) {
      console.error("[Postgres] Update session mode error:", error);
      throw error;
    }
  }

  /**
   * Update risk score
   */
  async updateRiskScore(sessionHash, riskScore, isBot = false) {
    const query = `
      UPDATE sessions
      SET risk_score = $1, is_bot = $2, updated_at = NOW()
      WHERE session_hash = $3
    `;

    try {
      await this.pool.query(query, [riskScore, isBot, sessionHash]);
    } catch (error) {
      console.error("[Postgres] Update risk score error:", error);
    }
  }

  /**
   * Increment rate limit violations
   */
  async incrementViolations(sessionHash) {
    const query = `
      UPDATE sessions
      SET 
        rate_limit_violations = rate_limit_violations + 1,
        last_violation_at = NOW()
      WHERE session_hash = $1
    `;

    try {
      await this.pool.query(query, [sessionHash]);
    } catch (error) {
      console.error("[Postgres] Increment violations error:", error);
    }
  }

  /**
   * Get active sessions
   */
  async getActiveSessions(minutesAgo = 5) {
    const query = `
      SELECT *
      FROM active_sessions
      WHERE seconds_since_last_event < $1
      ORDER BY last_seen DESC
    `;

    try {
      const result = await this.pool.query(query, [minutesAgo * 60]);
      return result.rows;
    } catch (error) {
      console.error("[Postgres] Get active sessions error:", error);
      return [];
    }
  }

  /**
   * Get session by hash
   */
  async getSession(sessionHash) {
    const query = `SELECT * FROM sessions WHERE session_hash = $1`;

    try {
      const result = await this.pool.query(query, [sessionHash]);
      return result.rows[0] || null;
    } catch (error) {
      console.error("[Postgres] Get session error:", error);
      return null;
    }
  }

  /**
   * Get high-risk sessions
   */
  async getHighRiskSessions() {
    const query = `SELECT * FROM high_risk_sessions LIMIT 100`;

    try {
      const result = await this.pool.query(query);
      return result.rows;
    } catch (error) {
      console.error("[Postgres] Get high-risk sessions error:", error);
      return [];
    }
  }

  /**
   * Log admin command
   */
  async logCommand(command) {
    const query = `
      INSERT INTO command_history (
        command_id, session_id, command_type, command_payload,
        admin_id, admin_ip, status
      )
      SELECT $1, session_id, $2, $3, $4, $5, $6
      FROM sessions WHERE session_hash = $7
      RETURNING *
    `;

    const values = [
      command.commandId,
      command.commandType,
      command.commandPayload || {},
      command.adminId || "system",
      command.adminIp || "127.0.0.1",
      command.status || "pending",
      command.sessionHash,
    ];

    try {
      const result = await this.pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error("[Postgres] Log command error:", error);
      throw error;
    }
  }

  /**
   * Update command status
   */
  async updateCommandStatus(commandId, status, result = null) {
    const query = `
      UPDATE command_history
      SET 
        status = $1,
        error_message = $2,
        acknowledged_at = NOW()
      WHERE command_id = $3
    `;

    try {
      await this.pool.query(query, [status, result?.error || null, commandId]);
    } catch (error) {
      console.error("[Postgres] Update command status error:", error);
    }
  }

  /**
   * Get command history for session
   */
  async getCommandHistory(sessionHash, limit = 50) {
    const query = `
      SELECT ch.*
      FROM command_history ch
      JOIN sessions s ON ch.session_id = s.session_id
      WHERE s.session_hash = $1
      ORDER BY ch.created_at DESC
      LIMIT $2
    `;

    try {
      const result = await this.pool.query(query, [sessionHash, limit]);
      return result.rows;
    } catch (error) {
      console.error("[Postgres] Get command history error:", error);
      return [];
    }
  }

  /**
   * Get dashboard statistics
   */
  async getDashboardStats() {
    const query = `SELECT * FROM dashboard_stats`;

    try {
      const result = await this.pool.query(query);
      return result.rows[0] || {};
    } catch (error) {
      console.error("[Postgres] Get dashboard stats error:", error);
      return {};
    }
  }

  /**
   * Refresh dashboard stats (materialized view)
   */
  async refreshDashboardStats() {
    try {
      await this.pool.query("SELECT refresh_dashboard_stats()");
    } catch (error) {
      console.error("[Postgres] Refresh dashboard stats error:", error);
    }
  }

  /**
   * Cleanup old sessions
   */
  async cleanupOldSessions(daysOld = 7) {
    try {
      const result = await this.pool.query("SELECT cleanup_old_sessions($1)", [
        daysOld,
      ]);
      return result.rows[0]?.cleanup_old_sessions || 0;
    } catch (error) {
      console.error("[Postgres] Cleanup error:", error);
      return 0;
    }
  }

  /**
   * Search sessions
   */
  async searchSessions(filters = {}) {
    let query = "SELECT * FROM sessions WHERE 1=1";
    const values = [];
    let paramCount = 1;

    if (filters.ipAddress) {
      query += ` AND ip_address = $${paramCount++}`;
      values.push(filters.ipAddress);
    }

    if (filters.country) {
      query += ` AND country_code = $${paramCount++}`;
      values.push(filters.country);
    }

    if (filters.minRiskScore !== undefined) {
      query += ` AND risk_score >= $${paramCount++}`;
      values.push(filters.minRiskScore);
    }

    if (filters.mode) {
      query += ` AND mode = $${paramCount++}`;
      values.push(filters.mode);
    }

    if (filters.isBot !== undefined) {
      query += ` AND is_bot = $${paramCount++}`;
      values.push(filters.isBot);
    }

    query += " ORDER BY last_seen DESC LIMIT 100";

    try {
      const result = await this.pool.query(query, values);
      return result.rows;
    } catch (error) {
      console.error("[Postgres] Search sessions error:", error);
      return [];
    }
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const result = await this.pool.query("SELECT NOW()");
      return { healthy: true, timestamp: result.rows[0].now };
    } catch (error) {
      return { healthy: false, error: error.message };
    }
  }

  /**
   * Close pool
   */
  async close() {
    await this.pool.end();
  }
}

module.exports = PostgresService;
