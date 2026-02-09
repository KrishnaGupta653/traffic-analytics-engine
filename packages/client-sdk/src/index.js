/**
 * Traffic Analytics Server - Main Entry Point
 * Fastify + WebSocket + Redis + ClickHouse + PostgreSQL
 */

require('dotenv').config();
const Fastify = require('fastify');
const cors = require('@fastify/cors');
const helmet = require('@fastify/helmet');
const rateLimit = require('@fastify/rate-limit');

// Services
const RedisService = require('./services/redis-service');
const ClickHouseService = require('./services/clickhouse');
const PostgresService = require('./services/postgres');
const WebSocketServer = require('./websocket/server');

// Routes
const adminRoutes = require('./routes/admin');

class TrafficAnalyticsServer {
  constructor(config = {}) {
    this.config = {
      port: config.port || process.env.PORT || 3000,
      host: config.host || process.env.HOST || '0.0.0.0',
      ...config
    };

    // Initialize Fastify
    this.fastify = Fastify({
      logger: {
        level: process.env.LOG_LEVEL || 'info',
        prettyPrint: process.env.NODE_ENV !== 'production'
      },
      trustProxy: true
    });

    // Services (will be initialized)
    this.redis = null;
    this.clickhouse = null;
    this.postgres = null;
    this.websocket = null;
  }

  /**
   * Initialize all services
   */
  async initializeServices() {
    console.log('[Server] Initializing services...');

    // Redis
    this.redis = new RedisService({
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT,
      password: process.env.REDIS_PASSWORD
    });

    // ClickHouse
    this.clickhouse = new ClickHouseService({
      url: process.env.CLICKHOUSE_URL,
      port: process.env.CLICKHOUSE_PORT,
      database: process.env.CLICKHOUSE_DB
    });

    // PostgreSQL
    this.postgres = new PostgresService({
      host: process.env.POSTGRES_HOST,
      port: process.env.POSTGRES_PORT,
      database: process.env.POSTGRES_DB,
      user: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD
    });

    // Health checks
    await this.healthCheck();

    console.log('[Server] All services initialized');
  }

  /**
   * Setup middleware
   */
  async setupMiddleware() {
    // CORS
    await this.fastify.register(cors, {
      origin: process.env.CORS_ORIGIN || '*',
      credentials: true
    });

    // Security headers
    await this.fastify.register(helmet, {
      contentSecurityPolicy: false
    });

    // Rate limiting (global)
    await this.fastify.register(rateLimit, {
      max: 100,
      timeWindow: '1 minute',
      cache: 10000
    });

    console.log('[Server] Middleware configured');
  }

  /**
   * Setup routes
   */
  async setupRoutes() {
    // Health check
    this.fastify.get('/health', async (request, reply) => {
      const health = await this.getHealthStatus();
      const statusCode = health.healthy ? 200 : 503;
      return reply.code(statusCode).send(health);
    });

    // Beacon endpoint for sendBeacon API
    this.fastify.post('/beacon', async (request, reply) => {
      try {
        const events = request.body;
        if (events && events.events) {
          // Process events asynchronously
          setImmediate(async () => {
            for (const event of events.events) {
              await this.clickhouse.logEvent(event);
            }
          });
        }
        return reply.code(204).send();
      } catch (error) {
        return reply.code(204).send(); // Always return 204 for beacon
      }
    });

    // Admin routes
    await this.fastify.register(adminRoutes, {
      prefix: '/admin',
      redis: this.redis,
      postgres: this.postgres,
      clickhouse: this.clickhouse,
      websocket: this.websocket
    });

    // Root endpoint
    this.fastify.get('/', async () => ({
      service: 'Traffic Analytics Engine',
      version: '1.0.0',
      status: 'running',
      endpoints: {
        websocket: '/ws',
        admin: '/admin',
        health: '/health'
      }
    }));

    console.log('[Server] Routes configured');
  }

  /**
   * Initialize WebSocket server
   */
  initializeWebSocket() {
    this.websocket = new WebSocketServer(
      this.fastify.server,
      this.redis,
      this.clickhouse,
      this.postgres
    );

    console.log('[Server] WebSocket server initialized');
  }

