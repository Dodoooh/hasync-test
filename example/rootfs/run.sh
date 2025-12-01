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

# Configure CORS to allow Home Assistant addon frontend
# Get ALL network interfaces to ensure frontend can connect
ALL_IPS=$(hostname -I 2>/dev/null | tr ' ' '\n' | grep -E '^[0-9]+\.' || echo "127.0.0.1")
CORS_ORIGINS="http://localhost:5173,http://127.0.0.1:5173,http://localhost:8099,http://127.0.0.1:8099"

# Add all detected IPs for both ports
for IP in $ALL_IPS; do
  CORS_ORIGINS="${CORS_ORIGINS},http://${IP}:5173,http://${IP}:8099"
done

export ALLOWED_ORIGINS="${CORS_ORIGINS}"

bashio::log.info "CORS origins configured for: ${ALLOWED_ORIGINS}"

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
