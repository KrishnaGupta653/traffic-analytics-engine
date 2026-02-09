// /**
//  * Admin Control API Routes
//  * Secure endpoints for traffic shaping and session management
//  */

// const { v4: uuidv4 } = require('uuid');

// async function adminRoutes(fastify, options) {
//   const { redis, postgres, clickhouse, websocket } = options;

//   // API Key authentication middleware
//   fastify.addHook('preHandler', async (request, reply) => {
//     const apiKey = request.headers['x-api-key'];
//     const validKey = process.env.ADMIN_API_KEY || 'dev-admin-key-change-in-production';

//     if (apiKey !== validKey) {
//       reply.code(401).send({ error: 'Unauthorized' });
//     }
//   });

//   /**
//    * GET /admin/sessions - List active sessions
//    */
//   fastify.get('/sessions', async (request, reply) => {
//     try {
//       const minutesAgo = parseInt(request.query.minutes) || 5;
//       const sessions = await postgres.getActiveSessions(minutesAgo);
      
//       return {
//         success: true,
//         count: sessions.length,
//         sessions
//       };
//     } catch (error) {
//       reply.code(500).send({ error: error.message });
//     }
//   });

//   /**
//    * GET /admin/sessions/:sessionHash - Get session details
//    */
//   fastify.get('/sessions/:sessionHash', async (request, reply) => {
//     try {
//       const { sessionHash } = request.params;
      
//       const session = await postgres.getSession(sessionHash);
//       if (!session) {
//         return reply.code(404).send({ error: 'Session not found' });
//       }

//       const timeline = await clickhouse.getSessionTimeline(sessionHash);
//       const commands = await postgres.getCommandHistory(sessionHash);

//       return {
//         success: true,
//         session,
//         timeline,
//         commands
//       };
//     } catch (error) {
//       reply.code(500).send({ error: error.message });
//     }
//   });

//   /**
//    * POST /admin/sessions/:sessionHash/upspin - Set priority mode
//    */
//   fastify.post('/sessions/:sessionHash/upspin', async (request, reply) => {
//     try {
//       const { sessionHash } = request.params;
      
//       // Update database
//       await postgres.updateSessionMode(sessionHash, 'upspin', 0);

//       // Send command to client
//       const command = {
//         id: uuidv4(),
//         type: 'SET_LATENCY',
//         payload: { latency_ms: 0 }
//       };

//       await redis.publish('traffic:commands', { sessionHash, command });

//       // Log command
//       await postgres.logCommand({
//         commandId: command.id,
//         sessionHash,
//         commandType: 'SET_LATENCY',
//         commandPayload: command.payload,
//         adminId: request.headers['x-admin-id'] || 'api',
//         adminIp: request.ip
//       });

//       return {
//         success: true,
//         message: 'Priority mode activated',
//         sessionHash,
//         command
//       };
//     } catch (error) {
//       reply.code(500).send({ error: error.message });
//     }
//   });

//   /**
//    * POST /admin/sessions/:sessionHash/downspin - Set throttle mode
//    */
//   fastify.post('/sessions/:sessionHash/downspin', async (request, reply) => {
//     try {
//       const { sessionHash } = request.params;
//       const { latency_ms = 2000 } = request.body || {};

//       // Update database
//       await postgres.updateSessionMode(sessionHash, 'downspin', latency_ms);

//       // Send command to client
//       const command = {
//         id: uuidv4(),
//         type: 'SET_LATENCY',
//         payload: { latency_ms }
//       };

//       await redis.publish('traffic:commands', { sessionHash, command });

//       // Log command
//       await postgres.logCommand({
//         commandId: command.id,
//         sessionHash,
//         commandType: 'SET_LATENCY',
//         commandPayload: command.payload,
//         adminId: request.headers['x-admin-id'] || 'api',
//         adminIp: request.ip
//       });

//       return {
//         success: true,
//         message: 'Throttle mode activated',
//         sessionHash,
//         latency_ms,
//         command
//       };
//     } catch (error) {
//       reply.code(500).send({ error: error.message });
//     }
//   });

