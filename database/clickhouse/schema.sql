-- Event log schema placeholder
-- ClickHouse Schema for High-Volume Event Logging
-- Optimized for append-only time-series data with efficient querying

CREATE DATABASE IF NOT EXISTS traffic_analytics;

USE traffic_analytics;

-- Main event log table (partitioned by day for efficient pruning)
CREATE TABLE IF NOT EXISTS events (
    event_id UUID DEFAULT generateUUIDv4(),
    timestamp DateTime64(3) DEFAULT now64(3),
    session_hash String,
    event_type LowCardinality(String),
    
    -- Client metadata
    ip_address IPv4,
    user_agent String,
    
    -- GeoIP enrichment
    country FixedString(2),
    city String,
    isp String,
    latitude Float32,
    longitude Float32,
    
    -- Device fingerprint
    screen_width UInt16,
    screen_height UInt16,
    timezone String,
    network_type LowCardinality(String),
    battery_level Nullable(UInt8),
    
    -- Interaction data
    interaction_type LowCardinality(String),
    element_tag Nullable(String),
    element_id Nullable(String),
    element_class Nullable(String),
    page_url String,
    
    -- Performance metrics
    latency_ms UInt16,
    is_throttled UInt8 DEFAULT 0,
    
    -- Risk scoring
    risk_score Float32 DEFAULT 0.0,
    is_bot UInt8 DEFAULT 0,
    
    -- Metadata
    payload String DEFAULT '{}'
) ENGINE = MergeTree()
PARTITION BY toYYYYMMDD(timestamp)
ORDER BY (session_hash, timestamp)
TTL timestamp + INTERVAL 90 DAY  -- Auto-delete after 90 days
SETTINGS index_granularity = 8192;

-- Materialized view for real-time session aggregations
-- CREATE MATERIALIZED VIEW IF NOT EXISTS session_stats_mv
-- ENGINE = SummingMergeTree()
-- PARTITION BY toYYYYMMDD(timestamp)
-- ORDER BY (session_hash, toStartOfHour(timestamp))
-- AS SELECT
--     session_hash,
--     toStartOfHour(timestamp) as hour,
--     count() as event_count,
--     uniq(event_type) as unique_events,
--     avg(latency_ms) as avg_latency,
--     max(latency_ms) as max_latency,
--     sum(is_throttled) as throttle_count,
--     max(risk_score) as max_risk_score,
--     any(ip_address) as ip_address,
--     any(country) as country,
--     any(city) as city
-- FROM events
-- GROUP BY session_hash, hour;
DROP VIEW IF EXISTS session_stats_mv;

-- CREATE MATERIALIZED VIEW session_stats_mv
-- ENGINE = SummingMergeTree
-- PARTITION BY toYYYYMMDD(hour)
-- ORDER BY (session_hash, hour)
-- AS
-- SELECT
--     session_hash,
--     toStartOfHour(timestamp) AS hour,
--     count() AS event_count,
--     uniq(event_type) AS unique_events,
--     avg(latency_ms) AS avg_latency,
--     max(latency_ms) AS max_latency,
--     sum(is_throttled) AS throttle_count,
--     max(risk_score) AS max_risk_score,
--     any(ip_address) AS ip_address,
--     any(country) AS country,
--     any(city) AS city
-- FROM events
-- GROUP BY session_hash, hour;

DROP VIEW IF EXISTS session_stats_mv;

CREATE MATERIALIZED VIEW session_stats_mv
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMMDD(hour)
ORDER BY (session_hash, hour)
AS
SELECT
    session_hash,
    toStartOfHour(timestamp) AS hour,
    countState() AS event_count,
    uniqState(event_type) AS unique_events,
    avgState(latency_ms) AS avg_latency,
    maxState(latency_ms) AS max_latency,
    sumState(is_throttled) AS throttle_count,
    maxState(risk_score) AS max_risk_score
FROM events
GROUP BY session_hash, hour;

