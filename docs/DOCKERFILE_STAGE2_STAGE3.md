# Complete Dockerfile Modifications for Stage 2 & 3

## Overview
This document provides the complete, production-ready Dockerfile sections for Stage 2 (backend compilation) and Stage 3 (runtime) that solve the Alpine library conflicts.

---

## Complete Dockerfile

```dockerfile
###############################################
# STAGE 1: Frontend Build
###############################################
FROM node:18-alpine AS frontend-builder

WORKDIR /build

# Copy frontend package files
COPY frontend/package*.json ./frontend/

# Install frontend dependencies
RUN cd frontend && npm ci

# Copy frontend source
COPY frontend ./frontend

# Build frontend
RUN cd frontend && npm run build

# Verify build output
RUN ls -la /build/frontend/dist

###############################################
# STAGE 2: Backend Build & Compilation
###############################################
FROM node:18-alpine AS backend-builder

WORKDIR /build

# Install build tools for native modules
# These are needed for bcrypt and better-sqlite3
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    sqlite-dev \
    git

# Copy backend package files first (for layer caching)
COPY backend/package*.json ./backend/
COPY backend/tsconfig.json ./backend/

# Install ALL dependencies including devDependencies
# This includes TypeScript, native modules, and build tools
RUN cd backend && \
    npm ci && \
    npm ls bcrypt && \
    npm ls better-sqlite3

# Copy backend source code
COPY backend/src ./backend/src
COPY backend/db ./backend/db

# Compile TypeScript to JavaScript
# Output: backend/dist/index.js
RUN cd backend && \
    npm run build && \
    ls -la dist/

# Verify compilation succeeded
RUN test -f /build/backend/dist/index.js || \
    (echo "ERROR: TypeScript compilation failed!" && exit 1)

# Verify native modules are built correctly
RUN cd backend && \
    node -e "require('bcrypt'); console.log('✓ bcrypt loaded')" && \
    node -e "require('better-sqlite3'); console.log('✓ sqlite3 loaded')"

# Remove devDependencies but keep production dependencies with native builds
RUN cd backend && \
    npm prune --production && \
    ls -la node_modules/

# Final verification of production dependencies
RUN test -d /build/backend/node_modules/bcrypt && \
    test -d /build/backend/node_modules/better-sqlite3 && \
    test -d /build/backend/node_modules/express

###############################################
# STAGE 3: Production Runtime
###############################################
# Use Alpine 3.18 base for native Node 18 support
ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base:3.18
FROM ${BUILD_FROM}

# Install Node.js 18 and runtime dependencies
# Note: Using stable repositories, NOT edge
RUN apk add --no-cache \
    nodejs \
    npm \
    sqlite-libs \
    libstdc++ \
    libgcc

# Verify Node version
RUN node --version && npm --version

# Set working directory
WORKDIR /app

# Copy Home Assistant addon configuration
COPY config.json /

# Copy pre-compiled backend
COPY --from=backend-builder /build/backend/dist ./backend/
COPY --from=backend-builder /build/backend/node_modules ./backend/node_modules/
COPY --from=backend-builder /build/backend/package*.json ./backend/

# Copy database migrations
COPY --from=backend-builder /build/backend/db ./backend/db/

# Copy frontend static files
COPY --from=frontend-builder /build/frontend/dist ./frontend/dist

# Copy startup script
COPY run.sh /
RUN chmod +x /run.sh

# Set environment variables
ENV NODE_ENV=production
ENV PATH="/app/backend/node_modules/.bin:$PATH"

# Create data directory for SQLite database
RUN mkdir -p /data && \
    chmod 755 /data && \
    chown root:root /data

# Create logs directory
RUN mkdir -p /var/log/hasync && \
    chmod 755 /var/log/hasync

# Verify all files are in place
RUN test -f /app/backend/index.js && \
    test -d /app/backend/node_modules && \
    test -d /app/frontend/dist && \
    echo "✓ All files copied successfully"

# Verify native modules load correctly
RUN cd /app/backend && \
    node -e "require('bcrypt'); console.log('✓ bcrypt works in runtime')" && \
    node -e "require('better-sqlite3'); console.log('✓ sqlite3 works in runtime')"

# Expose HTTP port
EXPOSE 8099

# Health check endpoint
HEALTHCHECK --interval=30s \
            --timeout=10s \
            --start-period=60s \
            --retries=3 \
  CMD node -e "\
    require('http').get('http://localhost:8099/api/health', (res) => {\
      process.exit(res.statusCode === 200 ? 0 : 1);\
    }).on('error', () => process.exit(1));"

# Labels for Home Assistant
LABEL \
    io.hass.version="1.0.0" \
    io.hass.type="addon" \
    io.hass.arch="amd64|aarch64|armv7"

# Run application (executes compiled JavaScript, not TypeScript)
CMD ["/run.sh"]
```