//   /**
//    * POST /admin/sessions/:sessionHash/terminate - Terminate session
//    */
//   fastify.post('/sessions/:sessionHash/terminate', async (request, reply) => {
//     try {
//       const { sessionHash } = request.params;
//       const { reason = 'Session terminated by administrator' } = request.body || {};

//       // Update database
//       await postgres.updateSessionMode(sessionHash, 'terminated', 0);

//       // Send command to client
//       const command = {
//         id: uuidv4(),
//         type: 'TERMINATE',
//         payload: { reason }
//       };

//       await redis.publish('traffic:commands', { sessionHash, command });

//       // Log command
//       await postgres.logCommand({
//         commandId: command.id,
//         sessionHash,
//         commandType: 'TERMINATE',
//         commandPayload: command.payload,
//         adminId: request.headers['x-admin-id'] || 'api',
//         adminIp: request.ip
//       });

//       return {
//         success: true,
//         message: 'Session terminated',
//         sessionHash,
//         reason,
//         command
//       };
//     } catch (error) {
//       reply.code(500).send({ error: error.message });
//     }
//   });

//   /**
//    * POST /admin/sessions/:sessionHash/notify - Send toast notification
//    */
//   fastify.post('/sessions/:sessionHash/notify', async (request, reply) => {
//     try {
//       const { sessionHash } = request.params;
//       const { message, type = 'info', duration = 5000 } = request.body || {};

//       if (!message) {
//         return reply.code(400).send({ error: 'Message is required' });
//       }

//       // Send command to client
//       const command = {
//         id: uuidv4(),
//         type: 'TOAST_ALERT',
//         payload: { message, type, duration }
//       };

//       await redis.publish('traffic:commands', { sessionHash, command });

//       // Log command
//       await postgres.logCommand({
//         commandId: command.id,
//         sessionHash,
//         commandType: 'TOAST_ALERT',
//         commandPayload: command.payload,
//         adminId: request.headers['x-admin-id'] || 'api',
//         adminIp: request.ip
//       });

//       return {
//         success: true,
//         message: 'Notification sent',
//         sessionHash,
//         command
//       };
//     } catch (error) {
//       reply.code(500).send({ error: error.message });
//     }
//   });

//   /**
//    * POST /admin/sessions/:sessionHash/redirect - Redirect session
//    */
//   fastify.post('/sessions/:sessionHash/redirect', async (request, reply) => {
//     try {
//       const { sessionHash } = request.params;
//       const { url, newTab = false } = request.body || {};

//       if (!url) {
//         return reply.code(400).send({ error: 'URL is required' });
//       }

//       // Send command to client
//       const command = {
//         id: uuidv4(),
//         type: 'REDIRECT',
//         payload: { url, newTab }
//       };

//       await redis.publish('traffic:commands', { sessionHash, command });

//       // Log command
//       await postgres.logCommand({
//         commandId: command.id,
//         sessionHash,
//         commandType: 'REDIRECT',
//         commandPayload: command.payload,
//         adminId: request.headers['x-admin-id'] || 'api',
//         adminIp: request.ip
//       });

//       return {
//         success: true,
//         message: 'Redirect command sent',
//         sessionHash,
//         url,
//         command
//       };
//     } catch (error) {
//       reply.code(500).send({ error: error.message });
//     }
//   });

//   /**
//    * GET /admin/analytics - Get analytics summary
//    */
//   fastify.get('/analytics', async (request, reply) => {
//     try {
//       const hours = parseInt(request.query.hours) || 24;
      
//       const [summary, geoDistribution, botCandidates, dbStats] = await Promise.all([
//         clickhouse.getAnalyticsSummary(hours),
//         clickhouse.getGeographicDistribution(hours),
//         clickhouse.getBotCandidates(1),
//         postgres.getDashboardStats()
//       ]);

//       return {
//         success: true,
//         summary,
//         geoDistribution,
//         botCandidates,
//         dbStats
//       };
//     } catch (error) {
//       reply.code(500).send({ error: error.message });
//     }
//   });

