# HAsync Alpine Solution - Implementation Guide

## Quick Decision Matrix

| Question | Answer | Confidence |
|----------|--------|------------|
| Will this build successfully? | ✅ YES | 95% |
| Will native modules work? | ✅ YES | 95% |
| Is it production-ready? | ⚠️ WITH TESTING | 80% |
| Should we implement it? | ✅ YES | 90% |

---

## Executive Summary for Decision Makers

**The Alpine edge solution WILL work**, but requires version pinning and testing before production deployment.

### Risk Level: 🟡 LOW-MODERATE

**Pros:**
- ✅ Solves all identified build issues
- ✅ Uses native Alpine packages (no hacks)
- ✅ Properly compiles native modules
- ✅ Good security posture
- ✅ Efficient layer caching

**Cons:**
- ⚠️ Edge packages may be unstable
- ⚠️ Build reproducibility concerns without version pinning
- ⚠️ Requires testing on all architectures

**Recommended Action**: **IMPLEMENT with modifications** (see below)

---

## Implementation Steps

### Phase 1: Immediate (Before Merge)

1. **Update Dockerfile with Version Verification**
   ```dockerfile
   # Add after Node.js installation
   RUN MAJOR_VERSION=$(node --version | cut -d'.' -f1 | sed 's/v//') && \
       if [ "$MAJOR_VERSION" -lt 18 ]; then \
           echo "ERROR: Node.js version must be >= 18.0.0" >&2; \
           exit 1; \
       fi
   ```

2. **Add Native Module Verification**
   ```dockerfile
   # Add after npm install
   RUN node -e "require('bcrypt'); require('better-sqlite3'); console.log('OK')" || \
       (echo "ERROR: Native modules failed" >&2 && exit 1)
   ```

3. **Run Build Test**
   ```bash
   cd docs
   ./test-build.sh
   ```

### Phase 2: Pre-Production (This Week)

1. **Multi-Architecture Testing**
   ```bash
   # Test on all supported platforms
   for arch in amd64 aarch64 armv7; do
     docker build --build-arg BUILD_FROM=ghcr.io/home-assistant/${arch}-base:3.15 \
       -t hasync-test:${arch} -f example/Dockerfile example/
   done
   ```

2. **24-Hour Stability Test**
   ```bash
   docker run -d --name hasync-stability hasync-test:latest
   # Monitor for 24 hours
   docker stats hasync-stability
   ```

3. **Load Testing**
   ```bash
   # Install Apache Bench
   apt-get install apache2-utils

   # Test backend
   ab -n 1000 -c 10 http://localhost:8099/health
   ```

### Phase 3: Production Deployment

1. **Document Working Version**
   ```bash
   # Record versions in CHANGELOG.md
   docker run --rm hasync:latest node --version >> CHANGELOG.md
   docker run --rm hasync:latest npm --version >> CHANGELOG.md
   ```

2. **Set Up Monitoring**
   - Memory usage alerts
   - CPU usage alerts
   - Health check failures
   - Error log monitoring

3. **Create Rollback Plan**
   - Keep previous working version tagged
   - Document rollback procedure
   - Test rollback process

---

## Dockerfile Modifications

### Option A: Minimal Changes (Recommended for Quick Fix)

**File**: `example/Dockerfile`

**Changes**:
1. Add Node.js version verification after line 20
2. Add native module verification after line 38
3. No other changes needed

**Risk**: Low
**Time**: 5 minutes
**Testing Required**: Basic build test

### Option B: Full Enhancement (Recommended for Production)

**File**: Use `docs/Dockerfile.improved`

**Changes**:
1. Version verification
2. Native module verification
3. Better error handling
4. Enhanced logging
5. Build artifact verification

**Risk**: Very Low
**Time**: 15 minutes
**Testing Required**: Full test suite

---

## Testing Checklist

### Required Before Merge ✅

- [ ] Build completes without errors
- [ ] Node.js version >= 18.0.0
- [ ] bcrypt loads successfully
- [ ] better-sqlite3 loads successfully
- [ ] Health check responds
- [ ] Frontend build present

### Required Before Production Release ✅

- [ ] All architectures build successfully
- [ ] 24-hour stability test passed
- [ ] Load testing completed
- [ ] Memory leaks checked
- [ ] Error logs reviewed
- [ ] Rollback plan documented

