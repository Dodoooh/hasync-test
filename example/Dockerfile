# ==============================================================================
# Multi-Stage Dockerfile for HAsync Home Assistant Add-on
# ==============================================================================
# ARCHITECTURE: Use Node from Alpine 3.15 Compatible Image
#
# CRITICAL INSIGHT: The problem is musl version mismatch
# - Alpine 3.15 has musl 1.2.2
# - Alpine 3.18 has musl 1.2.4
# - Node compiled against musl 1.2.4 won't run on musl 1.2.2
#
# SOLUTION: Build with Alpine 3.15-compatible Node (from backports or compile)
# We use node:18-alpine3.16 which has musl 1.2.3 (more compatible)
# ==============================================================================

ARG BUILD_FROM
ARG TEMPIO_VERSION
ARG BUILD_ARCH

# ==============================================================================
# STAGE 1: Frontend Build
# ==============================================================================
FROM node:18-alpine3.16 AS frontend-builder

WORKDIR /build/frontend

# Copy and install frontend dependencies
COPY rootfs/app/frontend/package*.json ./
RUN npm install --no-audit --no-fund

# Copy frontend source and build
COPY rootfs/app/frontend/tsconfig*.json ./
COPY rootfs/app/frontend/vite.config.ts ./
COPY rootfs/app/frontend/src ./src
COPY rootfs/app/frontend/public ./public
COPY rootfs/app/frontend/index.html ./

RUN npm run build && \
    ls -la dist && \
    echo "✅ Frontend build completed"

# ==============================================================================
# STAGE 2: Backend Build + Native Modules
# ==============================================================================
FROM node:18-alpine3.16 AS backend-builder

# Install build dependencies for native modules
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    sqlite-dev \
    linux-headers

WORKDIR /build/backend

# Copy and install backend dependencies (including native modules)
COPY rootfs/app/backend/package*.json ./
RUN npm install --no-audit --no-fund && \
    # Verify native modules compiled successfully
    node -e "require('better-sqlite3')" && \
    node -e "require('bcrypt')" && \
    echo "✅ Native modules compiled"

# Copy backend source
COPY rootfs/app/backend/src ./src
COPY rootfs/app/backend/tsconfig.json ./

# Install global tools (tsx for TypeScript runtime)
RUN npm install -g tsx http-server --no-audit --no-fund

# ==============================================================================
# STAGE 3: Final Runtime Image
# ==============================================================================
FROM $BUILD_FROM

ARG TEMPIO_VERSION
ARG BUILD_ARCH

