# Traffic Analytics & Traffic Shaping Engine

A production-ready, high-performance real-time telemetry and traffic control platform for QA/Dev testing and user behavior analysis.

## 🎯 Features

### Core Capabilities
- **Real-Time Telemetry**: Monitor user interactions with <100ms latency
- **Traffic Shaping**: Dynamic network simulation (Upspin/Downspin modes)
- **Remote Configuration**: WebSocket-based command dispatch
- **Bot Detection**: Automated risk scoring and rate limiting
- **Geographic Analytics**: Real-time session tracking by location
- **Professional Dashboard**: White & Blue control center UI

### Technical Highlights
- ✅ Zero-dependency client SDK (Vanilla JavaScript)
- ✅ Token Bucket rate limiting with auto-throttling
- ✅ Safe command dispatcher (no eval)
- ✅ GDPR-compliant consent mode
- ✅ Horizontal scaling with Redis Pub/Sub
- ✅ High-volume event logging (ClickHouse)
- ✅ Real-time session state management (PostgreSQL)

## 🏗️ Architecture

```
┌─────────────┐     WebSocket      ┌──────────────┐
│   Client    │ ◄─────────────────► │   Server     │
│   SDK       │                     │  (Fastify)   │
└─────────────┘                     └──────┬───────┘
                                           │
                    ┌──────────────────────┼──────────────────────┐
                    │                      │                      │
              ┌─────▼─────┐         ┌─────▼─────┐         ┌─────▼─────┐
              │   Redis   │         │ClickHouse │         │ Postgres  │
              │  Pub/Sub  │         │  Events   │         │ Sessions  │
              └───────────┘         └───────────┘         └───────────┘
                    │
              ┌─────▼─────┐
              │ Dashboard │
              │ (Next.js) │
              └───────────┘
```

## 📦 Installation

### Prerequisites
- Node.js 18+
- Docker & Docker Compose (recommended)
- OR: Redis, PostgreSQL, ClickHouse installed locally

### Quick Start with Docker

```bash
# Clone the repository
git clone <repo-url>
cd traffic-analytics-engine

# Copy environment variables
cp .env.example .env

# Edit .env and set secure passwords
nano .env

# Start all services
docker-compose up -d

# Check health
curl http://localhost:3000/health
```

The stack will be available at:
- **Backend API**: http://localhost:3000
- **WebSocket**: ws://localhost:3000/ws
- **Dashboard**: http://localhost:3001
- **Admin API**: http://localhost:3000/admin

### Manual Installation

#### 1. Setup Databases

**PostgreSQL:**
```bash
psql -U postgres -f database/postgres/schema.sql
```

**ClickHouse:**
```bash
clickhouse-client --multiquery < database/clickhouse/schema.sql
```

#### 2. Install Dependencies

**Server:**
```bash
cd packages/server
npm install
cp .env.example .env
# Edit .env with your credentials
npm start
```

**Dashboard:**
```bash
cd packages/dashboard
npm install
npm run dev
```

**Client SDK:**
```bash
cd packages/client-sdk
npm install
npm run build
```

## 🔧 Client SDK Usage

### Basic Integration

```html
<!DOCTYPE html>
<html>
<head>
    <title>My App</title>
    <script src="path/to/session-hasher.js"></script>
    <script src="path/to/command-dispatcher.js"></script>
    <script src="path/to/tracker.js"></script>
</head>
<body>
    <script>
        // Initialize tracker
        const tracker = new TrafficAnalyticsTracker({
            serverUrl: 'ws://localhost:3000/ws',
            consentMode: true,      // Require user consent
            autoConnect: true,      // Auto-connect on load
            debug: true            // Enable debug logging
        });
    </script>
</body>
</html>
```

### Configuration Options

```javascript
const tracker = new TrafficAnalyticsTracker({
    // Connection
    serverUrl: 'ws://localhost:3000/ws',
    autoConnect: true,
    
    // Privacy
    consentMode: true,          // Wait for user consent
    
    // Performance
    batchSize: 10,              // Events per batch
    flushInterval: 2000,        // Flush every 2 seconds
    
    // Debugging
    debug: false
});
```

### Manual Control

```javascript
// Give consent programmatically
tracker.giveConsent();

// Track custom events
tracker.trackEvent('custom_action', {
    category: 'user_interaction',
    value: 42
});

// Disconnect
tracker.disconnect();
```

## 🎮 Admin API Usage

All admin endpoints require `X-API-Key` header.

### List Active Sessions

```bash
curl -H "X-API-Key: your-api-key" \
  http://localhost:3000/admin/sessions
```

### Priority Mode (Upspin) - Zero Latency

```bash
curl -X POST \
  -H "X-API-Key: your-api-key" \
  http://localhost:3000/admin/sessions/{sessionHash}/upspin
```

### Throttle Mode (Downspin) - Simulate Lag