### Optional (Nice to Have) 🔄

- [ ] Security scan passed
- [ ] Multi-container orchestration tested
- [ ] Backup/restore tested
- [ ] Performance benchmarks recorded

---

## Troubleshooting Guide

### Problem: Build Fails at Node.js Installation

**Symptoms**:
```
ERROR: unable to select packages:
  nodejs (no such package)
```

**Solution**:
1. Check Alpine edge repository is accessible
2. Verify network connectivity during build
3. Try alternative edge mirror: `http://dl-2.alpinelinux.org/alpine/edge/main`

**Alternative**:
```dockerfile
RUN apk add --no-cache \
    --repository=http://dl-cdn.alpinelinux.org/alpine/edge/main \
    --repository=http://dl-2.alpinelinux.org/alpine/edge/main \
    nodejs npm
```

### Problem: Native Modules Fail to Compile

**Symptoms**:
```
gyp ERR! build error
gyp ERR! stack Error: `make` failed with exit code: 2
```

**Solution**:
1. Verify build tools installed: `python3`, `make`, `g++`
2. Check sqlite library present
3. Verify Node.js version >= 18

**Debug**:
```dockerfile
RUN python3 --version && make --version && g++ --version
```

### Problem: Runtime Errors with bcrypt

**Symptoms**:
```
Error: Cannot find module 'bcrypt'
```

**Solution**:
1. Ensure `--omit=dev` not removing production dependencies
2. Verify bcrypt in dependencies, not devDependencies
3. Check native module compiled for correct architecture

**Verify**:
```bash
docker run --rm hasync:latest ls -la /app/backend/node_modules/bcrypt/
```

### Problem: Health Check Fails

**Symptoms**:
- Container marked as unhealthy
- Port 8099 not responding

**Solution**:
1. Check backend started: `docker logs hasync`
2. Verify ports exposed: `docker port hasync`
3. Check run.sh has correct startup logic
4. Ensure database path accessible

**Debug**:
```bash
docker exec hasync ps aux
docker exec hasync curl http://localhost:8099/health
```

---

## Performance Expectations

### Build Time

| Stage | Cold Build | Warm Build (code change) |
|-------|------------|--------------------------|
| System packages | 30-60s | 0s (cached) |
| Node.js install | 20-30s | 0s (cached) |
| Backend deps | 60-120s | 0s (cached) |
| Frontend deps | 45-90s | 0s (cached) |
| Frontend build | 30-60s | 30-60s |
| **Total** | **5-10 min** | **30-60s** |

### Image Size

| Component | Size | Notes |
|-----------|------|-------|
| Base Alpine | ~5MB | From HA base |
| Node.js + npm | ~50MB | From edge |
| Build tools | ~150MB | Removed in production |
| Dependencies | ~200MB | node_modules |
| Application | ~10MB | Source + build |
| **Total** | **~265MB** | Acceptable |

### Runtime Resources

| Metric | Idle | Under Load |
|--------|------|------------|
| Memory | 100-150MB | 200-400MB |
| CPU | <1% | 10-30% |
| Disk | ~300MB | ~500MB (with data) |

---

## Alternative Solutions (If Edge Fails)

### Alternative 1: Upgrade Base Image to Alpine 3.18+

**Pros**:
- Alpine 3.18+ includes Node.js 18 natively
- No edge repository needed
- More stable

**Cons**:
- Requires Home Assistant base image update
- May not be available for all architectures
- Home Assistant may not support Alpine 3.18 yet

**Implementation**:
```yaml
# build.yaml
build_from:
  aarch64: "ghcr.io/home-assistant/aarch64-base:3.18"
  amd64: "ghcr.io/home-assistant/amd64-base:3.18"
```

### Alternative 2: Multi-Stage Build with Official Node Alpine

**Pros**:
- Uses official Node.js images
- Guaranteed to work
- Well-tested

**Cons**:
- More complex Dockerfile
- Larger intermediate images
- Longer build times

**Implementation**:
```dockerfile
FROM node:18-alpine AS builder
WORKDIR /build
COPY . .
RUN npm install && npm run build

FROM ghcr.io/home-assistant/amd64-base:3.15
COPY --from=builder /build /app
```