---

## Modified run.sh Script

```bash
#!/usr/bin/with-contenv bashio

set -e

bashio::log.info "Starting HAssync Addon..."

# Check if configuration is valid
if ! bashio::config.exists 'github_token'; then
    bashio::log.error "GitHub token is required!"
    exit 1
fi

# Set database path
export DATABASE_PATH="/data/hasync.db"
bashio::log.info "Database path: ${DATABASE_PATH}"

# Log Node.js version
NODE_VERSION=$(node --version)
bashio::log.info "Node.js version: ${NODE_VERSION}"

# Verify compiled backend exists
if [ ! -f "/app/backend/index.js" ]; then
    bashio::log.error "Compiled backend not found at /app/backend/index.js"
    exit 1
fi

# Verify native modules
bashio::log.info "Verifying native modules..."
cd /app/backend
node -e "require('bcrypt'); console.log('✓ bcrypt loaded')" || exit 1
node -e "require('better-sqlite3'); console.log('✓ sqlite3 loaded')" || exit 1

# Start the backend (compiled JavaScript, not TypeScript)
bashio::log.info "Starting backend server..."
cd /app/backend
exec node index.js
```

---

## Backend package.json Updates

```json
{
  "name": "hasync-backend",
  "version": "1.0.0",
  "description": "HAssync Backend Server",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts",
    "test": "jest",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "express": "^4.18.2",
    "bcrypt": "^5.1.1",
    "better-sqlite3": "^9.2.2",
    "dotenv": "^16.3.1",
    "cors": "^2.8.5",
    "helmet": "^7.1.0"
  },
  "devDependencies": {
    "typescript": "^5.3.3",
    "@types/node": "^20.10.6",
    "@types/express": "^4.17.21",
    "@types/bcrypt": "^5.0.2",
    "@types/better-sqlite3": "^7.6.8",
    "@types/cors": "^2.8.17",
    "tsx": "^4.7.0",
    "jest": "^29.7.0",
    "@types/jest": "^29.5.11"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

---

## Backend tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "moduleResolution": "node",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "removeComments": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

---

## Directory Structure

```
backend/
├── src/
│   ├── index.ts          # Main entry point
│   ├── routes/
│   ├── controllers/
│   ├── services/
│   └── utils/
├── db/
│   └── migrations/
├── dist/                 # Compiled JavaScript (generated by tsc)
│   ├── index.js
│   └── ...
├── node_modules/         # Dependencies with native builds
├── package.json
└── tsconfig.json
```

---

## Build Process Flow

```
┌─────────────────────────────────────────┐
│ Stage 2: backend-builder                │
│ (node:18-alpine)                        │
│                                         │
│ 1. Install build tools:                │
│    - python3, make, g++                │
│    - sqlite-dev                         │
│                                         │
│ 2. npm ci (install dependencies):      │
│    - TypeScript                         │
│    - bcrypt (build native module)      │
│    - better-sqlite3 (build native)     │
│    - express, etc.                      │
│                                         │
│ 3. npm run build (tsc):                │
│    - src/index.ts → dist/index.js      │
│    - src/**/*.ts → dist/**/*.js        │
│                                         │
│ 4. npm prune --production:             │
│    - Remove TypeScript                  │
│    - Remove tsx, jest, etc.            │
│    - Keep bcrypt (with native build)   │
│    - Keep better-sqlite3 (native)      │
│                                         │
│ Output:                                 │
│ ├── dist/ (compiled JavaScript)         │
│ └── node_modules/ (production only)     │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│ Stage 3: Production Runtime             │
│ (Alpine 3.18 + Node 18)                │
│                                         │
│ 1. Install Node 18 from stable repos   │
│    - nodejs, npm                        │
│    - sqlite-libs (runtime only)         │
│    - libstdc++ (for C++ modules)        │
│                                         │
│ 2. Copy from backend-builder:          │
│    - dist/ → /app/backend/             │
│    - node_modules/ → /app/backend/     │
│                                         │
│ 3. Copy from frontend-builder:         │
│    - dist/ → /app/frontend/dist        │
│                                         │
│ 4. Verify native modules load          │
│                                         │
│ 5. Run: node index.js                  │
│    (No tsx, no TypeScript)              │
└─────────────────────────────────────────┘
```

---

## Key Differences from Previous Approach

### Before (Broken)
```dockerfile
# Stage 3 tried to install Node from edge
RUN apk add --no-cache \
    --repository=http://dl-cdn.alpinelinux.org/alpine/edge/community \
    nodejs npm