-- Materialized view for geographic analytics
-- CREATE MATERIALIZED VIEW IF NOT EXISTS geo_stats_mv
-- ENGINE = SummingMergeTree()
-- PARTITION BY toYYYYMMDD(timestamp)
-- ORDER BY (country, city, toStartOfHour(timestamp))
-- AS SELECT
--     country,
--     city,
--     toStartOfHour(timestamp) as hour,
--     count() as event_count,
--     uniq(session_hash) as unique_sessions,
--     avg(latency_ms) as avg_latency,
--     avg(risk_score) as avg_risk_score
-- FROM events
-- GROUP BY country, city, hour;

CREATE MATERIALIZED VIEW geo_stats_mv
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMMDD(hour)
ORDER BY (country, city, hour)
AS
SELECT
    country,
    city,
    toStartOfHour(timestamp) AS hour,
    countState() AS event_count,
    uniqState(session_hash) AS unique_sessions,
    avgState(latency_ms) AS avg_latency,
    avgState(risk_score) AS avg_risk_score
FROM events
GROUP BY country, city, hour;

-- Command execution log (tracks admin actions)
CREATE TABLE IF NOT EXISTS command_log (
    command_id UUID DEFAULT generateUUIDv4(),
    timestamp DateTime64(3) DEFAULT now64(3),
    session_hash String,
    command_type LowCardinality(String),
    admin_id String,
    admin_ip IPv4,
    command_payload String,
    execution_status LowCardinality(String),
    error_message Nullable(String)
) ENGINE = MergeTree()
PARTITION BY toYYYYMMDD(timestamp)
ORDER BY (session_hash, timestamp)
TTL timestamp + INTERVAL 180 DAY
SETTINGS index_granularity = 8192;

-- Rate limit violations log
CREATE TABLE IF NOT EXISTS rate_limit_violations (
    violation_id UUID DEFAULT generateUUIDv4(),
    timestamp DateTime64(3) DEFAULT now64(3),
    session_hash String,
    ip_address IPv4,
    events_per_second Float32,
    threshold_exceeded Float32,
    auto_throttled UInt8 DEFAULT 1
) ENGINE = MergeTree()
PARTITION BY toYYYYMMDD(timestamp)
ORDER BY (ip_address, timestamp)
TTL timestamp + INTERVAL 30 DAY
SETTINGS index_granularity = 8192;

-- Indexes for common queries
-- Note: ClickHouse uses data skipping indexes

-- Index for session lookup
ALTER TABLE events ADD INDEX idx_session session_hash TYPE bloom_filter GRANULARITY 4;

-- Index for IP-based queries
ALTER TABLE events ADD INDEX idx_ip ip_address TYPE bloom_filter GRANULARITY 4;

-- Index for event type filtering
ALTER TABLE events ADD INDEX idx_event_type event_type TYPE set(0) GRANULARITY 4;

-- Index for risk scoring
ALTER TABLE events ADD INDEX idx_risk_score risk_score TYPE minmax GRANULARITY 4;

-- Common queries for analytics (documented for reference)

-- Query: Active sessions in last hour
-- SELECT 
--     session_hash,
--     max(timestamp) as last_seen,
--     count() as event_count,
--     avg(latency_ms) as avg_latency,
--     any(city) as city,
--     max(risk_score) as risk_score
-- FROM events
-- WHERE timestamp >= now() - INTERVAL 1 HOUR
-- GROUP BY session_hash
-- ORDER BY last_seen DESC;

-- Query: Geographic distribution
-- SELECT 
--     country,
--     city,
--     count() as events,
--     uniq(session_hash) as sessions,
--     avg(latency_ms) as avg_latency
-- FROM events
-- WHERE timestamp >= now() - INTERVAL 1 DAY
-- GROUP BY country, city
-- ORDER BY events DESC
-- LIMIT 50;

-- Query: Bot detection candidates
-- SELECT 
--     session_hash,
--     count() as event_count,
--     uniq(event_type) as unique_events,
--     avg(latency_ms) as avg_latency,
--     sum(is_throttled) as throttle_count
-- FROM events
-- WHERE timestamp >= now() - INTERVAL 1 HOUR
-- GROUP BY session_hash
-- HAVING event_count > 100 AND unique_events < 3
-- ORDER BY event_count DESC;