```bash
curl -X POST \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"latency_ms": 2000}' \
  http://localhost:3000/admin/sessions/{sessionHash}/downspin
```

### Terminate Session

```bash
curl -X POST \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Suspicious activity detected"}' \
  http://localhost:3000/admin/sessions/{sessionHash}/terminate
```

### Send Notification

```bash
curl -X POST \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"message": "Please verify your account", "type": "warning"}' \
  http://localhost:3000/admin/sessions/{sessionHash}/notify
```

### Get Analytics

```bash
curl -H "X-API-Key: your-api-key" \
  http://localhost:3000/admin/analytics?hours=24
```

## 🎨 Dashboard Features

### Session Grid
- Real-time session monitoring
- One-click traffic shaping controls:
  - ⚡ **Priority**: Set latency to 0ms
  - 🐌 **Throttle**: Add 2000ms delay
  - 📢 **Notify**: Send toast alert
  - 🛑 **Terminate**: Force disconnect

### Filters
- All Sessions
- High Risk (score > 50)
- Throttled Sessions

### Analytics
- Geographic distribution map
- Risk score tracking
- Event volume metrics
- Bot detection alerts

## 🔐 Security

### API Key Authentication
Set a strong API key in `.env`:
```env
ADMIN_API_KEY=your-super-secure-random-key-here
```

### Rate Limiting
Automatic throttling triggers when:
- Events/second > 5
- Cumulative violations > 50 (auto-ban for 5 minutes)

### Safe Command Execution
Client uses whitelist-based command dispatcher:
- ✅ No `eval()` or arbitrary code execution
- ✅ Structured command validation
- ✅ Payload sanitization

### Privacy Compliance
- Consent mode for GDPR
- No PII collection in fingerprinting
- Session data auto-expires

## 📊 Database Schemas

### ClickHouse (Event Logs)
- Partitioned by day
- Auto-deletion after 90 days
- Materialized views for analytics
- Optimized for time-series queries

### PostgreSQL (Session State)
- Real-time session tracking
- Command history
- Materialized dashboard stats
- Auto-cleanup functions

## 🚀 Performance

- **Telemetry Latency**: <100ms
- **WebSocket Throughput**: 10,000+ connections
- **Event Processing**: 100,000+ events/second
- **Dashboard Refresh**: 2-second intervals
- **Rate Limit**: Token bucket with 5 events/sec default

## 📈 Monitoring

### Health Check
```bash
curl http://localhost:3000/health
```

### Server Stats
```bash
curl -H "X-API-Key: your-api-key" \
  http://localhost:3000/admin/stats
```

## 🧪 Testing Network Resilience

### Simulate Poor Network
1. Open Dashboard
2. Find target session
3. Click 🐌 Throttle button
4. Client now experiences 2000ms delay on all interactions

### Simulate VIP Priority
1. Click ⚡ Priority button
2. Client latency drops to 0ms
3. Guaranteed fast responses

### Test Bot Detection
Send rapid-fire events from client:
```javascript
for (let i = 0; i < 100; i++) {
    tracker.trackEvent('test', { iteration: i });
}
```
Server will auto-throttle after rate limit breach.

## 🛠️ Development

### Run in Development Mode

**Server:**
```bash
cd packages/server
npm run dev  # Uses nodemon
```

**Dashboard:**
```bash
cd packages/dashboard
npm run dev  # Next.js dev server
```

### Build for Production

**Client SDK:**
```bash
cd packages/client-sdk
npm run build  # Creates minified bundle
```

**Dashboard:**
```bash
cd packages/dashboard
npm run build
npm start
```

## 📝 Environment Variables

See `.env.example` for full configuration options.

### Required Variables
- `ADMIN_API_KEY` - Admin endpoint authentication
- `POSTGRES_PASSWORD` - Database password
- `REDIS_HOST` - Redis server address
- `CLICKHOUSE_URL` - ClickHouse server URL

## 🤝 Contributing

This is a professional QA/Dev tool. For production use:
1. Change all default credentials
2. Enable HTTPS/WSS
3. Configure firewall rules
4. Set up monitoring/alerting
5. Review rate limit settings

## 📄 License

MIT License - See LICENSE file for details

## 🆘 Troubleshooting

### WebSocket Connection Failed
- Check `serverUrl` matches backend
- Verify CORS settings
- Check firewall rules

### Events Not Logging
- Verify consent was given (if `consentMode: true`)
- Check browser console for errors
- Verify database connections

### Dashboard Not Loading Sessions
- Check API key configuration
- Verify backend is running
- Check CORS headers

### High CPU Usage
- Review flush intervals
- Check batch sizes
- Monitor ClickHouse query performance

## 📞 Support

For issues or questions, please open a GitHub issue.

---

**Built with:** Node.js • Fastify • WebSocket • Redis • ClickHouse • PostgreSQL • Next.js • Tremor • Tailwind CSS