//   /**
//    * GET /admin/stats - Get server statistics
//    */
//   fastify.get('/stats', async (request, reply) => {
//     try {
//       const wsStats = websocket.getStats();
//       const onlineSessions = await redis.getOnlineSessions();

//       return {
//         success: true,
//         websocket: wsStats,
//         online: onlineSessions.length,
//         timestamp: new Date()
//       };
//     } catch (error) {
//       reply.code(500).send({ error: error.message });
//     }
//   });

//   /**
//    * GET /admin/high-risk - Get high-risk sessions
//    */
//   fastify.get('/high-risk', async (request, reply) => {
//     try {
//       const sessions = await postgres.getHighRiskSessions();
      
//       return {
//         success: true,
//         count: sessions.length,
//         sessions
//       };
//     } catch (error) {
//       reply.code(500).send({ error: error.message });
//     }
//   });

//   /**
//    * POST /admin/batch-action - Execute batch action on multiple sessions
//    */
//   fastify.post('/batch-action', async (request, reply) => {
//     try {
//       const { action, sessionHashes, payload = {} } = request.body || {};

//       if (!action || !Array.isArray(sessionHashes)) {
//         return reply.code(400).send({ error: 'Invalid request' });
//       }

//       const results = [];

//       for (const sessionHash of sessionHashes) {
//         let command;
        
//         switch (action) {
//           case 'upspin':
//             await postgres.updateSessionMode(sessionHash, 'upspin', 0);
//             command = { type: 'SET_LATENCY', payload: { latency_ms: 0 } };
//             break;
//           case 'downspin':
//             await postgres.updateSessionMode(sessionHash, 'downspin', payload.latency_ms || 2000);
//             command = { type: 'SET_LATENCY', payload: { latency_ms: payload.latency_ms || 2000 } };
//             break;
//           case 'terminate':
//             await postgres.updateSessionMode(sessionHash, 'terminated', 0);
//             command = { type: 'TERMINATE', payload: { reason: payload.reason || 'Batch termination' } };
//             break;
//           default:
//             continue;
//         }

//         command.id = uuidv4();
//         await redis.publish('traffic:commands', { sessionHash, command });
//         results.push({ sessionHash, command });
//       }

//       return {
//         success: true,
//         message: `Batch action ${action} executed`,
//         affected: results.length,
//         results
//       };
//     } catch (error) {
//       reply.code(500).send({ error: error.message });
//     }
//   });
// }

// module.exports = adminRoutes;

/**
 * Admin Control API Routes
 * Secure endpoints for traffic shaping and session management
 */

const { v4: uuidv4 } = require('uuid');

