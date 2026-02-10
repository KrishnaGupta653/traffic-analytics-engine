@echo off
echo ============================================
echo Traffic Analytics System - Quick Setup
echo ============================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo [1/5] Installing dependencies...
echo.

REM Install root dependencies
echo Installing root dependencies...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to install root dependencies
    pause
    exit /b 1
)

REM Install client SDK dependencies
echo Installing client SDK dependencies...
cd packages\client-sdk
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to install client SDK dependencies
    pause
    exit /b 1
)
cd ..\..

REM Install server dependencies
echo Installing server dependencies...
cd packages\server
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to install server dependencies
    pause
    exit /b 1
)
cd ..\..

REM Install dashboard dependencies
echo Installing dashboard dependencies...
cd packages\dashboard
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to install dashboard dependencies
    pause
    exit /b 1
)
cd ..\..

echo.
echo [2/5] Building client SDK...
echo.
cd packages\client-sdk
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to build client SDK
    pause
    exit /b 1
)
cd ..\..

echo.
echo [3/5] Checking environment files...
echo.

if not exist "packages\server\.env" (
    echo WARNING: Server .env file not found
    echo Creating from template...
    copy "packages\server\.env.example" "packages\server\.env" >nul 2>nul
    echo Please edit packages\server\.env with your database credentials
)

if not exist "packages\dashboard\.env.local" (
    echo WARNING: Dashboard .env.local file not found
    echo Creating from template...
    copy "packages\dashboard\.env.example" "packages\dashboard\.env.local" >nul 2>nul
)

echo.
echo [4/5] Verifying database connections...
echo.
echo NOTE: Make sure PostgreSQL, ClickHouse, and Redis are running!
echo.

echo [5/5] Setup complete!
echo.
echo ============================================
echo Next Steps:
echo ============================================
echo 1. Ensure databases are running:
echo    - PostgreSQL (port 5432)
echo    - ClickHouse (port 8123)
echo    - Redis (port 6379)
echo.
echo 2. Run database schemas:
echo    psql -U postgres -d traffic_analytics -f database\postgres\schema.sql
echo    clickhouse-client --database=traffic_analytics ^< database\clickhouse\schema.sql
echo.
echo 3. Start the server:
echo    cd packages\server
echo    npm run dev
echo.
echo 4. Start the dashboard (in new terminal):
echo    cd packages\dashboard
echo    npm run dev
echo.
echo 5. Open dashboard:
echo    http://localhost:3001
echo.
echo ============================================
echo.
pause


