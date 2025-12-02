# Home Assistant Supervisor Docker Build Environment Research

**Research Date:** 2025-12-02
**Focus:** Understanding HA Supervisor's Docker build behavior for troubleshooting better-sqlite3 native module issues

---

## Executive Summary

Home Assistant Supervisor **migrated to BuildKit** in recent versions but has **significant limitations** that affect native Node.js module compilation. The host is running **amd64 (x86-64)** architecture, but the build environment lacks proper cross-compilation support and BuildKit features are restricted.

### Key Findings

1. ✅ **BuildKit is NOW used** - Supervisor switched from legacy docker.build() API to BuildKit via containerized builds
2. ❌ **BuildKit features limited** - `--mount` options and advanced features marked as "wontfix"
3. ⚠️ **Platform handling unclear** - Architecture selection happens via build_env.get_docker_args() (not fully documented)
4. ⚠️ **Native modules challenging** - Alpine Linux base requires extensive build tools that may not be present
5. ❌ **Cross-compilation not supported** - Building arm64 images on amd64 host requires QEMU (not default)

---

## 1. Docker Version & BuildKit Support

### Current Implementation (2025.11.6)

**Build Method:** Supervisor now uses **BuildKit via containerized builder**

```python
# From supervisor/docker/addon.py
result = self.sys_docker.run_command(
    ADDON_BUILDER_IMAGE,  # Uses docker:{major}.{minor}.{micro}-cli
    version=builder_version_tag,
    name=f"addon_builder_{addon_slug}",
    **build_env.get_docker_args(version, addon_image_tag, docker_config_path)
)
```

**Key Changes:**
- **Deprecated:** Old `docker.images.build()` Python API
- **Current:** Runs `docker run` with builder container
- **BuildKit:** Enabled by default in builder containers
- **Version:** Builder image tagged with Docker daemon version

### Historical Context

**GitHub Issue #3935 (Closed as "wontfix"):**
- **Problem:** Legacy builder didn't support `--mount` option
- **User Request:** Enable BuildKit for advanced Dockerfile features
- **Maintainer Response:** "On-the-fly addon building should remain development-only"
- **Resolution:** Maintained status quo for production addons

**GitHub Discussion #77 (Supervisor migration to BuildKit):**
- **Core Issue:** "Squash feature" not available in BuildKit
- **Decision:** Removed squash support entirely rather than maintain legacy builder
- **Implementation:** PR #5974 migrated to BuildKit without squash
- **Blocker Removed:** Docker API bug workaround required

### DOCKER_BUILDKIT Environment Variable

**Finding:** `DOCKER_BUILDKIT` is **NOT explicitly set** in Supervisor codebase
- GitHub code search for "DOCKER_BUILDKIT" returned **0 results**
- BuildKit enabled implicitly via builder container approach
- No environment variable configuration in supervisor/docker/ modules

---

## 2. Host Architecture

### Detected Architecture: **amd64 (x86-64)**

**Evidence from your logs:**
```
INFO (MainThread) [supervisor.docker.interface] Attach to image ghcr.io/hassio-addons/base/amd64:17.1.0
INFO (MainThread) [supervisor.docker.addon] Building add-on localhost/amd64-addon-ghv4 with version dev
```

**Implications:**
- Supervisor is running on **Linux/amd64** architecture
- Base images pulled: `ghcr.io/hassio-addons/base/amd64:17.1.0`
- All builds default to **amd64** platform
- Cross-compilation to arm64 would require additional setup

---

## 3. Multi-Platform Build Support

### Official Configuration (build.yaml)

**Supported Architectures:**
```yaml
# From supervisor/build.yaml
architectures:
  - aarch64  # ARM 64-bit
  - amd64    # x86-64

base_images:
  aarch64: ghcr.io/home-assistant/aarch64-base-python:3.13-alpine3.22-2025.11.1
  amd64: ghcr.io/home-assistant/amd64-base-python:3.13-alpine3.22-2025.11.1
```

### Platform Flag Handling

**From Documentation (developers.home-assistant.io):**

**Method 1: Dynamic Multi-Arch (Recommended)**
```dockerfile
ARG BUILD_FROM
FROM $BUILD_FROM
```
- Supervisor auto-substitutes correct base image
- Architecture determined by `BUILD_ARCH` build argument
- No manual `--platform` flags needed

**Method 2: Architecture-Specific Dockerfiles**
```
Dockerfile.amd64
Dockerfile.aarch64
Dockerfile.armhf
Dockerfile.armv7
Dockerfile.i386
```

**Method 3: Custom Base Images (build.yaml)**
```yaml
build_from:
  aarch64: "ghcr.io/custom/base-aarch64:latest"
  amd64: "ghcr.io/custom/base-amd64:latest"
```

### What's NOT Supported