async function adminRoutes(fastify, options) {
  const { redis, postgres, clickhouse, websocket: getWebsocket } = options;
  
  // Helper to get websocket instance
  const getWs = () => {
    if (typeof getWebsocket === 'function') {
      return getWebsocket();
    }
    return getWebsocket;
  };

  // API Key authentication middleware
  fastify.addHook('preHandler', async (request, reply) => {
    const apiKey = request.headers['x-api-key'];
    const validKey = process.env.ADMIN_API_KEY || 'dev-admin-key-change-in-production';

    if (apiKey !== validKey) {
      reply.code(401).send({ error: 'Unauthorized' });
    }
  });

  /**
   * GET /admin/sessions - List active sessions
   */
  fastify.get('/sessions', async (request, reply) => {
    try {
      const minutesAgo = parseInt(request.query.minutes) || 5;
      const sessions = await postgres.getActiveSessions(minutesAgo);
      
      return {
        success: true,
        count: sessions.length,
        sessions
      };
    } catch (error) {
      reply.code(500).send({ error: error.message });
    }
  });

  /**
   * GET /admin/sessions/:sessionHash - Get session details
   */
  fastify.get('/sessions/:sessionHash', async (request, reply) => {
    try {
      const { sessionHash } = request.params;
      
      const session = await postgres.getSession(sessionHash);
      if (!session) {
        return reply.code(404).send({ error: 'Session not found' });
      }

      const timeline = await clickhouse.getSessionTimeline(sessionHash);
      const commands = await postgres.getCommandHistory(sessionHash);

      return {
        success: true,
        session,
        timeline,
        commands
      };
    } catch (error) {
      reply.code(500).send({ error: error.message });
    }
  });

  /**
   * POST /admin/sessions/:sessionHash/upspin - Set priority mode
   */
  fastify.post('/sessions/:sessionHash/upspin', async (request, reply) => {
    try {
      const { sessionHash } = request.params;
      
      // Update database
      await postgres.updateSessionMode(sessionHash, 'upspin', 0);

      // Send command to client
      const command = {
        id: uuidv4(),
        type: 'SET_LATENCY',
        payload: { latency_ms: 0 }
      };

      await redis.publish('traffic:commands', { sessionHash, command });

      // Log command
      await postgres.logCommand({
        commandId: command.id,
        sessionHash,
        commandType: 'SET_LATENCY',
        commandPayload: command.payload,
        adminId: request.headers['x-admin-id'] || 'api',
        adminIp: request.ip
      });

      return {
        success: true,
        message: 'Priority mode activated',
        sessionHash,
        command
      };
    } catch (error) {
      reply.code(500).send({ error: error.message });
    }
  });

  /**
   * POST /admin/sessions/:sessionHash/downspin - Set throttle mode
   */
  fastify.post('/sessions/:sessionHash/downspin', async (request, reply) => {
    try {
      const { sessionHash } = request.params;
      const { latency_ms = 2000 } = request.body || {};

      // Update database
      await postgres.updateSessionMode(sessionHash, 'downspin', latency_ms);

      // Send command to client
      const command = {
        id: uuidv4(),
        type: 'SET_LATENCY',
        payload: { latency_ms }
      };

      await redis.publish('traffic:commands', { sessionHash, command });

      // Log command
      await postgres.logCommand({
        commandId: command.id,
        sessionHash,
        commandType: 'SET_LATENCY',
        commandPayload: command.payload,
        adminId: request.headers['x-admin-id'] || 'api',
        adminIp: request.ip
      });

      return {
        success: true,
        message: 'Throttle mode activated',
        sessionHash,
        latency_ms,
        command
      };
    } catch (error) {
      reply.code(500).send({ error: error.message });
    }
  });

  /**
   * POST /admin/sessions/:sessionHash/terminate - Terminate session
   */
  fastify.post('/sessions/:sessionHash/terminate', async (request, reply) => {
    try {
      const { sessionHash } = request.params;
      const { reason = 'Session terminated by administrator' } = request.body || {};

      // Update database
      await postgres.updateSessionMode(sessionHash, 'terminated', 0);

      // Send command to client
      const command = {
        id: uuidv4(),
        type: 'TERMINATE',
        payload: { reason }
      };

      await redis.publish('traffic:commands', { sessionHash, command });

      // Log command
      await postgres.logCommand({
        commandId: command.id,
        sessionHash,
        commandType: 'TERMINATE',
        commandPayload: command.payload,
        adminId: request.headers['x-admin-id'] || 'api',
        adminIp: request.ip
      });

      return {
        success: true,
        message: 'Session terminated',
        sessionHash,
        reason,
        command
      };
    } catch (error) {
      reply.code(500).send({ error: error.message });
    }
  });

  /**
   * POST /admin/sessions/:sessionHash/notify - Send toast notification
   */
  fastify.post('/sessions/:sessionHash/notify', async (request, reply) => {
    try {
      const { sessionHash } = request.params;
      const { message, type = 'info', duration = 5000 } = request.body || {};

      if (!message) {
        return reply.code(400).send({ error: 'Message is required' });
      }

      // Send command to client
      const command = {
        id: uuidv4(),
        type: 'TOAST_ALERT',
        payload: { message, type, duration }
      };

      await redis.publish('traffic:commands', { sessionHash, command });

      // Log command
      await postgres.logCommand({
        commandId: command.id,
        sessionHash,
        commandType: 'TOAST_ALERT',
        commandPayload: command.payload,
        adminId: request.headers['x-admin-id'] || 'api',
        adminIp: request.ip
      });

      return {
        success: true,
        message: 'Notification sent',
        sessionHash,
        command
      };
    } catch (error) {
      reply.code(500).send({ error: error.message });
    }
  });

  /**
   * POST /admin/sessions/:sessionHash/redirect - Redirect session
   */
  fastify.post('/sessions/:sessionHash/redirect', async (request, reply) => {
    try {
      const { sessionHash } = request.params;
      const { url, newTab = false } = request.body || {};

      if (!url) {
        return reply.code(400).send({ error: 'URL is required' });
      }

      // Send command to client
      const command = {
        id: uuidv4(),
        type: 'REDIRECT',
        payload: { url, newTab }
      };

      await redis.publish('traffic:commands', { sessionHash, command });

      // Log command
      await postgres.logCommand({
        commandId: command.id,
        sessionHash,
        commandType: 'REDIRECT',
        commandPayload: command.payload,
        adminId: request.headers['x-admin-id'] || 'api',
        adminIp: request.ip
      });

      return {
        success: true,
        message: 'Redirect command sent',
        sessionHash,
        url,
        command
      };
    } catch (error) {
      reply.code(500).send({ error: error.message });
    }
  });

  /**
   * GET /admin/analytics - Get analytics summary
   */
  fastify.get('/analytics', async (request, reply) => {
    try {
      const hours = parseInt(request.query.hours) || 24;
      
      const [summary, geoDistribution, botCandidates, dbStats] = await Promise.all([
        clickhouse.getAnalyticsSummary(hours),
        clickhouse.getGeographicDistribution(hours),
        clickhouse.getBotCandidates(1),
        postgres.getDashboardStats()
      ]);

      return {
        success: true,
        summary,
        geoDistribution,
        botCandidates,
        dbStats
      };
    } catch (error) {
      reply.code(500).send({ error: error.message });
    }
  });

  /**
   * GET /admin/stats - Get server statistics
   */
  fastify.get('/stats', async (request, reply) => {
    try {
      const ws = getWs();
      const wsStats = ws ? ws.getStats() : { error: 'WebSocket not initialized' };
      const onlineSessions = await redis.getOnlineSessions();

      return {
        success: true,
        websocket: wsStats,
        online: onlineSessions.length,
        timestamp: new Date()
      };
    } catch (error) {
      reply.code(500).send({ error: error.message });
    }
  });

  /**
   * GET /admin/high-risk - Get high-risk sessions
   */
  fastify.get('/high-risk', async (request, reply) => {
    try {
      const sessions = await postgres.getHighRiskSessions();
      
      return {
        success: true,
        count: sessions.length,
        sessions
      };
    } catch (error) {
      reply.code(500).send({ error: error.message });
    }
  });

  /**
   * POST /admin/batch-action - Execute batch action on multiple sessions
   */
  fastify.post('/batch-action', async (request, reply) => {
    try {
      const { action, sessionHashes, payload = {} } = request.body || {};

      if (!action || !Array.isArray(sessionHashes)) {
        return reply.code(400).send({ error: 'Invalid request' });
      }

      const results = [];

      for (const sessionHash of sessionHashes) {
        let command;
        
        switch (action) {
          case 'upspin':
            await postgres.updateSessionMode(sessionHash, 'upspin', 0);
            command = { type: 'SET_LATENCY', payload: { latency_ms: 0 } };
            break;
          case 'downspin':
            await postgres.updateSessionMode(sessionHash, 'downspin', payload.latency_ms || 2000);
            command = { type: 'SET_LATENCY', payload: { latency_ms: payload.latency_ms || 2000 } };
            break;
          case 'terminate':
            await postgres.updateSessionMode(sessionHash, 'terminated', 0);
            command = { type: 'TERMINATE', payload: { reason: payload.reason || 'Batch termination' } };
            break;
          default:
            continue;
        }

        command.id = uuidv4();
        await redis.publish('traffic:commands', { sessionHash, command });
        results.push({ sessionHash, command });
      }

      return {
        success: true,
        message: `Batch action ${action} executed`,
        affected: results.length,
        results
      };
    } catch (error) {
      reply.code(500).send({ error: error.message });
    }
  });
}

module.exports = adminRoutes;