# Result: Library conflicts with Alpine 3.15 base
```

### After (Fixed)
```dockerfile
# Stage 2 compiles everything with Node 18
RUN npm run build  # TypeScript → JavaScript

# Stage 3 uses stable Alpine 3.18 with Node 18
FROM ghcr.io/home-assistant/amd64-base:3.18
RUN apk add --no-cache nodejs npm  # From stable repos
COPY --from=backend-builder /build/backend/dist ./backend/
CMD node backend/index.js  # Pure JavaScript, no compilation
```

---

## Verification Commands

### After Stage 2 Build
```bash
# Build only Stage 2
docker build --target backend-builder -t hasync-stage2 .

# Check compiled output
docker run --rm hasync-stage2 ls -la /build/backend/dist

# Check native modules
docker run --rm hasync-stage2 ls -la /build/backend/node_modules/bcrypt
docker run --rm hasync-stage2 ls -la /build/backend/node_modules/better-sqlite3

# Test native modules
docker run --rm hasync-stage2 sh -c "cd /build/backend && node -e \"require('bcrypt')\""
```

### After Stage 3 Build
```bash
# Build full image
docker build -t hasync-runtime .

# Check Node version
docker run --rm hasync-runtime node --version

# Check files copied correctly
docker run --rm hasync-runtime ls -la /app/backend/

# Test native modules in runtime
docker run --rm hasync-runtime sh -c "cd /app/backend && node -e \"require('bcrypt')\""
docker run --rm hasync-runtime sh -c "cd /app/backend && node -e \"require('better-sqlite3')\""

# Test startup
docker run -p 8099:8099 hasync-runtime
```

---

## Troubleshooting

### Issue: "Cannot find module 'bcrypt'"
**Cause**: Native module not copied or built incorrectly
**Solution**:
```bash
# Verify in Stage 2
docker run --rm hasync-stage2 ls -la /build/backend/node_modules/bcrypt/lib/binding

# Verify in Stage 3
docker run --rm hasync-runtime ls -la /app/backend/node_modules/bcrypt/lib/binding
```

### Issue: "Error: Cannot find module 'dist/index.js'"
**Cause**: TypeScript compilation failed
**Solution**:
```bash
# Check Stage 2 build logs
docker build --target backend-builder -t test .

# Check tsconfig.json outDir matches
```

### Issue: "node: not found"
**Cause**: Node not installed in Stage 3
**Solution**:
```bash
# Verify Node installation
docker run --rm hasync-runtime which node
docker run --rm hasync-runtime node --version
```

---

## Migration Checklist

- [ ] Create `backend/src/` directory
- [ ] Move all `.ts` files to `backend/src/`
- [ ] Update `backend/tsconfig.json` with rootDir/outDir
- [ ] Update `backend/package.json` with build script
- [ ] Replace Dockerfile Stage 2 section
- [ ] Replace Dockerfile Stage 3 section
- [ ] Update `run.sh` to use `node index.js`
- [ ] Test Stage 2 build: `docker build --target backend-builder`
- [ ] Test Stage 3 build: `docker build .`
- [ ] Test runtime: `docker run -p 8099:8099`
- [ ] Test native modules: `bcrypt` and `better-sqlite3`
- [ ] Test database migrations
- [ ] Test API endpoints
- [ ] Update documentation

---

## Expected Build Time

- **Stage 1** (Frontend): ~30-60 seconds
- **Stage 2** (Backend): ~2-3 minutes (includes native module compilation)
- **Stage 3** (Runtime): ~30 seconds (just copies)
- **Total**: ~4-5 minutes

---

## Expected Image Sizes

- **Stage 1 output**: ~50MB (static files)
- **Stage 2 output**: ~200MB (compiled JS + node_modules)
- **Stage 3 final**: ~180MB (runtime + compiled code)

---

## Conclusion

This Dockerfile design:
1. ✅ Eliminates Alpine edge library conflicts
2. ✅ Pre-compiles TypeScript for production stability
3. ✅ Builds native modules once with consistent toolchain
4. ✅ Uses Alpine 3.18 stable repositories only
5. ✅ Runs pure JavaScript in production (no tsx overhead)
6. ✅ Reduces image size (no build tools in runtime)
7. ✅ Improves startup time (no compilation)
8. ✅ Maintains Home Assistant addon compatibility
