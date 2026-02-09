/**
 * WebSocket Server - Real-Time Client Connection Handler
 * Handles telemetry streaming and remote commands
 */

const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const geoip = require('geoip-lite');
const RateLimiter = require('./rate-limiter');

class WebSocketServer {
  constructor(httpServer, redis, clickhouse, postgres) {
    this.redis = redis;
    this.clickhouse = clickhouse;
    this.postgres = postgres;

    // WebSocket server
    this.wss = new WebSocket.Server({ 
      server: httpServer,
      path: '/ws'
    });

    // Active connections
    this.connections = new Map();

    // Rate limiter
    this.rateLimiter = new RateLimiter({
      capacity: 20,
      refillRate: 5,
      maxEventsPerSecond: 5,
      autoThrottle: true,
      throttleLatency: 2000,
      banThreshold: 50,
      banDuration: 300000
    });

    // Setup WebSocket handlers
    this.setupWebSocketHandlers();

    // Subscribe to Redis commands
    this.subscribeToCommands();

    console.log('[WebSocket] Server initialized on /ws');
  }

  /**
   * Setup WebSocket connection handlers
   */
  setupWebSocketHandlers() {
    this.wss.on('connection', (ws, req) => {
      const clientIp = this.getClientIp(req);
      const connectionId = uuidv4();

      console.log(`[WebSocket] New connection: ${connectionId} from ${clientIp}`);

      // Store connection metadata
      const connection = {
        id: connectionId,
        ws,
        ip: clientIp,
        sessionHash: null,
        connectedAt: Date.now(),
        lastActivity: Date.now(),
        eventCount: 0
      };

      this.connections.set(connectionId, connection);

      // Handle incoming messages
      ws.on('message', async (data) => {
        await this.handleMessage(connectionId, data);
      });

      // Handle disconnection
      ws.on('close', () => {
        this.handleDisconnect(connectionId);
      });

      // Handle errors
      ws.on('error', (error) => {
        console.error(`[WebSocket] Error on ${connectionId}:`, error);
      });

      // Send welcome message
      this.sendToClient(ws, {
        type: 'connected',
        connectionId,
        timestamp: Date.now()
      });

      // Start ping/pong
      this.startPingPong(connectionId);
    });

    this.wss.on('error', (error) => {
      console.error('[WebSocket] Server error:', error);
    });
  }

  /**
   * Handle incoming message from client
   */
  async handleMessage(connectionId, data) {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    try {
      const message = JSON.parse(data.toString());
      connection.lastActivity = Date.now();

      // Extract session hash
      const sessionHash = message.sessionHash;
      if (!connection.sessionHash && sessionHash) {
        connection.sessionHash = sessionHash;
      }

      // Rate limiting
      const rateLimitResult = this.rateLimiter.isAllowed(sessionHash || connectionId);
      
      if (!rateLimitResult.allowed) {
        if (rateLimitResult.reason === 'banned') {
          this.sendToClient(connection.ws, {
            type: 'command',
            command: {
              type: 'TERMINATE',
              payload: { reason: 'Too many requests - temporarily banned' }
            }
          });
          connection.ws.close();
          return;
        }

        // Check if auto-throttle should trigger
        const stats = this.rateLimiter.getViolationStats(sessionHash);
        if (stats && stats.shouldThrottle) {
          // Auto-throttle
          await this.sendThrottleCommand(sessionHash, stats.throttleLatency);
          
          // Log violation
          await this.clickhouse.logRateViolation({
            sessionHash,
            ipAddress: connection.ip,
            eventsPerSecond: stats.eventsPerSecond,
            thresholdExceeded: this.rateLimiter.options.maxEventsPerSecond
          });

          // Update database
          await this.postgres.incrementViolations(sessionHash);
        }

        return;
      }

      // Route message by type
      switch (message.type) {
        case 'handshake':
          await this.handleHandshake(connection, message);
          break;
        case 'batch':
          await this.handleBatchEvents(connection, message);
          break;
        case 'interaction':
        case 'event':
          await this.handleEvent(connection, message);
          break;
        case 'pong':
          // Pong received, connection is alive
          break;
        case 'command_ack':
          await this.handleCommandAck(connection, message);
          break;
        default:
          console.warn(`[WebSocket] Unknown message type: ${message.type}`);
      }

      connection.eventCount++;

    } catch (error) {
      console.error('[WebSocket] Message handling error:', error);
    }
  }

  /**
   * Handle initial handshake
   */
  async handleHandshake(connection, message) {
    const { sessionHash, metadata } = message;

    // Enrich with GeoIP
    const geo = geoip.lookup(connection.ip);

    const sessionData = {
      sessionHash,
      ipAddress: connection.ip,
      userAgent: metadata.userAgent,
      country: geo?.country || null,
      city: geo?.city || null,
      isp: geo?.org || null,
      latitude: geo?.ll?.[0] || null,
      longitude: geo?.ll?.[1] || null,
      screenWidth: metadata.screenWidth,
      screenHeight: metadata.screenHeight,
      timezone: metadata.timezone,
      networkType: metadata.networkType,
      batteryLevel: metadata.batteryLevel
    };

    // Store in PostgreSQL
    await this.postgres.upsertSession(sessionData);

    // Cache in Redis
    await this.redis.trackOnlineSession(sessionHash);

    console.log(`[WebSocket] Handshake complete for session: ${sessionHash}`);
  }