  /**
   * Health check for all services
   */
  async healthCheck() {
    const [redisHealth, clickhouseHealth, postgresHealth] = await Promise.all([
      this.redis.getStats().catch(e => ({ healthy: false, error: e.message })),
      this.clickhouse.healthCheck().catch(e => ({ healthy: false, error: e.message })),
      this.postgres.healthCheck().catch(e => ({ healthy: false, error: e.message }))
    ]);

    const healthy = 
      redisHealth.connected && 
      clickhouseHealth.healthy && 
      postgresHealth.healthy;

    if (!healthy) {
      console.error('[Server] Health check failed:', {
        redis: redisHealth,
        clickhouse: clickhouseHealth,
        postgres: postgresHealth
      });
    }

    return { healthy, redis: redisHealth, clickhouse: clickhouseHealth, postgres: postgresHealth };
  }

  /**
   * Get health status
   */
  async getHealthStatus() {
    try {
      const health = await this.healthCheck();
      
      return {
        ...health,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: new Date()
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        timestamp: new Date()
      };
    }
  }

  /**
   * Setup background jobs
   */
  setupBackgroundJobs() {
    // Refresh dashboard stats every minute
    setInterval(async () => {
      try {
        await this.postgres.refreshDashboardStats();
      } catch (error) {
        console.error('[Background] Failed to refresh dashboard stats:', error);
      }
    }, 60000);

    // Cleanup old sessions daily
    setInterval(async () => {
      try {
        const deleted = await this.postgres.cleanupOldSessions(7);
        console.log(`[Background] Cleaned up ${deleted} old sessions`);
      } catch (error) {
        console.error('[Background] Failed to cleanup sessions:', error);
      }
    }, 86400000); // 24 hours

    console.log('[Server] Background jobs scheduled');
  }

  /**
   * Start the server
   */
  async start() {
    try {
      // Initialize services
      await this.initializeServices();

      // Setup middleware
      await this.setupMiddleware();

      // Setup routes
      await this.setupRoutes();

      // Start Fastify server first
      await this.fastify.listen({
        port: this.config.port,
        host: this.config.host
      });

      // Initialize WebSocket after server is listening
      this.initializeWebSocket();

      // Setup background jobs
      this.setupBackgroundJobs();

      console.log(`
╔════════════════════════════════════════════════════════════╗
║  Traffic Analytics Engine Started                          ║
║                                                            ║
║  HTTP Server:    http://${this.config.host}:${this.config.port}                    ║
║  WebSocket:      ws://${this.config.host}:${this.config.port}/ws                 ║
║  Admin API:      http://${this.config.host}:${this.config.port}/admin              ║
║  Health Check:   http://${this.config.host}:${this.config.port}/health             ║
║                                                            ║
║  Environment:    ${process.env.NODE_ENV || 'development'}                       ║
╚════════════════════════════════════════════════════════════╝
      `);

    } catch (error) {
      console.error('[Server] Failed to start:', error);
      process.exit(1);
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log('[Server] Shutting down gracefully...');

    try {
      // Close WebSocket
      if (this.websocket) {
        await this.websocket.close();
      }

      // Close services
      if (this.clickhouse) {
        await this.clickhouse.close();
      }

      if (this.postgres) {
        await this.postgres.close();
      }

      if (this.redis) {
        await this.redis.close();
      }

      // Close Fastify
      await this.fastify.close();

      console.log('[Server] Shutdown complete');
      process.exit(0);
    } catch (error) {
      console.error('[Server] Error during shutdown:', error);
      process.exit(1);
    }
  }
}

// Create and start server
const server = new TrafficAnalyticsServer();

// Handle shutdown signals
process.on('SIGTERM', () => server.shutdown());
process.on('SIGINT', () => server.shutdown());

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('[Server] Uncaught exception:', error);
  server.shutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server] Unhandled rejection at:', promise, 'reason:', reason);
});

// Start server
server.start();

module.exports = TrafficAnalyticsServer;