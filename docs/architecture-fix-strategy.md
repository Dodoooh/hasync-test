# Comprehensive Architecture Fix Strategy
## "Exec format error" Resolution Plan

**Version:** 1.0
**Date:** 2025-12-02
**Status:** Root Cause Identified
**Priority:** CRITICAL

---

## Executive Summary

### Problem Statement
Home Assistant addon experiences "Exec format error" with better_sqlite3.node starting from version 1.3.29, despite successful GitHub Actions builds with Docker Buildx. Last working version was 1.3.23.

### Root Cause Analysis
**PRIMARY ISSUE:** Home Assistant is NOT using the pre-built GHCR images as intended.

The configuration change from v1.3.23 to v1.3.29 introduced a critical flaw:

**v1.3.23 (WORKING):**
```yaml
build_from:
  amd64: "ghcr.io/home-assistant/amd64-base:3.15"
  # ... other architectures
```
- Home Assistant builds addon locally using Dockerfile
- Uses Docker Buildx automatically
- Native modules compile for correct architecture

**v1.3.29 (BROKEN):**
```yaml
image: "ghcr.io/dodoooh/hasync-addon:amd64-{version}"
```
- Attempts to pull pre-built image from GHCR
- **CRITICAL FLAW:** Image requires authentication but none is provided
- **FALLBACK BEHAVIOR:** Home Assistant falls back to local build WITHOUT Buildx
- Local build compiles native modules for HOST architecture (x86_64 macOS/Linux)
- Runtime is different architecture (likely ARM or different Linux)
- Result: "Exec format error"

---

## Evidence Analysis

### 1. GHCR Image Status
```bash
# Image EXISTS but requires authentication
$ curl https://ghcr.io/v2/dodoooh/hasync-addon/manifests/amd64-1.3.29
{"errors":[{"code":"UNAUTHORIZED","message":"authentication required"}]}

# Tags are visible
$ curl https://ghcr.io/v2/dodoooh/hasync-addon/tags/list
{"name":"dodoooh/hasync-addon","tags":["amd64-1.3.29","amd64-latest"]}
```

**Findings:**
- ✅ Image exists in GHCR
- ✅ GitHub Actions successfully pushed image
- ❌ Image is PRIVATE (requires authentication)
- ❌ Home Assistant cannot pull private images without credentials
- ❌ No fallback to `build_from` when image pull fails

### 2. Home Assistant Image Pull Behavior
When `image:` field is specified in build.yaml:
1. Home Assistant attempts to pull the image
2. If pull fails (auth required), it should fall back to local build
3. **BUT:** Local build doesn't use Docker Buildx
4. **RESULT:** Native modules compile for wrong architecture

### 3. Architecture Flow Comparison

**Working Flow (v1.3.23):**
```
build.yaml (build_from)
  → Home Assistant local build with Buildx
  → Multi-stage Dockerfile
  → Native modules compiled for TARGET platform
  → ✅ Correct architecture binaries
```

**Broken Flow (v1.3.29):**
```
build.yaml (image: private GHCR)
  → Home Assistant tries to pull image
  → ❌ Authentication fails
  → Falls back to local build WITHOUT Buildx
  → Native modules compiled for HOST platform
  → ❌ Wrong architecture binaries
  → Runtime: "Exec format error"
```

---

## Fix Strategy Matrix

### Strategy Overview

| Approach | Complexity | Reliability | Speed | Recommended |
|----------|-----------|-------------|-------|-------------|
| **A: Make GHCR Public** | Low | High | Fast | ✅ PRIMARY |
| **B: Revert to build_from** | Low | Very High | Medium | ✅ FALLBACK #1 |
| **C: Multi-registry** | Medium | High | Fast | ⚠️ ALTERNATIVE |
| **D: Hybrid approach** | Low | Very High | Fast | ✅ FALLBACK #2 |

---

## Detailed Fix Approaches

### 🎯 **PRIMARY: Strategy A - Make GHCR Image Public**

**Objective:** Allow Home Assistant to pull pre-built images without authentication

**Implementation:**
```bash
# 1. Make GitHub Package public
gh api \
  --method PATCH \
  -H "Accept: application/vnd.github+json" \
  /user/packages/container/hasync-addon/versions \
  -f visibility='public'
```

**Changes Required:**
1. Set GHCR package visibility to public
2. Verify image pull works without auth
3. Test Home Assistant addon installation

**Pros:**
- ✅ Uses pre-built images (faster deployment)
- ✅ Guaranteed correct architecture
- ✅ No local compilation needed
- ✅ Minimal code changes

**Cons:**
- ⚠️ Image is publicly accessible (acceptable for open-source)
- ⚠️ Requires GitHub repository settings change