❌ **Docker buildx multi-platform builds** (e.g., `docker buildx build --platform linux/amd64,linux/arm64`)
- Issue #3935: "wontfix" - buildx plugin not included in HAOS
- Size concern: buildx adds ~65MB to OS image
- Philosophy: Production addons should use pre-built images

❌ **On-demand cross-compilation** via QEMU
- No QEMU binfmt support mentioned in Supervisor
- Would require additional setup not included by default

---

## 4. Native Dependencies & better-sqlite3 Challenge

### Alpine Linux Build Requirements

**Base Image:** Alpine Linux 3.21/3.22 (as of 2025.11.x)

**Required Packages for Node.js Native Modules:**
```bash
apk add --no-cache \
    python3 \
    make \
    g++ \
    gcc \
    musl-dev \
    sqlite-dev  # For better-sqlite3 specifically
```

**Additional for better-sqlite3:**
```bash
apk add --no-cache \
    git \
    jq \
    sqlite
```

### Why better-sqlite3 Fails

**Issue #1: Missing Prebuilt Binaries**
- better-sqlite3 provides prebuilt binaries for common platforms
- Your combination: `Node.js 23.5.0 + Alpine Linux 3.22 + musl libc`
- **No prebuilt binary exists** for this exact combination
- Forces fallback to source compilation via node-gyp

**Issue #2: Alpine's musl vs. glibc**
- Most prebuilt Node.js native modules target **glibc** (standard Linux)
- Alpine uses **musl libc** (smaller, different ABI)
- **manylinux wheels don't work** on Alpine - requires recompilation

**Issue #3: node-gyp Build Environment**
```
gyp ERR! find Python
gyp ERR! stack Error: Could not find any Python installation to use
```
- node-gyp requires Python 3.x
- Alpine may not have Python installed by default
- build-base package needed for gcc/g++/make

**Issue #4: Cross-Architecture Compilation**
Your error log shows:
```
npm warn ... unsupported architecture: wanted {"os":"linux","arch":"arm64"} (current: {"os":"linux","arch":"x64"})
```
- Some dependency wants **arm64** architecture
- Host is **amd64/x64**
- No QEMU cross-compilation setup
- Causes "No matching version" errors

### Known Community Issues

**From Home Assistant Community Forums:**
- Node-RED addon: Frequent node-gyp failures when installing modules
- Python environment variable issues in containerized builds
- Native module compilation fails without explicit build tools

**From GitHub Issues:**
- better-sqlite3 #771: "Can't run on Arm64" - missing prebuilt binaries
- better-sqlite3 #1037: "Build failed" - general compilation issues
- claude-flow #556/#360: better-sqlite3 binding errors on macOS ARM64

---

## 5. Dockerfile Platform Flag Behavior

### How Supervisor Handles Platform

**Build Argument Injection:**
```bash
--build-arg BUILD_FROM=ghcr.io/hassio-addons/base/amd64:17.1.0
--build-arg BUILD_VERSION=dev
--build-arg BUILD_ARCH=amd64
```

**Platform Label:**
```bash
--label 'io.hass.arch=amd64'
```

**Implicit Platform Flag:**
The containerized builder likely runs with:
```bash
--platform linux/amd64
```

### What Happens in Your Build

1. **Dockerfile starts:**
   ```dockerfile
   ARG BUILD_FROM
   FROM $BUILD_FROM
   ```

2. **Supervisor substitutes:**
   ```dockerfile
   FROM ghcr.io/hassio-addons/base/amd64:17.1.0
   ```

3. **npm install runs:**
   - Detects architecture: **amd64 (x64)**
   - Checks for better-sqlite3 prebuilt binary: **NOT FOUND**
   - Attempts node-gyp compilation: **FAILS** (missing Python/build tools)

4. **Build fails** with:
   ```
   Error: Could not find any Python installation to use
   ```

---

## 6. Root Cause Analysis: Your Specific Issue

### The Problem Chain

1. **Alpine Linux 3.22** doesn't include build tools by default
2. **better-sqlite3 v11.9.2** has no prebuilt binary for your platform
3. **node-gyp** requires Python + gcc/g++/make for compilation
4. **Dockerfile missing:** `apk add --no-cache python3 make g++`
5. **Build fails** before npm can compile better-sqlite3

### Architecture Mismatch Warning

```
npm warn ... wanted {"os":"linux","arch":"arm64"} (current: {"os":"linux","arch":"x64"})
```

**Interpretation:**
- Some dependency (possibly transitive) declared it wants **arm64**
- Your build is running on **amd64/x64**
- Supervisor **does not do cross-compilation** by default
- This creates package resolution conflicts

**Possible Causes:**
1. **Incorrect config.yaml arch declaration** (claimed arm64, but host is amd64)
2. **Dependency misdeclaration** (package incorrectly specified arm64)
3. **Multi-arch confusion** (mixed architecture dependencies)

---

## 7. Solutions & Recommendations

### Solution 1: Add Build Tools to Dockerfile ✅ (Recommended)