# ------------------------------------------------------------------------------
# Install Runtime Dependencies + Tempio BEFORE musl replacement
# ------------------------------------------------------------------------------
# Install what we need from Alpine 3.15 repos ONLY
RUN apk add --no-cache \
    bash \
    curl \
    sqlite-libs \
    ca-certificates \
    # C++ standard library from Alpine 3.15 (will be replaced)
    libstdc++ \
    libgcc && \
    rm -rf /var/cache/apk/*

# Download Tempio NOW (before we replace musl which will break curl)
RUN curl -sSLf -o /usr/bin/tempio \
    "https://github.com/home-assistant/tempio/releases/download/${TEMPIO_VERSION}/tempio_${BUILD_ARCH}" && \
    chmod a+x /usr/bin/tempio && \
    echo "✅ Tempio downloaded"

# ------------------------------------------------------------------------------
# Copy Complete Node.js Runtime from Builder (Alpine 3.16)
# ------------------------------------------------------------------------------
# Copy Node.js binaries
COPY --from=backend-builder /usr/local/bin/node /usr/local/bin/node
COPY --from=backend-builder /usr/local/bin/npm /usr/local/bin/npm
COPY --from=backend-builder /usr/local/bin/npx /usr/local/bin/npx

# Copy Node.js libraries and modules
COPY --from=backend-builder /usr/local/lib/node_modules /usr/local/lib/node_modules

# Create symlinks for npm/npx
RUN ln -sf /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm && \
    ln -sf /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx

# Copy C++ standard libraries from builder stage
# NOTE: We do NOT copy libz.so.1 - Alpine 3.15 base has compatible version
# Copying libz from Alpine 3.18 causes relocation errors in Alpine 3.15
COPY --from=backend-builder /usr/lib/libstdc++.so.6 /usr/lib/libstdc++.so.6
COPY --from=backend-builder /usr/lib/libgcc_s.so.1 /usr/lib/libgcc_s.so.1

# CRITICAL: Copy the musl dynamic linker that Node was compiled against
# Node binary has hardcoded path to /lib/ld-musl-*.so.1
# We MUST provide the correct version (Alpine 3.16 musl 1.2.3)
# WARNING: This REPLACES the system musl, breaking some system tools
# All critical downloads (tempio) must happen BEFORE this step
COPY --from=backend-builder /lib/ld-musl-*.so.1 /lib/
COPY --from=backend-builder /lib/libc.musl-*.so.1 /lib/

# Verify Node.js works (should now work with compatible libraries and musl)
RUN /usr/local/bin/node --version && \
    /usr/local/bin/npm --version && \
    echo "✅ Node.js runtime verified"

# ------------------------------------------------------------------------------
# Create Application Directory Structure
# ------------------------------------------------------------------------------
RUN mkdir -p /app/frontend/dist \
    /app/backend/src \
    /app/backups \
    /data && \
    chmod 755 /data /app/backups

# ------------------------------------------------------------------------------
# Copy Backend Application with Compiled Native Modules
# ------------------------------------------------------------------------------
WORKDIR /app/backend

# Copy package.json
COPY rootfs/app/backend/package*.json ./

# Copy entire node_modules from builder (includes compiled native modules)
COPY --from=backend-builder /build/backend/node_modules ./node_modules

# Copy backend source code
COPY rootfs/app/backend/src ./src

# Install build tools and rebuild native modules for target architecture
RUN apk add --no-cache python3 make g++ sqlite-dev linux-headers && \
    npm rebuild better-sqlite3 bcrypt --build-from-source && \
    apk del python3 make g++ linux-headers && \
    rm -rf /var/cache/apk/* && \
    echo "✅ Native modules rebuilt for target architecture"

# Verify native modules work
RUN node -e "require('better-sqlite3')" && \
    node -e "require('bcrypt')" && \
    echo "✅ Backend native modules verified"

# ------------------------------------------------------------------------------
# Copy Global Tools from Builder
# ------------------------------------------------------------------------------
COPY --from=backend-builder /usr/local/lib/node_modules/tsx /usr/local/lib/node_modules/tsx
COPY --from=backend-builder /usr/local/lib/node_modules/http-server /usr/local/lib/node_modules/http-server

# Create symlinks for global tools
RUN ln -sf /usr/local/lib/node_modules/tsx/dist/cli.mjs /usr/local/bin/tsx && \
    ln -sf /usr/local/lib/node_modules/http-server/bin/http-server /usr/local/bin/http-server && \
    chmod +x /usr/local/bin/tsx /usr/local/bin/http-server

# Verify global tools
RUN tsx --version && \
    http-server --version && \
    echo "✅ Global tools verified"

# ------------------------------------------------------------------------------
# Copy Built Frontend from Stage 1
# ------------------------------------------------------------------------------
COPY --from=frontend-builder /build/frontend/dist /app/frontend/dist

RUN ls -la /app/frontend/dist && \
    echo "✅ Frontend assets copied"

# ------------------------------------------------------------------------------
# Copy Runtime Scripts and Configuration
# ------------------------------------------------------------------------------
COPY rootfs/run.sh /run.sh
RUN chmod a+x /run.sh

# Copy remaining rootfs files
COPY rootfs/ /

# ------------------------------------------------------------------------------
# Final Setup
# ------------------------------------------------------------------------------
WORKDIR /app

# Expose ports
EXPOSE 8099 5173

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8099/api/health || exit 1

# Startup
CMD ["/run.sh"]

# ==============================================================================
# Architecture Notes
# ==============================================================================
# This works because:
# 1. Alpine 3.16 musl (1.2.3) is binary compatible with Alpine 3.15 musl (1.2.2)
# 2. We're using Node from Alpine 3.16 which is closer to 3.15 than 3.18
# 3. Native modules compiled against musl 1.2.3 work on musl 1.2.2
# 4. We replace key libraries (libstdc++, libgcc) with 3.16 versions
# 5. System tools (curl, bash) still use original Alpine 3.15 libraries
# ==============================================================================

# ==============================================================================
# Build Instructions
# ==============================================================================
# cd /Users/domde/Documents/CLAUDE/Addon/githubv4/example/
# docker build \
#   --build-arg BUILD_FROM=ghcr.io/home-assistant/amd64-base:3.15 \
#   --build-arg TEMPIO_VERSION=2021.09.0 \
#   --build-arg BUILD_ARCH=amd64 \
#   -t hasync-test:latest .
# ==============================================================================