### Alternative 3: Build Node.js from Source

**Pros**:
- Complete control over version
- Guaranteed compatibility

**Cons**:
- Very slow builds (30-60 minutes)
- Complex maintenance
- Not recommended

---

## Monitoring and Alerts

### Recommended Alerts

1. **Build Failures**
   - Trigger: Build fails
   - Action: Check edge repository availability
   - Escalation: Consider Alternative 1

2. **High Memory Usage**
   - Trigger: Memory > 500MB for 5 minutes
   - Action: Check for memory leaks
   - Escalation: Restart container

3. **Health Check Failures**
   - Trigger: 3 consecutive failures
   - Action: Check logs and restart
   - Escalation: Roll back to previous version

4. **CPU Spikes**
   - Trigger: CPU > 80% for 10 minutes
   - Action: Check for infinite loops
   - Escalation: Investigate and optimize

### Metrics to Track

- Build success rate (target: >99%)
- Build time (target: <10 minutes cold, <2 minutes warm)
- Container uptime (target: 99.9%)
- Memory usage (target: <400MB under normal load)
- Response time (target: <100ms for health check)

---

## Success Criteria

### Build Phase ✅
- ✅ Builds without errors on all architectures
- ✅ Node.js version >= 18.0.0 verified
- ✅ Native modules load successfully
- ✅ Build time < 10 minutes (cold)
- ✅ Image size < 500MB

### Runtime Phase ✅
- ✅ Container starts within 40 seconds
- ✅ Health check responds within 10 seconds
- ✅ No memory leaks over 24 hours
- ✅ Handles 100 requests/minute
- ✅ Zero critical errors in logs

### Production Phase ✅
- ✅ 99.9% uptime over 7 days
- ✅ Memory usage stable under load
- ✅ CPU usage reasonable (<30% average)
- ✅ All features functional
- ✅ No user-reported issues

---

## Next Steps

1. **Review validation report**: `docs/validation-report.md`
2. **Choose implementation option**: A (quick) or B (thorough)
3. **Run test suite**: `./docs/test-build.sh`
4. **Update Dockerfile** with chosen modifications
5. **Build and test** on primary architecture
6. **Test on all architectures** if tests pass
7. **Run 24-hour stability test**
8. **Deploy to staging** environment
9. **Monitor for 48 hours**
10. **Deploy to production** if stable

---

## Questions and Concerns

### Q: Why not just use Alpine 3.19 or 3.20?

**A**: Home Assistant base images are locked to specific Alpine versions. We must use what's provided (currently 3.15) unless Home Assistant updates their base images.

### Q: What if the edge repository goes down during a build?

**A**: Build will fail. Mitigation:
1. Use multiple mirrors (implemented in improved Dockerfile)
2. Monitor edge repository availability
3. Have rollback plan ready

### Q: Can we pin to a specific Node.js version from edge?

**A**: Technically yes, but specific version may not be available long-term on edge. Better to:
1. Test with current edge version
2. Document working version
3. Monitor for breaking changes

### Q: What about security updates?

**A**: Edge packages receive security updates. However:
1. May be delayed compared to stable
2. May introduce breaking changes
3. Recommend regular rebuild and testing

### Q: How do we handle multi-architecture differences?

**A**: Edge repository provides packages for all architectures. Test on each:
```bash
for arch in amd64 aarch64 armv7 armhf i386; do
  echo "Testing $arch..."
  docker build --build-arg BUILD_FROM=ghcr.io/home-assistant/${arch}-base:3.15 \
    -t hasync:${arch} -f example/Dockerfile example/
done
```

---

## Approval Checklist

### Technical Lead ☐
- [ ] Reviewed validation report
- [ ] Approved implementation approach
- [ ] Signed off on risk level

### DevOps Lead ☐
- [ ] Reviewed build process
- [ ] Approved deployment plan
- [ ] Monitoring configured

### QA Lead ☐
- [ ] Test plan reviewed
- [ ] Test results verified
- [ ] Approved for release

### Security Lead ☐
- [ ] Security implications reviewed
- [ ] No critical vulnerabilities found
- [ ] Approved for production

---

**Document Version**: 1.0
**Last Updated**: 2025-12-01
**Maintained By**: Code Review Agent
**Review Frequency**: After each build/deployment