```dockerfile
ARG BUILD_FROM
FROM $BUILD_FROM

# Install build tools for native Node.js modules
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    gcc \
    sqlite-dev

# Install Node.js dependencies
WORKDIR /app
COPY package*.json ./
RUN npm ci --production --no-optional

# Build from source if no prebuilt binary
# RUN npm rebuild better-sqlite3 --build-from-source

COPY . .
CMD ["node", "index.js"]
```

### Solution 2: Use Debian-Based Image (Alternative)

```yaml
# config.yaml
build_from:
  amd64: "ghcr.io/hassio-addons/debian-base/amd64:latest"
```

**Pros:**
- Debian has glibc (better prebuilt binary availability)
- More common target for Node.js native modules
- May have Python pre-installed

**Cons:**
- Larger image size (~300MB vs ~50MB Alpine)
- Slower builds
- Against HA philosophy of minimal images

### Solution 3: Use better-sqlite3 Alternatives

**Option A: node-sqlite3** (pure JavaScript fallback)
```bash
npm install sqlite3
```
- Has more prebuilt binaries
- Better platform support

**Option B: sql.js** (WASM-based)
```bash
npm install sql.js
```
- No native compilation needed
- Runs in-memory or with filesystem
- Performance trade-off

### Solution 4: Fix Architecture Declaration

**Check config.yaml:**
```yaml
arch:
  - amd64  # Should match your host
  # Remove arm64 if not supported
```

**Verify package.json:**
```json
{
  "os": ["linux"],
  "cpu": ["x64"]  // Not "arm64"
}
```

---

## 8. Known Limitations Summary

| Feature | Status | Notes |
|---------|--------|-------|
| **BuildKit** | ✅ Enabled | Via containerized builder (since ~2024) |
| **DOCKER_BUILDKIT=1** | ⚠️ N/A | Implicit in builder container |
| **--mount option** | ❌ Limited | Marked "wontfix" for local builds |
| **docker buildx** | ❌ Not installed | 65MB size concern |
| **Multi-platform build** | ⚠️ Partial | Pre-build only, not on-demand |
| **QEMU cross-compile** | ❌ Not supported | No binfmt setup in HAOS |
| **Alpine build tools** | ❌ Not default | Must install in Dockerfile |
| **better-sqlite3 prebuilt** | ❌ Missing | For Alpine + Node 23.x + musl |

---

## 9. Testing Recommendations

### Local Build Test (Without HA Supervisor)

```bash
# Test 1: Verify Alpine + Node.js compatibility
docker run --rm -it node:23.5-alpine sh
apk add --no-cache python3 make g++
npm install better-sqlite3
# Should succeed if build tools present

# Test 2: Test with HA base image
docker run --rm -it ghcr.io/hassio-addons/base/amd64:17.1.0 sh
apk add --no-cache python3 make g++
npm install better-sqlite3
# Verifies compatibility with HA base

# Test 3: Full Dockerfile build
docker build --platform linux/amd64 -t test-addon .
docker run --rm test-addon
```

### Verify Architecture

```bash
# Check host architecture
uname -m  # Should show: x86_64 (amd64)

# Check Docker architecture
docker info | grep Architecture  # Should show: x86_64

# Check running container
docker run --rm alpine uname -m  # Should show: x86_64
```

---

## 10. Additional Research Resources

### Official Documentation
- **HA Supervisor Repo:** https://github.com/home-assistant/supervisor
- **Addon Development Guide:** https://developers.home-assistant.io/docs/add-ons/
- **Build Configuration:** https://developers.home-assistant.io/docs/add-ons/configuration/

### Relevant GitHub Issues
- **#3935:** Building addons won't use docker buildkit (closed: wontfix)
- **#77:** Use docker buildkit to build addons (discussion)
- **#5974:** PR migrating to BuildKit (merged)

### Community Resources
- **Alpine Node.js Native Modules:** https://github.com/mhart/alpine-node/issues/27
- **better-sqlite3 Alpine Guide:** Community posts about compilation
- **HA Community Forum:** Search "node-gyp" or "native module build failed"

---

## Conclusion

**Primary Issue:** Your Dockerfile is missing build tools (python3, make, g++) required for node-gyp to compile better-sqlite3 from source on Alpine Linux.

**Secondary Issue:** Potential architecture mismatch where some dependency expects arm64 but host is amd64.

**Recommended Fix:** Add Alpine build tools to your Dockerfile **before** running `npm install`.

**Long-term Solution:** Consider using Debian-based image or switching to pure-JavaScript SQLite implementation to avoid native compilation entirely.

---

## Next Steps

1. **Immediate:** Add build tools to Dockerfile
2. **Verify:** Ensure config.yaml declares only `amd64` architecture
3. **Test:** Local Docker build before deploying to HA Supervisor
4. **Monitor:** Check build logs for Python/compilation success
5. **Consider:** Alternative SQLite libraries if issues persist
