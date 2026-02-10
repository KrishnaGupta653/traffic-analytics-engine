#!/bin/bash

# ============================================
# Traffic Analytics - Database Initialization
# Run this ONCE to set up local databases
# ============================================

set -e

echo "🚀 Initializing Traffic Analytics Databases..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ============================================
# 1. PostgreSQL Setup
# ============================================
echo -e "${YELLOW}📦 Setting up PostgreSQL...${NC}"

if command -v psql &> /dev/null; then
    echo "✓ PostgreSQL CLI found"
    
    # Create database if not exists
    psql -U postgres -tc "SELECT 1 FROM pg_database WHERE datname = 'traffic_analytics'" | grep -q 1 || \
    psql -U postgres -c "CREATE DATABASE traffic_analytics;"
    
    echo "✓ Database 'traffic_analytics' ready"
    
    # Run schema
    echo "  → Running PostgreSQL schema..."
    psql -U postgres -d traffic_analytics -f database/postgres/schema.sql
    
    echo -e "${GREEN}✓ PostgreSQL setup complete${NC}"
else
    echo -e "${RED}✗ PostgreSQL not found. Install it first:${NC}"
    echo "  macOS:   brew install postgresql@16"
    echo "  Ubuntu:  sudo apt-get install postgresql-16"
    echo "  Windows: Download from https://www.postgresql.org/download/windows/"
    exit 1
fi

# ============================================
# 2. ClickHouse Setup
# ============================================
echo -e "${YELLOW}📦 Setting up ClickHouse...${NC}"

if command -v clickhouse-client &> /dev/null; then
    echo "✓ ClickHouse CLI found"
    
    # Run schema
    echo "  → Running ClickHouse schema..."
    clickhouse-client --multiquery < database/clickhouse/schema.sql
    
    echo -e "${GREEN}✓ ClickHouse setup complete${NC}"
else
    echo -e "${RED}✗ ClickHouse not found. Install it first:${NC}"
    echo "  macOS:   brew install clickhouse"
    echo "  Ubuntu:  sudo apt-get install clickhouse-server clickhouse-client"
    echo "  Windows: Download from https://clickhouse.com/docs/en/install"
    exit 1
fi

# ============================================
# 3. Redis Setup
# ============================================
echo -e "${YELLOW}📦 Checking Redis...${NC}"

if command -v redis-cli &> /dev/null; then
    echo "✓ Redis CLI found"
    
    # Check if Redis is running
    if redis-cli ping &> /dev/null; then
        echo -e "${GREEN}✓ Redis is running${NC}"
    else
        echo -e "${YELLOW}⚠ Redis is not running. Start it with:${NC}"
        echo "  macOS/Linux: redis-server"
        echo "  Or as service: brew services start redis (macOS)"
    fi
else
    echo -e "${RED}✗ Redis not found. Install it first:${NC}"
    echo "  macOS:   brew install redis"
    echo "  Ubuntu:  sudo apt-get install redis-server"
    echo "  Windows: Download from https://github.com/microsoftarchive/redis/releases"
    exit 1
fi

echo ""
echo -e "${GREEN}✅ Database initialization complete!${NC}"
echo ""
echo "Next steps:"
echo "  1. Start Redis:      redis-server"
echo "  2. Start ClickHouse: clickhouse-server"
echo "  3. Start PostgreSQL: (usually auto-starts)"
echo "  4. Run backend:      cd packages/server && npm start"
echo "  5. Run dashboard:    cd packages/dashboard && npm run dev"