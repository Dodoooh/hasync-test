# HAsync - Home Assistant Manager

**Version 1.1.7**

Advanced Home Assistant management interface with client pairing and entity synchronization.

## Features

- **Client Pairing & Management** - Secure client registration and authentication
- **Entity Synchronization** - Real-time entity state synchronization across clients
- **WebSocket Updates** - Live updates via WebSocket connections
- **Modern React Frontend** - Responsive web interface on port 5173
- **TypeScript Backend** - Express API server on port 8099
- **SQLite Database** - Persistent storage for clients and entity mappings

## Configuration

After installation, configure the addon with these options:

- **jwt_secret** - Secret key for JWT token generation (change in production!)
- **database_path** - Path to SQLite database file (default: /data/hasync.db)
- **log_level** - Logging level: debug, info, warn, or error
- **max_clients** - Maximum number of connected clients (1-1000)
- **rate_limit** - API rate limit requests per minute (100-10000)

## How to use

1. Install and start the addon
2. Access the web interface at http://[HOST]:5173
3. Configure your JWT secret for production use
4. Pair clients using the pairing interface
5. Configure entity synchronization between clients

## API Endpoints

- Backend API: `http://[HOST]:8099`
- Frontend UI: `http://[HOST]:5173`
- Health check: `http://[HOST]:8099/health`

## Support

For issues and questions, visit the [GitHub repository](https://github.com/Dodoooh/hasync-test)