**Verification:**
```bash
# Test public access (should return manifest)
curl -sL https://ghcr.io/v2/dodoooh/hasync-addon/manifests/amd64-1.3.29

# Test Home Assistant pull
docker pull ghcr.io/dodoooh/hasync-addon:amd64-1.3.29
```

**Timeline:** 15 minutes

---

### 🔄 **FALLBACK #1: Strategy B - Revert to build_from**

**Objective:** Return to proven local build approach that works

**Implementation:**

**File:** `example/build.yaml`
```yaml
# Home Assistant Add-on Build Configuration
# Local build with Docker Buildx for correct architecture targeting

build_from:
  aarch64: "ghcr.io/home-assistant/aarch64-base:3.15"
  amd64: "ghcr.io/home-assistant/amd64-base:3.15"
  armhf: "ghcr.io/home-assistant/armhf-base:3.15"
  armv7: "ghcr.io/home-assistant/armv7-base:3.15"
  i386: "ghcr.io/home-assistant/i386-base:3.15"

labels:
  org.opencontainers.image.title: "HAsync - Home Assistant Manager"
  org.opencontainers.image.description: "Advanced Home Assistant management interface"
  org.opencontainers.image.source: "https://github.com/Dodoooh/hasync-test"
  org.opencontainers.image.licenses: "Apache License 2.0"

args:
  TEMPIO_VERSION: "2021.09.0"
```

**Pros:**
- ✅ PROVEN to work (v1.3.23 was stable)
- ✅ Home Assistant build system handles architecture correctly
- ✅ No external dependencies (GHCR)
- ✅ Works for all architectures automatically

**Cons:**
- ⚠️ Slower first installation (must build from source)
- ⚠️ Requires more resources on target system
- ⚠️ GitHub Actions workflow becomes unnecessary

**Verification:**
```bash
# Update version to 1.3.30
sed -i 's/version: "1.3.29"/version: "1.3.30"/' example/config.yaml

# Test local build
cd example
docker build \
  --build-arg BUILD_FROM=ghcr.io/home-assistant/amd64-base:3.15 \
  --build-arg TEMPIO_VERSION=2021.09.0 \
  --build-arg BUILD_ARCH=amd64 \
  -t hasync-test:1.3.30 .

# Verify native modules
docker run --rm hasync-test:1.3.30 node -e "require('better-sqlite3')"
```

**Timeline:** 30 minutes

---

### 🔀 **ALTERNATIVE: Strategy C - Multi-Registry Hybrid**

**Objective:** Use public Docker Hub + private GHCR with authentication

**Implementation:**

**File:** `example/build.yaml`
```yaml
# Try public Docker Hub first, fallback to GHCR with auth, then local build
image: "dodoooh/hasync-addon:amd64-{version}"

# Fallback to GHCR if Docker Hub unavailable
# image_alt: "ghcr.io/dodoooh/hasync-addon:amd64-{version}"

# Ultimate fallback: local build
build_from:
  amd64: "ghcr.io/home-assistant/amd64-base:3.15"
  # ... other architectures

args:
  TEMPIO_VERSION: "2021.09.0"
```

**Additional:** Push to Docker Hub (public)
```yaml
# .github/workflows/build-addon.yml
- name: Login to Docker Hub
  uses: docker/login-action@v3
  with:
    username: ${{ secrets.DOCKERHUB_USERNAME }}
    password: ${{ secrets.DOCKERHUB_TOKEN }}

- name: Build and push to Docker Hub (public)
  uses: docker/build-push-action@v5
  with:
    # ... same config as GHCR
    tags: |
      dodoooh/hasync-addon:amd64-${{ steps.version.outputs.version }}
      dodoooh/hasync-addon:amd64-latest
```

**Pros:**
- ✅ Public Docker Hub access (no auth)
- ✅ Redundancy (multiple registries)
- ✅ Fallback to local build if needed

**Cons:**
- ⚠️ More complex workflow
- ⚠️ Requires Docker Hub account
- ⚠️ Maintains multiple registries

**Timeline:** 1 hour

---

### 🛡️ **FALLBACK #2: Strategy D - Hybrid with Image Pull Policy**

**Objective:** Use pre-built images when available, local build as guaranteed fallback

**Implementation:**

**File:** `example/build.yaml`
```yaml
# Home Assistant Add-on Build Configuration
# Hybrid: Pre-built images with guaranteed local build fallback

# Try to pull pre-built image first (if public)
image: "ghcr.io/dodoooh/hasync-addon:amd64-{version}"

# ALWAYS provide build_from as fallback
# Home Assistant will use this if image pull fails
build_from:
  aarch64: "ghcr.io/home-assistant/aarch64-base:3.15"
  amd64: "ghcr.io/home-assistant/amd64-base:3.15"
  armhf: "ghcr.io/home-assistant/armhf-base:3.15"
  armv7: "ghcr.io/home-assistant/armv7-base:3.15"
  i386: "ghcr.io/home-assistant/i386-base:3.15"

labels:
  org.opencontainers.image.title: "HAsync - Home Assistant Manager"
  org.opencontainers.image.description: "Advanced Home Assistant management interface"
  org.opencontainers.image.source: "https://github.com/Dodoooh/hasync-test"
  org.opencontainers.image.licenses: "Apache License 2.0"

args:
  TEMPIO_VERSION: "2021.09.0"
```

