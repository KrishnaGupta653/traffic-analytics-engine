-- Session metadata schema placeholder
-- PostgreSQL Schema for Session State Management
-- Optimized for real-time updates and transactional integrity

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Session state table (primary source of truth)
CREATE TABLE sessions (
    session_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_hash VARCHAR(64) UNIQUE NOT NULL,
    
    -- Connection state
    connected BOOLEAN DEFAULT true,
    first_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Network metadata
    ip_address INET NOT NULL,
    user_agent TEXT,
    
    -- GeoIP data
    country_code CHAR(2),
    city VARCHAR(100),
    isp VARCHAR(255),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    
    -- Device fingerprint
    screen_width INTEGER,
    screen_height INTEGER,
    timezone VARCHAR(50),
    network_type VARCHAR(20),
    battery_level SMALLINT CHECK (battery_level BETWEEN 0 AND 100),
    
    -- Traffic shaping state
    current_latency_ms INTEGER DEFAULT 0,
    mode VARCHAR(20) DEFAULT 'normal' CHECK (mode IN ('normal', 'upspin', 'downspin', 'terminated')),
    
    -- Analytics
    total_events BIGINT DEFAULT 0,
    risk_score DECIMAL(5, 2) DEFAULT 0.0 CHECK (risk_score BETWEEN 0 AND 100),
    is_bot BOOLEAN DEFAULT false,
    
    -- Consent tracking
    consent_given BOOLEAN DEFAULT false,
    consent_timestamp TIMESTAMP WITH TIME ZONE,
    
    -- Rate limiting
    rate_limit_violations INTEGER DEFAULT 0,
    last_violation_at TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    tags JSONB DEFAULT '[]'::jsonb,
    notes TEXT,
    
    -- Indexes
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX idx_sessions_connected ON sessions(connected) WHERE connected = true;
CREATE INDEX idx_sessions_last_seen ON sessions(last_seen DESC);
CREATE INDEX idx_sessions_ip ON sessions(ip_address);
CREATE INDEX idx_sessions_mode ON sessions(mode);
CREATE INDEX idx_sessions_risk_score ON sessions(risk_score DESC);
CREATE INDEX idx_sessions_country ON sessions(country_code);
CREATE INDEX idx_sessions_tags ON sessions USING GIN(tags);

-- Command history table
CREATE TABLE command_history (
    command_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES sessions(session_id) ON DELETE CASCADE,
    
    -- Command details
    command_type VARCHAR(50) NOT NULL,
    command_payload JSONB DEFAULT '{}'::jsonb,
    
    -- Admin tracking
    admin_id VARCHAR(100),
    admin_ip INET,
    
    -- Execution tracking
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'acknowledged', 'failed')),
    error_message TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    
    -- Index
    CONSTRAINT fk_session FOREIGN KEY (session_id) REFERENCES sessions(session_id)
);

CREATE INDEX idx_commands_session ON command_history(session_id);
CREATE INDEX idx_commands_status ON command_history(status);
CREATE INDEX idx_commands_created ON command_history(created_at DESC);

-- Session metrics aggregation (for dashboard)
CREATE TABLE session_metrics (
    metric_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES sessions(session_id) ON DELETE CASCADE,
    
    -- Time window
    window_start TIMESTAMP WITH TIME ZONE NOT NULL,
    window_end TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Aggregated metrics
    event_count INTEGER DEFAULT 0,
    avg_latency_ms DECIMAL(10, 2),
    max_latency_ms INTEGER,
    unique_event_types INTEGER,
    
    -- Interaction breakdown
    click_count INTEGER DEFAULT 0,
    scroll_count INTEGER DEFAULT 0,
    page_view_count INTEGER DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_session_window UNIQUE(session_id, window_start)
);

CREATE INDEX idx_metrics_session ON session_metrics(session_id);
CREATE INDEX idx_metrics_window ON session_metrics(window_start DESC);

-- Auto-update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_sessions_updated_at
    BEFORE UPDATE ON sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to calculate risk score based on behavior