  /**
   * Handle batch events
   */
  async handleBatchEvents(connection, message) {
    const { events, sessionHash } = message;

    if (!Array.isArray(events)) return;

    // Process each event
    for (const event of events) {
      const enrichedEvent = {
        ...event,
        sessionHash: sessionHash || connection.sessionHash,
        ipAddress: connection.ip,
        timestamp: event.timestamp || Date.now()
      };

      // Log to ClickHouse
      await this.clickhouse.logEvent(enrichedEvent);
    }

    // Update event count in PostgreSQL
    await this.postgres.incrementEventCount(sessionHash, events.length);

    // Calculate risk score
    const stats = this.rateLimiter.getViolationStats(sessionHash);
    if (stats) {
      const riskScore = this.calculateRiskScore(stats);
      await this.postgres.updateRiskScore(sessionHash, riskScore, riskScore > 80);
    }
  }

  /**
   * Handle single event
   */
  async handleEvent(connection, message) {
    const sessionHash = message.sessionHash || connection.sessionHash;

    const event = {
      ...message,
      sessionHash,
      ipAddress: connection.ip,
      timestamp: message.timestamp || Date.now()
    };

    // Log to ClickHouse
    await this.clickhouse.logEvent(event);

    // Update event count
    await this.postgres.incrementEventCount(sessionHash, 1);
  }

  /**
   * Handle command acknowledgment
   */
  async handleCommandAck(connection, message) {
    const { commandId, commandType, result } = message;

    // Update command status in database
    const status = result.error ? 'failed' : 'acknowledged';
    await this.postgres.updateCommandStatus(commandId, status, result);

    console.log(`[WebSocket] Command ${commandType} acknowledged:`, result);
  }

  /**
   * Handle client disconnect
   */
  handleDisconnect(connectionId) {
    const connection = this.connections.get(connectionId);
    
    if (connection && connection.sessionHash) {
      // Update session status
      this.postgres.updateSessionStatus(connection.sessionHash, false);
      
      console.log(`[WebSocket] Disconnected: ${connectionId} (${connection.sessionHash})`);
    }

    this.connections.delete(connectionId);
  }

  /**
   * Subscribe to Redis command channel
   */
  async subscribeToCommands() {
    await this.redis.subscribe('traffic:commands', async (data) => {
      const { sessionHash, command } = data;
      
      // Find connection with this session hash
      for (const [connectionId, connection] of this.connections.entries()) {
        if (connection.sessionHash === sessionHash) {
          this.sendToClient(connection.ws, {
            type: 'command',
            command
          });
        }
      }
    });

    console.log('[WebSocket] Subscribed to command channel');
  }

  /**
   * Send throttle command to client
   */
  async sendThrottleCommand(sessionHash, latency) {
    const command = {
      id: uuidv4(),
      type: 'SET_LATENCY',
      payload: { latency_ms: latency }
    };

    await this.redis.publish('traffic:commands', { sessionHash, command });
    await this.postgres.updateSessionMode(sessionHash, 'downspin', latency);
  }

  /**
   * Send message to client
   */
  sendToClient(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Broadcast to all clients
   */
  broadcast(message) {
    const data = JSON.stringify(message);
    let count = 0;

    this.connections.forEach((connection) => {
      if (connection.ws.readyState === WebSocket.OPEN) {
        connection.ws.send(data);
        count++;
      }
    });

    return count;
  }

  /**
   * Start ping/pong for connection health
   */
  startPingPong(connectionId) {
    const interval = setInterval(() => {
      const connection = this.connections.get(connectionId);
      
      if (!connection || connection.ws.readyState !== WebSocket.OPEN) {
        clearInterval(interval);
        return;
      }

      this.sendToClient(connection.ws, {
        type: 'ping',
        timestamp: Date.now()
      });
    }, 30000); // Every 30 seconds
  }

  /**
   * Calculate risk score based on behavior
   */
  calculateRiskScore(stats) {
    let score = 0;

    // High event rate
    if (stats.eventsPerSecond > 10) score += 40;
    else if (stats.eventsPerSecond > 5) score += 20;

    // High violation count
    if (stats.count > 30) score += 30;
    else if (stats.count > 10) score += 15;

    return Math.min(100, score);
  }

  /**
   * Get client IP from request
   */
  getClientIp(req) {
    return req.headers['x-forwarded-for']?.split(',')[0].trim() ||
           req.headers['x-real-ip'] ||
           req.socket.remoteAddress ||
           '0.0.0.0';
  }

  /**
   * Get server statistics
   */
  getStats() {
    return {
      totalConnections: this.connections.size,
      activeConnections: Array.from(this.connections.values())
        .filter(c => c.ws.readyState === WebSocket.OPEN).length,
      rateLimiter: this.rateLimiter.getStats()
    };
  }

  /**
   * Close server
   */
  async close() {
    console.log('[WebSocket] Closing server...');

    // Close all connections
    this.connections.forEach((connection) => {
      connection.ws.close();
    });

    this.wss.close();
    this.rateLimiter.destroy();
  }
}

module.exports = WebSocketServer;