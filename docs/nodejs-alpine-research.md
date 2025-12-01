# Node.js 18+ on Alpine Linux 3.15 - Research Analysis

**Research Date:** December 1, 2025
**Researcher:** Claude Code Research Agent
**Context:** Home Assistant Addon requiring Vite 5 and modern npm packages

## Executive Summary

Current setup uses Alpine 3.15 (Node 16) but requires Node 18+ for Vite 5 compatibility. Research reveals **Alpine 3.17/3.18 with native Node 18** is the optimal solution, with Home Assistant now supporting Alpine 3.20-3.22 base images.

---

## Problem Statement

**Current Environment:**
- Base Image: `ghcr.io/home-assistant/amd64-base:3.15` (Alpine 3.15, musl libc)
- Node Version: 16 (default in Alpine 3.15)
- Requirement: Node 18+ for Vite 5 and modern packages

**Issues Encountered:**
1. Alpine 3.15 repos only have Node 16
2. Official Node.js binaries are glibc-based (incompatible with musl)
3. Alpine edge Node 24 has library conflicts (libstdc++, sqlite3, pthread symbols)

---

## Key Research Findings

### 1. Alpine Linux & Node.js Version Matrix

| Alpine Version | Node.js Version | Status | Release Date |
|----------------|----------------|---------|--------------|
| 3.15 | 16.13.0 | EOL (Nov 2021) | November 2021 |
| 3.16 | 16.20.2 | EOL | May 2022 |
| 3.17 | **18.20.1** | ✅ **Available** | November 2022 |
| 3.18 | **18.20.1** | ✅ **Available** | May 2023 |
| 3.19 | 20.x | Available | December 2023 |
| 3.20 | 20.x | **Current HA Base** | May 2024 |
| 3.21 | 22.x | **Current HA Base** | December 2024 |
| 3.22 | 22.x | **Latest HA Base** | 2025 |

### 2. Home Assistant Base Image Status

**Official HA Base Images (github.com/home-assistant/docker-base):**
- **Latest Supported:** Alpine 3.20, 3.21, 3.22
- **Alpine 3.15:** No longer maintained (EOL)
- **Recommendation:** Upgrade to 3.20+ for security updates

**Community Add-ons Base Images:**
- `hassio-addons/base-nodejs` - **ARCHIVED as of Feb 2025**
- Was created for Alpine 3.19 + Node 18 workaround (QEMU armv7 bug)
- Now deprecated - use official Alpine 3.20+ with native Node

### 3. Node.js Binary Compatibility

**musl vs glibc:**
- Alpine uses musl libc (not glibc)
- Official Node.js binaries from nodejs.org are glibc-based
- Must use either:
  - Alpine package manager (`apk add nodejs`)
  - Unofficial musl builds: https://unofficial-builds.nodejs.org/

**Unofficial Builds:**
- Maintained by Node.js community
- Status: "Experimental" but well-tested
- Requires: `apk add libstdc++` (not installed by default)
- URL: `https://unofficial-builds.nodejs.org/download/release/v18.16.0/node-v18.16.0-linux-x64-musl.tar.gz`

### 4. Multi-Stage Build Best Practices (2025)

**Pattern for Vite + Node.js Backend:**

```dockerfile
# Stage 1: Build frontend with Node 18+
FROM node:18-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Runtime with tsx backend
FROM alpine:3.18
RUN apk add --no-cache nodejs npm
RUN npm install -g tsx http-server
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist
COPY backend/ /app/backend/
WORKDIR /app/backend
RUN npm install --omit=dev
```

**Benefits:**
- Smaller final image (no build tools)
- Reduced attack surface
- Faster deployment
- Layer caching optimization

---

## Recommended Solutions (Ranked)

### 🥇 **SOLUTION 1: Upgrade to Alpine 3.17/3.18 Base Image**

**Implementation:**
```yaml
# build.yaml
build_from:
  aarch64: "ghcr.io/home-assistant/aarch64-base:3.18"
  amd64: "ghcr.io/home-assistant/amd64-base:3.18"
  armhf: "ghcr.io/home-assistant/armhf-base:3.18"
  armv7: "ghcr.io/home-assistant/armv7-base:3.18"
  i386: "ghcr.io/home-assistant/i386-base:3.18"
```

```dockerfile
# Dockerfile - Simple installation
RUN apk add --no-cache \
    nodejs \
    npm \
    python3 \
    make \
    g++ \
    sqlite
```

**Pros:**
- ✅ Native Node 18.20.1 from Alpine repos (musl-compiled)
- ✅ No edge repository conflicts
- ✅ Official Alpine package with security updates
- ✅ Simple Dockerfile (single RUN command)
- ✅ Full Home Assistant compatibility
- ✅ No library conflicts (all deps match Alpine 3.18)
- ✅ Still supported by Alpine community