CREATE OR REPLACE FUNCTION calculate_risk_score(
    p_session_hash VARCHAR(64),
    p_event_rate DECIMAL,
    p_unique_events INTEGER,
    p_total_events INTEGER
) RETURNS DECIMAL AS $$
DECLARE
    base_score DECIMAL := 0.0;
BEGIN
    -- High event rate (> 5 events/sec)
    IF p_event_rate > 5 THEN
        base_score := base_score + 30.0;
    ELSIF p_event_rate > 3 THEN
        base_score := base_score + 15.0;
    END IF;
    
    -- Low event diversity
    IF p_total_events > 50 AND p_unique_events < 3 THEN
        base_score := base_score + 25.0;
    END IF;
    
    -- Rapid fire events
    IF p_total_events > 100 AND p_unique_events < 5 THEN
        base_score := base_score + 20.0;
    END IF;
    
    -- Cap at 100
    IF base_score > 100 THEN
        base_score := 100.0;
    END IF;
    
    RETURN base_score;
END;
$$ LANGUAGE plpgsql;

-- View for active sessions (last 5 minutes)
CREATE OR REPLACE VIEW active_sessions AS
SELECT 
    s.session_id,
    s.session_hash,
    s.ip_address,
    s.country_code,
    s.city,
    s.mode,
    s.current_latency_ms,
    s.risk_score,
    s.is_bot,
    s.total_events,
    s.last_seen,
    s.connected,
    EXTRACT(EPOCH FROM (NOW() - s.last_seen)) as seconds_since_last_event
FROM sessions s
WHERE s.connected = true 
  AND s.last_seen > NOW() - INTERVAL '5 minutes'
ORDER BY s.last_seen DESC;

-- View for high-risk sessions
CREATE OR REPLACE VIEW high_risk_sessions AS
SELECT 
    s.*,
    COUNT(ch.command_id) as admin_action_count
FROM sessions s
LEFT JOIN command_history ch ON s.session_id = ch.session_id
WHERE s.risk_score > 50.0 OR s.is_bot = true
GROUP BY s.session_id
ORDER BY s.risk_score DESC, s.last_seen DESC;

-- Materialized view for dashboard statistics (refresh every minute)
CREATE MATERIALIZED VIEW dashboard_stats AS
SELECT 
    COUNT(*) FILTER (WHERE connected = true) as active_sessions,
    COUNT(*) FILTER (WHERE mode = 'downspin') as throttled_sessions,
    COUNT(*) FILTER (WHERE mode = 'upspin') as priority_sessions,
    COUNT(*) FILTER (WHERE mode = 'terminated') as terminated_sessions,
    COUNT(*) FILTER (WHERE risk_score > 70) as high_risk_sessions,
    COUNT(*) FILTER (WHERE is_bot = true) as bot_sessions,
    AVG(risk_score) as avg_risk_score,
    COUNT(DISTINCT country_code) as countries_count,
    SUM(total_events) as total_events_all_sessions
FROM sessions
WHERE last_seen > NOW() - INTERVAL '1 hour';

-- Index for materialized view
CREATE UNIQUE INDEX idx_dashboard_stats ON dashboard_stats ((1));

-- Function to refresh dashboard stats (call from cron or app)
CREATE OR REPLACE FUNCTION refresh_dashboard_stats()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY dashboard_stats;
END;
$$ LANGUAGE plpgsql;

-- Cleanup old sessions (can be called from cron)
CREATE OR REPLACE FUNCTION cleanup_old_sessions(days_old INTEGER DEFAULT 7)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM sessions
    WHERE connected = false 
      AND last_seen < NOW() - MAKE_INTERVAL(days => days_old);
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Sample data for testing (optional)
-- INSERT INTO sessions (session_hash, ip_address, country_code, city, risk_score, mode)
-- VALUES 
--     ('test_session_1', '192.168.1.1', 'US', 'San Francisco', 25.5, 'normal'),
--     ('test_session_2', '10.0.0.1', 'GB', 'London', 75.0, 'downspin'),
--     ('test_session_3', '172.16.0.1', 'JP', 'Tokyo', 10.0, 'upspin');