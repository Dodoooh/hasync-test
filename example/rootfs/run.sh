#!/usr/bin/with-contenv bashio
# ==============================================================================
# HAsync Add-on startup script
# ==============================================================================

bashio::log.info "Starting HAsync..."

# Get configuration from add-on options
ADMIN_USERNAME=$(bashio::config 'admin_username')
ADMIN_PASSWORD=$(bashio::config 'admin_password')
JWT_SECRET=$(bashio::config 'jwt_secret')
DATABASE_PATH=$(bashio::config 'database_path')
LOG_LEVEL=$(bashio::config 'log_level')
MAX_CLIENTS=$(bashio::config 'max_clients')
RATE_LIMIT=$(bashio::config 'rate_limit')

# Export configuration as environment variables
export ADMIN_USERNAME
export ADMIN_PASSWORD
export JWT_SECRET
export DATABASE_PATH
export LOG_LEVEL
export MAX_CLIENTS
export RATE_LIMIT

# Configure CORS to allow Home Assistant addon frontend
# Use MULTIPLE methods to detect all network IPs
bashio::log.info "Detecting network interfaces..."

# Method 1: hostname -I (works in most environments)
IPS_HOSTNAME=$(hostname -I 2>/dev/null | tr ' ' '\n' | grep -E '^[0-9]+\.' || echo "")

# Method 2: ip addr show (more reliable in containers)
IPS_IP_ADDR=$(ip addr show 2>/dev/null | grep 'inet ' | awk '{print $2}' | cut -d'/' -f1 | grep -v '127.0.0.1' || echo "")

# Method 3: ip route get (gets the primary outbound IP)
PRIMARY_IP=$(ip route get 1.1.1.1 2>/dev/null | grep 'src' | awk '{print $7}' || echo "")

# Combine all detected IPs and remove duplicates
ALL_IPS=$(echo -e "${IPS_HOSTNAME}\n${IPS_IP_ADDR}\n${PRIMARY_IP}" | sort -u | grep -E '^[0-9]+\.' || echo "127.0.0.1")

bashio::log.info "Detected IPs: $(echo $ALL_IPS | tr '\n' ' ')"

# Start with localhost
CORS_ORIGINS="http://localhost:5173,http://127.0.0.1:5173,http://localhost:8099,http://127.0.0.1:8099"

# Add all detected IPs for both ports (HTTP and HTTPS)
for IP in $ALL_IPS; do
  CORS_ORIGINS="${CORS_ORIGINS},http://${IP}:5173,http://${IP}:8099,https://${IP}:5173,https://${IP}:8099"
done

export ALLOWED_ORIGINS="${CORS_ORIGINS}"

bashio::log.info "CORS origins configured: ${ALLOWED_ORIGINS}"

bashio::log.info "Configuration loaded:"
bashio::log.info "- Admin User: ${ADMIN_USERNAME}"
bashio::log.info "- Database: ${DATABASE_PATH}"
bashio::log.info "- Log Level: ${LOG_LEVEL}"
bashio::log.info "- Max Clients: ${MAX_CLIENTS}"
bashio::log.info "- Rate Limit: ${RATE_LIMIT}"

# Ensure backup directory exists
mkdir -p /app/backups
chmod 755 /app/backups
bashio::log.info "✓ Backup directory ready: /app/backups"

# Start backend server in background
cd /app/backend
bashio::log.info "Starting backend server on port 8099..."
npx tsx src/index-simple.ts &
BACKEND_PID=$!

# Start frontend server
cd /app/frontend
bashio::log.info "Starting frontend server on port 5173..."
http-server dist -p 5173 --proxy http://localhost:8099 --silent &
FRONTEND_PID=$!

# Wait for any process to exit
wait -n $BACKEND_PID $FRONTEND_PID

# Exit with status of process that exited first
EXIT_STATUS=$?
bashio::log.error "A service has exited unexpectedly with status ${EXIT_STATUS}"
exit $EXIT_STATUS
