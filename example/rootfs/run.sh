#!/usr/bin/with-contenv bashio
# ==============================================================================
# HAsync Add-on startup script
# ==============================================================================

bashio::log.info "Starting HAsync..."

# Get configuration from add-on options
JWT_SECRET=$(bashio::config 'jwt_secret')
DATABASE_PATH=$(bashio::config 'database_path')
LOG_LEVEL=$(bashio::config 'log_level')
MAX_CLIENTS=$(bashio::config 'max_clients')
RATE_LIMIT=$(bashio::config 'rate_limit')

# Export configuration as environment variables
export JWT_SECRET
export DATABASE_PATH
export LOG_LEVEL
export MAX_CLIENTS
export RATE_LIMIT

bashio::log.info "Configuration loaded:"
bashio::log.info "- Database: ${DATABASE_PATH}"
bashio::log.info "- Log Level: ${LOG_LEVEL}"
bashio::log.info "- Max Clients: ${MAX_CLIENTS}"
bashio::log.info "- Rate Limit: ${RATE_LIMIT}"

# Start backend server in background
cd /app/backend
bashio::log.info "Starting backend server on port 8099..."
npx tsx src/index-simple.ts &
BACKEND_PID=$!

# Start frontend server
cd /app/frontend
bashio::log.info "Starting frontend server on port 5173..."
http-server dist -p 5173 --proxy http://localhost:8099 &
FRONTEND_PID=$!

# Wait for any process to exit
wait -n $BACKEND_PID $FRONTEND_PID

# Exit with status of process that exited first
EXIT_STATUS=$?
bashio::log.error "A service has exited unexpectedly with status ${EXIT_STATUS}"
exit $EXIT_STATUS