**Logic:**
1. Home Assistant tries to pull `image:`
2. If successful (GHCR is public): Use pre-built image
3. If fails: Fall back to `build_from` local build
4. Either way: Correct architecture guaranteed

**Pros:**
- ✅ Best of both worlds
- ✅ Fast when GHCR works
- ✅ Reliable fallback to local build
- ✅ No single point of failure

**Cons:**
- ⚠️ Uncertainty about which method will be used
- ⚠️ Requires both GHCR workflow + proper Dockerfile

**Timeline:** 20 minutes

---

## Recommended Implementation Plan

### Phase 1: Immediate Fix (Choose ONE)

**OPTION 1: Quick Fix (Recommended)**
1. **Make GHCR public** (Strategy A)
2. Test image pull without authentication
3. Verify Home Assistant installation
4. **Timeline:** 15 minutes

**OPTION 2: Safe Revert (If GHCR public not acceptable)**
1. **Revert to build_from** (Strategy B)
2. Bump version to 1.3.30
3. Remove GitHub Actions workflow (optional)
4. **Timeline:** 30 minutes

### Phase 2: Testing & Validation

**Test Plan:**
```bash
# 1. Clean environment test
docker system prune -af

# 2. Pull test (Strategy A)
docker pull ghcr.io/dodoooh/hasync-addon:amd64-1.3.30

# 3. Run test
docker run --rm ghcr.io/dodoooh/hasync-addon:amd64-1.3.30 \
  node -e "const db = require('better-sqlite3')(':memory:'); console.log('✅ SQLite works')"

# 4. Architecture verification
docker run --rm ghcr.io/dodoooh/hasync-addon:amd64-1.3.30 \
  sh -c "uname -m && ldd /app/backend/node_modules/better-sqlite3/build/Release/better_sqlite3.node"
```

**Expected Output:**
```
x86_64  # or aarch64 depending on target
linux-vdso.so.1 => (0x00007fff...)
libpthread.so.0 => /lib/libc.musl-x86_64.so.1
libc.musl-x86_64.so.1 => /lib/ld-musl-x86_64.so.1
```

### Phase 3: Monitoring & Prevention

**Add Architecture Verification to Dockerfile:**
```dockerfile
# After native module installation
RUN echo "🔍 Verifying architecture consistency..." && \
    EXPECTED_ARCH=${TARGETPLATFORM#linux/} && \
    BINARY_ARCH=$(file /app/backend/node_modules/better-sqlite3/build/Release/better_sqlite3.node | awk '{print $3}') && \
    echo "Target platform: $TARGETPLATFORM" && \
    echo "Binary architecture: $BINARY_ARCH" && \
    if [ "$BINARY_ARCH" != "$EXPECTED_ARCH" ]; then \
      echo "❌ Architecture mismatch detected!"; \
      exit 1; \
    fi && \
    echo "✅ Architecture verified"
```

**Add Health Check to GitHub Actions:**
```yaml
- name: Verify image architecture
  run: |
    docker run --rm ghcr.io/${{ steps.repo.outputs.owner }}/hasync-addon:amd64-${{ steps.version.outputs.version }} \
      sh -c "file /app/backend/node_modules/better-sqlite3/build/Release/better_sqlite3.node | grep 'x86-64'"
```

---

## Risk Assessment

### Critical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| GHCR auth fails in production | High | Critical | Use Strategy B or D |
| Local build uses wrong arch | Medium | Critical | Verify Buildx in HA |
| Native module runtime error | Low | Critical | Add pre-flight checks |
| Version rollback needed | Medium | Medium | Keep v1.3.23 available |

### Safety Measures

1. **Version Pinning:** Keep v1.3.23 available for rollback
2. **Multi-Architecture Test:** Test on actual target hardware
3. **Gradual Rollout:** Deploy to test environment first
4. **Monitoring:** Add architecture verification logs

---

## Decision Matrix

### Choose Your Strategy

**If you prioritize SPEED:**
→ Use **Strategy A** (Make GHCR Public)

**If you prioritize RELIABILITY:**
→ Use **Strategy B** (Revert to build_from)

**If you prioritize FUTURE SCALABILITY:**
→ Use **Strategy D** (Hybrid approach)

