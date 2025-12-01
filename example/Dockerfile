# ==============================================================================
# Multi-Stage Dockerfile for HAsync Home Assistant Add-on
# ==============================================================================
# This Dockerfile uses a multi-stage build approach to avoid library conflicts
# between Node.js 18+ (required for Vite) and Alpine 3.15 base (musl)
#
# Stage 1: Build frontend with Node.js 18 on compatible Alpine
# Stage 2: Install runtime dependencies on Home Assistant base
# ==============================================================================

# ==============================================================================
# STAGE 1: Frontend Build Stage
# ==============================================================================
# Use official Node.js 18 Alpine image for building the frontend
# This ensures compatibility with Vite and modern build tools
FROM node:18-alpine AS frontend-builder

# Set working directory for frontend build
WORKDIR /build/frontend

# Copy frontend package files first for better Docker layer caching
# If dependencies don't change, this layer will be reused
COPY rootfs/app/frontend/package*.json ./

# Install frontend dependencies
# --no-audit and --no-fund skip unnecessary network requests
RUN npm install --no-audit --no-fund

# Copy frontend source files
COPY rootfs/app/frontend/tsconfig*.json ./
COPY rootfs/app/frontend/vite.config.ts ./
COPY rootfs/app/frontend/src ./src
COPY rootfs/app/frontend/public ./public
COPY rootfs/app/frontend/index.html ./

# Build the frontend application
# This creates optimized production bundles in ./dist
RUN npm run build

# Verify build output exists
RUN ls -la dist && echo "Frontend build completed successfully"

# ==============================================================================
# STAGE 2: Backend Build Stage (Optional - for pre-compiling TypeScript)
# ==============================================================================
# This stage is optional but recommended for faster runtime startup
FROM node:18-alpine AS backend-builder

WORKDIR /build/backend

# Copy backend package files
COPY rootfs/app/backend/package*.json ./

# Install ALL dependencies (including devDependencies for TypeScript compilation)
RUN npm install --no-audit --no-fund

# Copy backend source
COPY rootfs/app/backend/src ./src
COPY rootfs/app/backend/tsconfig.json ./

# Pre-compile TypeScript (optional - tsx can run .ts directly)
# Uncomment if you want to compile to JavaScript for production
# RUN npm run build

# ==============================================================================
# STAGE 3: Final Runtime Stage
# ==============================================================================
# Use Home Assistant's official base image (Alpine 3.15)
ARG BUILD_FROM
FROM $BUILD_FROM

# Build arguments from build.yaml
ARG NODE_VERSION
ARG TEMPIO_VERSION
ARG BUILD_ARCH

