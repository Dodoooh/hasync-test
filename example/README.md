# HAsync - Home Assistant Manager (v1.4.0)

Advanced Home Assistant management interface with multi-client support, real-time synchronization, and secure pairing.

![Supports aarch64 Architecture][aarch64-shield]
![Supports amd64 Architecture][amd64-shield]
![Supports armhf Architecture][armhf-shield]
![Supports armv7 Architecture][armv7-shield]
![Supports i386 Architecture][i386-shield]

[aarch64-shield]: https://img.shields.io/badge/aarch64-yes-green.svg
[amd64-shield]: https://img.shields.io/badge/amd64-yes-green.svg
[armhf-shield]: https://img.shields.io/badge/armhf-yes-green.svg
[armv7-shield]: https://img.shields.io/badge/armv7-yes-green.svg
[i386-shield]: https://img.shields.io/badge/i386-yes-green.svg

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Configuration](#configuration)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Documentation](#documentation)
- [Development](#development)
- [Support](#support)

---

## Features

### Core Functionality

✅ **Multi-Client Management**
- Pair unlimited tablets, phones, and kiosk devices
- Assign specific areas to each client
- Real-time entity synchronization
- Secure token-based authentication

✅ **Secure Pairing Process** (Enhanced in v1.4.0!)
- PIN-based device verification
- **NEW:** Prominent countdown timer with color coding
- **NEW:** Real-time progress bar
- 5-minute PIN expiration for security
- WebSocket-based real-time updates

✅ **Area Management**
- Group entities by room/location
- Drag-and-drop reordering
- Enable/disable areas
- Assign areas to specific clients

✅ **Home Assistant Integration**
- Fetch entities from HA
- Control lights, switches, sensors
- Real-time state updates
- Long-Lived Access Token support

✅ **Security**
- JWT Bearer token authentication
- Client token hashing (SHA-256)
- CSRF protection (auto-skipped for JWT)
- Rate limiting on all endpoints
- TLS support

✅ **GDPR Compliance**
- Data export functionality
- Right to be forgotten
- Privacy policy
- Consent management

---

## Installation

### Requirements

- Home Assistant OS
- Supervisor add-on support
- Internet connection (for initial setup)

### Home Assistant Add-on Installation

1. **Add Repository**

   In Home Assistant, navigate to:
   ```
   Supervisor → Add-on Store → ⋮ (top right) → Repositories
   ```

   Add repository URL:
   ```
   https://github.com/Dodoooh/hasync-test
   ```

2. **Install HAsync**

   - Find "HAsync - Home Assistant Manager" in the add-on store
   - Click "Install"
   - Wait for installation to complete

3. **Configure**

   See [Configuration](#configuration) section below.

4. **Start**

   - Click "Start"
   - Enable "Start on boot" (recommended)
   - Enable "Watchdog" (recommended)

5. **Access**

   Click "Open Web UI" or navigate to:
   ```
   http://homeassistant.local:5173
   ```

---

## Configuration

### Basic Configuration (config.yaml)

```yaml
name: HAsync - Home Assistant Manager
version: "1.4.0"
slug: example
description: Advanced Home Assistant management interface

options:
  # Admin credentials (CHANGE IN PRODUCTION!)
  admin_username: "admin"
  admin_password: "change-this-password"

  # JWT secret (CHANGE IN PRODUCTION!)
  jwt_secret: "change-this-in-production-use-long-random-string"

  # Database location
  database_path: "/data/hasync.db"

  # Logging
  log_level: "info"  # debug | info | warn | error

  # Performance
  max_clients: 100
  rate_limit: 500

schema:
  admin_username: str
  admin_password: str
  jwt_secret: str
  database_path: str
  log_level: list(debug|info|warn|error)
  max_clients: int(1,1000)
  rate_limit: int(100,10000)
```

### Security Best Practices

**1. Change Default Password**

```yaml
options:
  admin_password: "use-strong-random-password-min-16-chars"
```

**2. Generate Strong JWT Secret**

```bash
# Generate 64-character random secret
openssl rand -hex 32
```

```yaml
options:
  jwt_secret: "<paste-generated-secret-here>"
```

**3. Enable TLS (Production)**

```yaml
options:
  tls_enabled: true
  tls_cert_path: "/ssl/fullchain.pem"
  tls_key_path: "/ssl/privkey.pem"
```

---

## Quick Start

### 1. First Login

1. Open web interface: `http://homeassistant.local:5173`
2. Login with credentials from config.yaml:
   - Username: `admin`
   - Password: (as configured)

### 2. Configure Home Assistant Connection

1. Navigate to **Settings** tab
2. Enter Home Assistant details:
   - **URL:** `http://homeassistant.local:8123` (or your HA URL)
   - **Token:** Long-Lived Access Token from HA

**How to get HA Long-Lived Access Token:**

1. In Home Assistant, click your profile (bottom left)
2. Scroll down to "Long-Lived Access Tokens"
3. Click "Create Token"
4. Give it a name (e.g., "HAsync")
5. Copy the token and paste into HAsync Settings

### 3. Create Areas

1. Navigate to **Areas** tab
2. Click "Add Area"
3. Configure:
   - Name: "Living Room"
   - Entities: Select lights, switches, sensors
   - Icon: Choose from Material Design Icons
4. Click "Save"

### 4. Pair a Client Device

1. Navigate to **Pairing** tab
2. Click "Generate PIN"
3. **NEW in v1.4.0:** Watch the countdown timer!
   - Large, prominent display
   - Color-coded urgency (green → yellow → red)
   - Progress bar
4. On client device, enter the 6-digit PIN
5. Wait for verification (real-time update)
6. Assign areas to the client
7. Click "Complete Pairing"

### 5. Client Device Setup

On the paired client device:

1. Install HAsync client app (implementation-specific)
2. Enter the PIN displayed on admin interface
3. Wait for pairing completion
4. Client automatically receives:
   - Access token
   - Assigned areas
   - Entity list

---

## Architecture

### Technology Stack

**Frontend:**
- React 18 with TypeScript
- Material-UI (MUI) components
- Zustand state management
- Vite build system
- Socket.IO client

**Backend:**
- Node.js with Express.js
- SQLite3 (better-sqlite3)
- Socket.IO server
- JWT authentication
- CSRF protection (csurf)

**Communication:**
- REST API (HTTP/HTTPS)
- WebSocket (Socket.IO)
- Real-time bidirectional updates

### Directory Structure

```
example/
├── config.yaml                  # Add-on configuration
├── Dockerfile                   # Docker build instructions
├── rootfs/
│   └── app/
│       ├── backend/             # Express.js server
│       │   ├── src/
│       │   │   ├── index-simple.ts  # Main server file
│       │   │   ├── config/          # TLS configuration
│       │   │   ├── middleware/      # Auth, CSRF, logging
│       │   │   ├── routes/          # API routes
│       │   │   ├── services/        # WebSocket events
│       │   │   └── utils/           # Token, validation, logging
│       │   └── package.json
│       └── frontend/            # React application
│           ├── src/
│           │   ├── App.tsx         # Main app component
│           │   ├── components/     # UI components
│           │   ├── api/            # API client
│           │   ├── hooks/          # React hooks
│           │   ├── context/        # Zustand stores
│           │   └── types/          # TypeScript types
│           ├── index.html
│           └── package.json
├── docs/                        # Documentation
│   ├── API-REFERENCE.md
│   ├── AUTHENTICATION.md
│   ├── CLIENT-PAIRING.md
│   └── TROUBLESHOOTING.md
├── CHANGELOG.md                 # Version history
└── README.md                    # This file
```

### Database Schema

**Tables:**
- `clients` - Paired client devices
- `pairing_sessions` - Temporary pairing sessions
- `areas` - Area configurations
- `config` - System configuration

See [API-REFERENCE.md](docs/API-REFERENCE.md) for detailed schema.

---

## Documentation

Comprehensive documentation is available in the `docs/` directory:

| Document | Description |
|----------|-------------|
| [API-REFERENCE.md](docs/API-REFERENCE.md) | Complete REST API documentation |
| [AUTHENTICATION.md](docs/AUTHENTICATION.md) | Authentication flow and JWT tokens |
| [CLIENT-PAIRING.md](docs/CLIENT-PAIRING.md) | Client pairing process (with v1.4.0 updates) |
| [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Common issues and solutions |

### Interactive API Documentation

Swagger UI is available when the server is running:

```
http://homeassistant.local:8099/api-docs
```

---

## Development

### Prerequisites

- Node.js 18+
- npm 8+
- Docker (for building addon)

### Local Development Setup

**Backend:**

```bash
cd rootfs/app/backend
npm install
export JWT_SECRET="test-secret-$(openssl rand -hex 32)"
export DATABASE_PATH="/tmp/hasync-dev.db"
export ADMIN_USERNAME="admin"
export ADMIN_PASSWORD="test123"
npm run dev
```

**Frontend:**

```bash
cd rootfs/app/frontend
npm install
npm run dev
```

### Building Docker Image

```bash
docker build -t hasync-addon:dev -f Dockerfile .
```

### Running Tests

```bash
# Backend tests
cd rootfs/app/backend
npm test

# Frontend tests
cd rootfs/app/frontend
npm test
```

### Code Quality

```bash
# Linting
npm run lint

# Type checking
npm run typecheck

# Format
npm run format
```

---

## Version History

### v1.4.0 (2025-12-02)

**New Features:**
- ✨ Enhanced pairing UI with prominent countdown timer
- ✨ Color-coded timer (green → yellow → red based on urgency)
- ✨ Real-time progress bar for PIN expiration
- ✨ Removed confusing end time display

**Bug Fixes:**
- 🐛 Fixed setAuth() overwriting admin JWT token (v1.3.44)
- 🐛 Fixed Settings component using fetch() instead of apiClient (v1.3.43)
- 🐛 Restored console logging in production builds (v1.3.42)
- 🐛 Added frontend version logging (v1.3.41)
- 🐛 Fixed race condition in token sync (v1.3.40)
- 🐛 Added token sync after page refresh (v1.3.39)

See [CHANGELOG.md](CHANGELOG.md) for complete version history.

---

## Support

### Getting Help

1. **Documentation:** Check [docs/](docs/) directory first
2. **Issues:** Report bugs at GitHub Issues
3. **Discussions:** Community support via GitHub Discussions

### Reporting Bugs

When reporting issues, please include:

- HAsync version (visible in UI and `/api/health`)
- Home Assistant version
- Browser and OS
- Steps to reproduce
- Error messages from:
  - Browser console (F12 → Console)
  - Add-on logs (Supervisor → HAsync → Log)

### Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Write/update tests
5. Submit a pull request

---

## License

Copyright (c) 2025 HAsync Project

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

---

## Acknowledgments

- Material-UI team for excellent React components
- Socket.IO team for real-time communication
- Home Assistant community for inspiration
- All contributors and testers

---

**Last Updated:** 2025-12-02 (v1.4.0)

**Repository:** https://github.com/Dodoooh/hasync-test