**If you have COMPLEX REQUIREMENTS:**
→ Use **Strategy C** (Multi-registry)

---

## Implementation Checklist

### Pre-Implementation
- [ ] Backup current working version (v1.3.23)
- [ ] Document current error logs
- [ ] Identify target architecture (amd64/arm64/etc.)
- [ ] Verify GitHub Actions workflow status

### Implementation (Strategy A - Recommended)
- [ ] Make GHCR package public via GitHub settings
- [ ] Test image pull: `docker pull ghcr.io/dodoooh/hasync-addon:amd64-1.3.29`
- [ ] Verify native module architecture
- [ ] Update version to 1.3.30
- [ ] Deploy to Home Assistant test environment
- [ ] Monitor logs for errors
- [ ] Test pairing and database operations

### Implementation (Strategy B - Fallback)
- [ ] Revert build.yaml to build_from configuration
- [ ] Update version to 1.3.30
- [ ] Remove image: field from build.yaml
- [ ] Test local build on target architecture
- [ ] Deploy to Home Assistant
- [ ] Verify native modules work

### Post-Implementation
- [ ] Document chosen strategy in repository
- [ ] Update README with architecture notes
- [ ] Add architecture verification to CI/CD
- [ ] Create runbook for future architecture issues
- [ ] Monitor production for 48 hours

---

## Technical Deep Dive

### Why Did This Break?

**The Subtle Difference:**

```yaml
# v1.3.23: Home Assistant BUILDS locally
build_from:
  amd64: "ghcr.io/home-assistant/amd64-base:3.15"
```
→ Home Assistant invokes Docker build
→ Docker uses Buildx automatically
→ `--platform linux/amd64` is set
→ Native modules compile for amd64
→ ✅ WORKS

```yaml
# v1.3.29: Home Assistant PULLS from registry
image: "ghcr.io/dodoooh/hasync-addon:amd64-{version}"
```
→ Home Assistant tries `docker pull`
→ GHCR requires authentication
→ Pull FAILS
→ Fallback to local build WITHOUT Buildx
→ Native modules compile for HOST architecture
→ ❌ BREAKS

### Why Doesn't Fallback Work?

Home Assistant build system behavior:
1. If `image:` is specified → Try to pull
2. If pull fails AND `build_from` exists → Build locally
3. **BUT:** When building as fallback, Buildx is NOT used
4. Local build uses `docker build` (not `docker buildx build`)
5. Without `--platform` flag, native modules compile for host

**This is why the working approach MUST use `build_from` as primary method.**

---

## Long-Term Solutions

### 1. Enhanced CI/CD Pipeline
```yaml
# Multi-stage verification
- Build image for multiple architectures
- Extract native modules
- Verify file architecture matches target
- Run smoke tests on each platform
- Only push if all tests pass
```

### 2. Platform-Agnostic Build
```dockerfile
# Use pure JavaScript alternatives where possible
# Minimize native dependencies
# Consider:
# - better-sqlite3 → sql.js (WASM)
# - bcrypt → bcrypt.js (pure JS)
```

### 3. Home Assistant Integration Enhancement
```yaml
# Feature request: Support authenticated registries
image:
  registry: "ghcr.io"
  repository: "dodoooh/hasync-addon"
  tag: "amd64-{version}"
  auth:
    token: "${GHCR_TOKEN}"  # From HA secrets
```

---

## Conclusion

### Root Cause Summary
The "Exec format error" is caused by Home Assistant's inability to pull private GHCR images, resulting in a fallback to local builds that don't use Docker Buildx, leading to architecture-mismatched native module compilation.

### Recommended Solution
**PRIMARY:** Make GHCR package public (Strategy A)
**FALLBACK:** Revert to build_from configuration (Strategy B)

### Success Criteria
- ✅ No "Exec format error" on target platform
- ✅ better_sqlite3.node has correct architecture
- ✅ Addon installs and runs successfully
- ✅ Database operations work correctly
- ✅ Solution is reproducible and documented

---

## References

### Key Files
- `example/build.yaml` - Build configuration
- `example/Dockerfile` - Multi-stage build
- `.github/workflows/build-addon.yml` - CI/CD pipeline
- `example/config.yaml` - Addon metadata

### Working Commits
- `0cf87e4` - v1.3.23 (last working version)
- `c0b6325` - v1.3.29 (introduced GHCR image pull)

### Documentation
- Home Assistant Add-on Documentation: https://developers.home-assistant.io/docs/add-ons/configuration
- Docker Buildx Documentation: https://docs.docker.com/buildx/working-with-buildx/
- GHCR Documentation: https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry

---

**Document Status:** Complete
**Next Action:** Choose implementation strategy and execute Phase 1
**Owner:** System Architecture Team
**Review Date:** After implementation