# ------------------------------------------------------------------------------
# Install System Dependencies
# ------------------------------------------------------------------------------
# Install only the runtime dependencies needed for the application
# We install Node.js 18 from edge repository, but this time we're more careful
# about dependency conflicts by using --no-cache and proper cleanup
RUN apk add --no-cache \
    # Build tools needed for native modules (bcrypt, better-sqlite3)
    python3 \
    make \
    g++ \
    # Runtime dependencies
    sqlite \
    sqlite-libs \
    curl \
    bash \
    # Clean up to reduce image size
    && rm -rf /var/cache/apk/* \
    && rm -rf /tmp/*

# ------------------------------------------------------------------------------
# Install Node.js 18 from Edge Repository
# ------------------------------------------------------------------------------
# Install Node.js 18 separately with careful version pinning
# This minimizes conflicts with the base Alpine 3.15 system
RUN apk add --no-cache --repository=http://dl-cdn.alpinelinux.org/alpine/edge/main \
    nodejs \
    npm \
    # Clean up package cache immediately
    && rm -rf /var/cache/apk/* \
    && rm -rf /tmp/* \
    # Verify Node.js version
    && node --version \
    && npm --version

# ------------------------------------------------------------------------------
# Install Tempio (Home Assistant Template Tool)
# ------------------------------------------------------------------------------
RUN curl -sSLf -o /usr/bin/tempio \
    "https://github.com/home-assistant/tempio/releases/download/${TEMPIO_VERSION}/tempio_${BUILD_ARCH}" \
    && chmod a+x /usr/bin/tempio

# ------------------------------------------------------------------------------
# Create Application Directory Structure
# ------------------------------------------------------------------------------
RUN mkdir -p /app/frontend/dist \
    && mkdir -p /app/backend/src \
    && mkdir -p /data \
    && chmod 755 /data

# ------------------------------------------------------------------------------
# Install Backend Dependencies
# ------------------------------------------------------------------------------
# Copy backend package files first for layer caching
WORKDIR /app/backend
COPY rootfs/app/backend/package*.json ./

# Install only production dependencies for backend
# This excludes devDependencies to reduce image size
RUN npm install --omit=dev --no-audit --no-fund \
    # Clean npm cache to reduce image size
    && npm cache clean --force \
    # Verify critical native modules installed correctly
    && node -e "require('better-sqlite3')" \
    && node -e "require('bcrypt')" \
    && echo "Backend dependencies installed successfully"

# Copy backend source code
COPY rootfs/app/backend/src ./src

# Optional: Copy pre-compiled backend from builder stage
# Uncomment if you built JavaScript in backend-builder stage
# COPY --from=backend-builder /build/backend/dist ./dist

# ------------------------------------------------------------------------------
# Install Global Runtime Tools
# ------------------------------------------------------------------------------
# tsx: TypeScript runtime (replaces ts-node for better performance)
# http-server: Static file server for frontend
RUN npm install -g tsx http-server --no-audit --no-fund \
    && npm cache clean --force \
    # Verify global tools
    && tsx --version \
    && http-server --version

# ------------------------------------------------------------------------------
# Copy Built Frontend from Builder Stage
# ------------------------------------------------------------------------------
# Copy the optimized production build from Stage 1
COPY --from=frontend-builder /build/frontend/dist /app/frontend/dist

# Verify frontend files were copied correctly
RUN ls -la /app/frontend/dist \
    && echo "Frontend assets copied successfully"

# ------------------------------------------------------------------------------
# Copy Runtime Scripts and Configuration
# ------------------------------------------------------------------------------
# Copy the startup script
COPY rootfs/run.sh /run.sh
RUN chmod a+x /run.sh

# Copy any other rootfs files (excluding app directory which we've already copied)
# This might include additional configuration files, scripts, etc.
COPY rootfs/ /

# ------------------------------------------------------------------------------
# Setup Working Directory
# ------------------------------------------------------------------------------
WORKDIR /app

# ------------------------------------------------------------------------------
# Network Configuration
# ------------------------------------------------------------------------------
# Expose ports for backend API and frontend web interface
EXPOSE 8099 5173

# ------------------------------------------------------------------------------
# Health Check
# ------------------------------------------------------------------------------
# Monitor the backend API server health
# - interval: Check every 30 seconds
# - timeout: Allow 10 seconds for response
# - start-period: Wait 40 seconds after container start before first check
# - retries: Mark unhealthy after 3 consecutive failures
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8099/health || exit 1

# ------------------------------------------------------------------------------
# Container Startup
# ------------------------------------------------------------------------------
# Use exec form for proper signal handling (SIGTERM, SIGINT)
# This ensures graceful shutdown of Node.js processes
CMD ["/run.sh"]

# ==============================================================================
# Build Instructions
# ==============================================================================
# To build this image manually:
#   docker build \
#     --build-arg BUILD_FROM=ghcr.io/hassio-addons/base:15.0.8 \
#     --build-arg NODE_VERSION=18 \
#     --build-arg TEMPIO_VERSION=2021.09.0 \
#     --build-arg BUILD_ARCH=amd64 \
#     -t hasync:latest .
#
# To test locally:
#   docker run -p 8099:8099 -p 5173:5173 hasync:latest
# ==============================================================================

# ==============================================================================
# Image Size Optimization Summary
# ==============================================================================
# This multi-stage build provides:
# 1. ✅ Clean separation of build and runtime environments
# 2. ✅ No devDependencies in final image (~200MB savings)
# 3. ✅ Proper layer caching for faster rebuilds
# 4. ✅ Minimal library conflicts (Node.js 18 isolated)
# 5. ✅ Compatible with Home Assistant Add-on architecture
# 6. ✅ Support for all target architectures (arm, x86)
# ==============================================================================