**Cons:**
- ⚠️ Requires changing base image (may affect other dependencies)
- ⚠️ Alpine 3.18 reached EOL in May 2025 (recommend 3.20+)

**Complexity:** ⭐ **LOW** (10 minutes)

**Risk:** ⭐⭐ **LOW-MEDIUM** (test all addon features)

---

### 🥈 **SOLUTION 2: Upgrade to Latest HA Base (Alpine 3.20-3.22)**

**Implementation:**
```yaml
# build.yaml
build_from:
  aarch64: "ghcr.io/home-assistant/aarch64-base:3.20"
  amd64: "ghcr.io/home-assistant/amd64-base:3.20"
  # Note: 3.20-3.22 only support aarch64 and amd64
```

```dockerfile
# Dockerfile - Node 20+ available
RUN apk add --no-cache \
    nodejs \
    npm \
    python3 \
    make \
    g++ \
    sqlite

# Backend runs with tsx
WORKDIR /app/backend
RUN npm install --omit=dev
```

**Pros:**
- ✅ **Latest Home Assistant standard** (Alpine 3.20-3.22)
- ✅ Node 20+ available (exceeds requirement)
- ✅ Active security updates and support
- ✅ Future-proof for years
- ✅ Official Alpine packages
- ✅ Best long-term solution

**Cons:**
- ⚠️ **armhf and i386 architectures no longer supported**
- ⚠️ More significant base image change
- ⚠️ May require dependency updates
- ⚠️ Need to test all integrations

**Complexity:** ⭐⭐ **MEDIUM** (30-60 minutes)

**Risk:** ⭐⭐⭐ **MEDIUM** (breaking changes possible)

**Notes:**
- Home Assistant officially moved to 3.20+ in 2024
- This aligns with HA ecosystem direction
- Recommended for NEW addons or MAJOR updates

---

### 🥉 **SOLUTION 3: Multi-Stage Build (Pre-build Frontend)**

**Implementation:**
```dockerfile
# Stage 1: Build frontend with official Node 18 image
FROM node:18-alpine AS frontend-builder

WORKDIR /app/frontend
COPY rootfs/app/frontend/package*.json ./
RUN npm install --no-audit --no-fund

COPY rootfs/app/frontend/ ./
RUN npm run build

# Stage 2: Runtime on Alpine 3.15 with Node 16
FROM $BUILD_FROM

# Install Node 16 (sufficient for tsx backend)
RUN apk add --no-cache \
    nodejs \
    npm \
    python3 \
    make \
    g++ \
    sqlite

# Copy pre-built frontend
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Install backend dependencies (tsx works on Node 16)
WORKDIR /app/backend
COPY rootfs/app/backend/package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY rootfs/app/backend/src ./src

# Install tsx globally
RUN npm install -g tsx http-server

WORKDIR /app
```

**Pros:**
- ✅ Keep Alpine 3.15 base (minimal change)
- ✅ Frontend built with Node 18 (Vite compatible)
- ✅ Backend runs on Node 16 (tsx compatible)
- ✅ Smaller final image size
- ✅ No runtime Node 18 requirement
- ✅ Clear separation of concerns

**Cons:**
- ⚠️ More complex Dockerfile
- ⚠️ Still on EOL Alpine 3.15
- ⚠️ Longer build times
- ⚠️ Two-stage builds harder to debug
- ⚠️ No security updates for Alpine 3.15

**Complexity:** ⭐⭐⭐ **MEDIUM** (1-2 hours)

**Risk:** ⭐⭐ **LOW-MEDIUM** (well-tested pattern)

---

## Alternative Approaches (Not Recommended)

### ❌ Alpine Edge Repository (Node 24)

**Why Not:**
- Library conflicts (libstdc++, sqlite3, pthread)
- Unstable package versions
- Not suitable for production
- Breaks Alpine 3.15 base compatibility

### ❌ Unofficial musl Binaries

**Why Not:**
- Experimental status
- Manual binary management
- No automatic security updates
- Requires `libstdc++` installation
- More maintenance burden

### ❌ Compile Node 18 from Source

**Why Not:**
- Extremely long build times (10-30+ minutes)
- Requires build dependencies in final image
- Complex to maintain
- No security update path
- Large image size

---

## Decision Matrix

| Criteria | Solution 1 (3.17/3.18) | Solution 2 (3.20-3.22) | Solution 3 (Multi-Stage) |
|----------|------------------------|------------------------|--------------------------|
| **Implementation Time** | ⭐⭐⭐⭐⭐ 10 min | ⭐⭐⭐⭐ 30-60 min | ⭐⭐⭐ 1-2 hours |
| **Risk Level** | ⭐⭐⭐⭐ Low-Medium | ⭐⭐⭐ Medium | ⭐⭐⭐⭐ Low-Medium |
| **Security Updates** | ⭐⭐ EOL May 2025 | ⭐⭐⭐⭐⭐ Active | ⭐ EOL (3.15 base) |
| **Future-Proof** | ⭐⭐⭐ 1-2 years | ⭐⭐⭐⭐⭐ 3+ years | ⭐⭐ Limited |
| **Image Size** | ⭐⭐⭐ Standard | ⭐⭐⭐ Standard | ⭐⭐⭐⭐ Optimized |
| **HA Compatibility** | ⭐⭐⭐⭐ Good | ⭐⭐⭐⭐⭐ Best | ⭐⭐⭐ Good |
| **Arch Support** | ⭐⭐⭐⭐⭐ All 5 | ⭐⭐⭐ aarch64/amd64 only | ⭐⭐⭐⭐⭐ All 5 |
| **Maintenance** | ⭐⭐⭐⭐ Easy | ⭐⭐⭐⭐⭐ Easy | ⭐⭐⭐ Moderate |

---

## Recommendation

**For IMMEDIATE SOLUTION:** Use **Solution 1 (Alpine 3.17/3.18)** - Fast, low-risk, solves the problem.

**For LONG-TERM SOLUTION:** Use **Solution 2 (Alpine 3.20-3.22)** - Aligns with Home Assistant ecosystem, best future support.

**For OPTIMIZATION-FOCUSED:** Use **Solution 3 (Multi-Stage)** if image size is critical and you need to stay on 3.15.

### Hybrid Approach (Recommended Path)

1. **Week 1:** Implement Solution 1 (Alpine 3.18) to unblock development
2. **Week 2-3:** Test all addon features on Alpine 3.18
3. **Week 4:** Plan migration to Alpine 3.20+ (Solution 2)
4. **Month 2:** Production deployment on Alpine 3.20/3.21

---

## Implementation Steps (Solution 1 - Quick Win)

### Step 1: Update build.yaml
```yaml
build_from:
  aarch64: "ghcr.io/home-assistant/aarch64-base:3.18"
  amd64: "ghcr.io/home-assistant/amd64-base:3.18"
  armhf: "ghcr.io/home-assistant/armhf-base:3.18"
  armv7: "ghcr.io/home-assistant/armv7-base:3.18"
  i386: "ghcr.io/home-assistant/i386-base:3.18"
```

### Step 2: Simplify Dockerfile
```dockerfile
FROM $BUILD_FROM

# Install Node 18 from Alpine 3.18 repos (native musl)
RUN apk add --no-cache \
    nodejs \
    npm \
    python3 \
    make \
    g++ \
    sqlite \
    curl \
    bash

# Continue with existing build steps...
```

### Step 3: Test Build
```bash
docker build --build-arg BUILD_FROM=ghcr.io/home-assistant/amd64-base:3.18 -t test-addon .
```

### Step 4: Verify Node Version
```bash
docker run --rm test-addon node --version
# Expected: v18.20.1
```

### Step 5: Test Addon Functionality
- Backend API endpoints
- Frontend serving
- Database operations
- WebSocket connections
- Home Assistant integration

---

## Migration Checklist

- [ ] Backup current working Dockerfile
- [ ] Update `build.yaml` with new base images
- [ ] Remove Alpine edge repository references
- [ ] Test build on development machine
- [ ] Verify Node version (18+)
- [ ] Test frontend build (Vite)
- [ ] Test backend startup (tsx)
- [ ] Check all API endpoints
- [ ] Verify WebSocket connections
- [ ] Test database migrations
- [ ] Check logs for errors
- [ ] Test on multiple architectures (if possible)
- [ ] Update CHANGELOG.md
- [ ] Update documentation

---

## Additional Resources

### Official Documentation
- Alpine Package Search: https://pkgs.alpinelinux.org/
- Home Assistant Base Images: https://github.com/home-assistant/docker-base
- Home Assistant Addon Docs: https://developers.home-assistant.io/docs/add-ons/

### Node.js Resources
- Unofficial musl builds: https://unofficial-builds.nodejs.org/
- Alpine Node.js images: https://github.com/nodejs/docker-node

### Community Resources
- HA Community Add-ons (archived): https://github.com/hassio-addons/addon-base-nodejs
- Alpine Linux Wiki: https://wiki.alpinelinux.org/

---

## Conclusion

**Alpine 3.17/3.18 provides the optimal balance** of:
- ✅ Native Node 18 support
- ✅ Minimal code changes
- ✅ Low implementation risk
- ✅ Good compatibility

**However, for NEW addons or MAJOR updates**, starting directly with **Alpine 3.20-3.22** is recommended to align with current Home Assistant standards and ensure long-term support.

The current Alpine 3.15 with edge repositories approach is **not sustainable** and should be replaced with one of the recommended solutions.

---

**Research Status:** Complete
**Next Action:** Review with development team and select solution
**Estimated Implementation:** 10 minutes (Solution 1) to 2 hours (Solution 3)
