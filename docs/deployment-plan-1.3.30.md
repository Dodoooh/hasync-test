# Deployment Plan for Version 1.3.30

## Executive Summary
This document outlines the comprehensive test and deployment plan for version 1.3.30 of the GitHub Issues Addon, addressing the "Exec format error" issue caused by local builds in Home Assistant.

---

## Phase 1: Pre-Deployment Testing

### 1.1 Local Docker Build Verification

**Objective:** Verify local build works correctly before deployment

**Steps:**
```bash
# Clean existing builds
docker system prune -af

# Build for arm64 architecture (Home Assistant default)
docker buildx build --platform linux/arm64 -t test-addon:1.3.30 .

# Verify build completed successfully
docker images | grep test-addon

# Expected output:
# test-addon    1.3.30    <image-id>    X seconds ago    XXX MB
```

**Verification Checklist:**
- [ ] Build completes without errors
- [ ] Image size is reasonable (< 500MB)
- [ ] No permission errors during build
- [ ] All dependencies installed correctly

---

### 1.2 Architecture and Binary Format Verification

**Objective:** Confirm correct architecture targeting

**Steps:**
```bash
# Inspect image architecture
docker inspect test-addon:1.3.30 | grep -A 5 "Architecture"

# Expected output:
# "Architecture": "arm64"
# "Os": "linux"

# Run container and verify architecture inside
docker run --rm test-addon:1.3.30 uname -m

# Expected output:
# aarch64 (for arm64)

# Check Node.js binary format
docker run --rm test-addon:1.3.30 file /usr/local/bin/node

# Expected output:
# /usr/local/bin/node: ELF 64-bit LSB executable, ARM aarch64...
```

**Verification Checklist:**
- [ ] Architecture is arm64/aarch64
- [ ] OS is Linux
- [ ] Node.js binary is ELF 64-bit ARM
- [ ] No x86_64 binaries present

---

### 1.3 Container Startup Test

**Objective:** Verify container starts and addon runs

**Steps:**
```bash
# Create test environment file
cat > test.env <<EOF
SUPERVISOR_TOKEN=test_token
GITHUB_TOKEN=test_github_token
EOF

# Run container with test environment
docker run --rm \
  --env-file test.env \
  -p 3000:3000 \
  test-addon:1.3.30

# In another terminal, test health endpoint
curl http://localhost:3000/health

# Expected output:
# {"status":"ok","timestamp":"..."}
```

**Verification Checklist:**
- [ ] Container starts without "Exec format error"
- [ ] No permission errors in logs
- [ ] Health endpoint responds
- [ ] Server listens on port 3000

---

## Phase 2: Configuration Updates

### 2.1 Update Version in config.yaml

**Objective:** Bump version to 1.3.30

**File:** `/Users/domde/Documents/CLAUDE/Addon/githubv4/config.yaml`

**Changes:**
```yaml
version: "1.3.30"
```

**Verification Checklist:**
- [ ] Version updated to 1.3.30
- [ ] No other fields modified
- [ ] YAML syntax valid

---

### 2.2 Verify build.yaml Configuration

**Objective:** Ensure GitHub Actions will build correctly

**File:** `/Users/domde/Documents/CLAUDE/Addon/githubv4/build.yaml`

**Expected Content:**
```yaml
build_from:
  aarch64: ghcr.io/domdemcode/github-issues-addon:1.3.30
  amd64: ghcr.io/domdemcode/github-issues-addon:1.3.30
  armhf: ghcr.io/domdemcode/github-issues-addon:1.3.30
  armv7: ghcr.io/domdemcode/github-issues-addon:1.3.30
  i386: ghcr.io/domdemcode/github-issues-addon:1.3.30
```

**Verification Checklist:**
- [ ] All architectures reference GHCR image
- [ ] Version number is 1.3.30
- [ ] No "FROM" fields pointing to local builds
- [ ] YAML syntax valid
- [ ] Indentation correct (2 spaces)

---

## Phase 3: GitHub Deployment

### 3.1 Git Commit and Push

**Objective:** Deploy configuration to GitHub

**Steps:**
```bash
# Stage changes
git add config.yaml build.yaml

# Commit with descriptive message
git commit -m "Release v1.3.30: Fix Exec format error with GHCR images

- Update version to 1.3.30
- Ensure build.yaml uses GHCR images for all architectures
- Force Home Assistant to pull pre-built images instead of local build"

# Push to main branch
git push origin main

# Verify push successful
git log -1 --oneline
```

**Verification Checklist:**
- [ ] Changes committed
- [ ] Push to origin/main successful
- [ ] No merge conflicts
- [ ] Commit appears on GitHub

---

### 3.2 Monitor GitHub Actions

**Objective:** Verify automated build succeeds

**Steps:**
1. Navigate to: https://github.com/domdemcode/github-issues-addon/actions
2. Find the latest workflow run (triggered by push)
3. Monitor build progress for each architecture

**Expected Workflow Steps:**
```
1. Checkout code
2. Set up Docker Buildx
3. Login to GHCR
4. Build multi-architecture images
5. Push to GHCR
6. Create GitHub Release (if tagged)
```

**Verification Checklist:**
- [ ] Workflow triggered automatically
- [ ] All architecture builds succeed (arm64, amd64, etc.)
- [ ] Images pushed to GHCR
- [ ] No errors in build logs
- [ ] Build time < 10 minutes

**Build Log Locations:**
- Workflow: `.github/workflows/build.yml`
- Logs: Actions tab → Latest run → Expand steps

---

### 3.3 Verify GHCR Image

**Objective:** Confirm image is public and pullable

**Steps:**
```bash
# Manual pull test (no authentication needed for public images)
docker pull ghcr.io/domdemcode/github-issues-addon:1.3.30

# Verify pulled successfully
docker images | grep github-issues-addon

# Inspect image details
docker inspect ghcr.io/domdemcode/github-issues-addon:1.3.30 | grep -E "(Architecture|Created)"

# Check image size
docker images ghcr.io/domdemcode/github-issues-addon:1.3.30 --format "{{.Size}}"
```

**Verification Checklist:**
- [ ] Image pulls without authentication errors
- [ ] Image size reasonable (< 500MB)
- [ ] Architecture matches (arm64 for Home Assistant)
- [ ] Image created timestamp is recent

**GHCR Package URL:**
https://github.com/domdemcode/github-issues-addon/pkgs/container/github-issues-addon

**Public Access Verification:**
- [ ] Package visibility is "Public"
- [ ] No authentication required to view
- [ ] Download count visible

---

## Phase 4: Home Assistant Deployment

### 4.1 Clear Addon Cache

**Objective:** Force Home Assistant to pull new image

**Steps:**
1. **Stop Addon:**
   - Home Assistant → Settings → Add-ons
   - Click "GitHub Issues Addon"
   - Click "STOP"

2. **Clear Cache (SSH/Terminal):**
```bash
# SSH into Home Assistant
ssh root@homeassistant.local

# Clear addon cache
ha addons reload

# Alternative: Clear Docker cache
docker system prune -f

# Alternative: Remove specific images
docker images | grep github-issues-addon
docker rmi <image-id>
```

**Verification Checklist:**
- [ ] Addon stopped successfully
- [ ] Cache cleared
- [ ] No old images in `docker images`

---

### 4.2 Update and Reload Addon

**Objective:** Deploy version 1.3.30

**Steps:**
1. **Refresh Repository:**
   - Home Assistant → Settings → Add-ons
   - Click "Add-on Store"
   - Click ⋮ (three dots) → "Check for updates"

2. **Update Addon:**
   - Find "GitHub Issues Addon"
   - Click "Update" if available
   - Or uninstall and reinstall if update not showing

3. **Verify Configuration:**
   - Click addon name
   - Check "Info" tab
   - Verify version shows "1.3.30"

**Verification Checklist:**
- [ ] Repository refreshed
- [ ] Addon shows version 1.3.30
- [ ] No error messages in UI

---

### 4.3 Start Addon and Monitor Logs

**Objective:** Verify successful startup without errors

**Steps:**
1. **Start Addon:**
   - Click "START"
   - Monitor startup progress

2. **Check Logs (Real-time):**
   - Click "Log" tab
   - Look for key messages

**Expected Log Output:**
```
[INFO] Starting GitHub Issues Addon v1.3.30...
[INFO] Pulling image ghcr.io/domdemcode/github-issues-addon:1.3.30
[INFO] Image pulled successfully
[INFO] Container started
[INFO] Server listening on port 3000
[INFO] Health check passed
```

**Error Patterns to Watch For:**
```
❌ "Exec format error" → Architecture mismatch
❌ "permission denied" → Permissions issue
❌ "manifest unknown" → Image not found in GHCR
❌ "unauthorized" → GHCR authentication issue
```

**Verification Checklist:**
- [ ] "Pulling image" message appears (not "Building locally")
- [ ] NO "Exec format error"
- [ ] NO permission errors
- [ ] Server starts on port 3000
- [ ] Health check passes

---

### 4.4 Functional Testing

**Objective:** Verify addon functionality

**Steps:**
1. **Access Web UI:**
   - Navigate to: http://homeassistant.local:3000
   - Verify page loads

2. **Test GitHub Integration:**
   - Create test issue
   - Verify issue appears in GitHub
   - Check webhook delivery

3. **Test Home Assistant Integration:**
   - Check entities created
   - Verify sensor updates

**Verification Checklist:**
- [ ] Web UI loads without errors
- [ ] Can create GitHub issues
- [ ] Home Assistant entities update
- [ ] No errors in logs

---

## Phase 5: Rollback Plan

### 5.1 Rollback Triggers

**When to rollback:**
- Exec format error persists
- Addon fails to start
- Functional issues discovered
- Performance degradation
- Data corruption

---

### 5.2 Rollback Procedure

**Objective:** Revert to last working version

**Steps:**
```bash
# 1. Stop current addon
# Via Home Assistant UI or:
ha addons stop local_github_issues

# 2. Revert config.yaml
git revert HEAD
git push origin main

# 3. Clear cache
ha addons reload
docker system prune -f

# 4. Reinstall previous version
# Via Home Assistant UI:
# Add-ons → GitHub Issues Addon → Uninstall
# Add-ons → Add-on Store → GitHub Issues Addon → Install (previous version)

# 5. Restore configuration
# Restore from backup in /config/
```

**Verification Checklist:**
- [ ] Previous version restored
- [ ] Configuration intact
- [ ] Addon starts successfully
- [ ] Data preserved

---

### 5.3 Rollback Documentation

**Log Rollback:**
```bash
# Create rollback log
cat > /tmp/rollback-1.3.30.log <<EOF
Date: $(date)
Version: 1.3.30
Reason: [DESCRIBE ISSUE]
Actions Taken:
- Reverted to version: [PREVIOUS VERSION]
- Configuration restored: [YES/NO]
- Data loss: [NONE/DESCRIBE]
Next Steps:
- [DEBUGGING ACTIONS]
- [ISSUE CREATION]
EOF
```

---

## Phase 6: Post-Deployment Validation

### 6.1 Monitoring Period

**Duration:** 24 hours

**Metrics to Track:**
- CPU usage
- Memory usage
- Response time
- Error rate
- GitHub API calls

**Steps:**
```bash
# Monitor addon resource usage
docker stats github-issues-addon

# Monitor logs for errors
ha addons logs local_github_issues --follow | grep -i error

# Check system journal
journalctl -u home-assistant -f | grep github-issues
```

---

### 6.2 Success Criteria

**Deployment is successful if:**
- [ ] NO "Exec format error" in logs
- [ ] Addon starts in < 30 seconds
- [ ] Image pulled from GHCR (not built locally)
- [ ] Web UI accessible
- [ ] GitHub integration functional
- [ ] Home Assistant entities update
- [ ] CPU usage < 10%
- [ ] Memory usage < 200MB
- [ ] No crashes for 24 hours

---

### 6.3 Documentation Updates

**Post-deployment:**
1. Update CHANGELOG.md with release notes
2. Tag release in GitHub: `git tag v1.3.30`
3. Create GitHub Release with notes
4. Update README.md if needed
5. Document any issues encountered

---

## Quick Reference Checklist

### Pre-Deployment
- [ ] Local Docker build successful
- [ ] Architecture verified (arm64)
- [ ] Container startup test passed
- [ ] config.yaml updated to 1.3.30
- [ ] build.yaml syntax verified

### Deployment
- [ ] Git commit and push successful
- [ ] GitHub Actions build successful
- [ ] GHCR image public and pullable
- [ ] Manual docker pull test passed

### Home Assistant
- [ ] Addon cache cleared
- [ ] Repository refreshed
- [ ] Version 1.3.30 visible
- [ ] Addon started successfully
- [ ] Logs show "Pulling image" (not building)
- [ ] NO "Exec format error"
- [ ] Functional tests passed

### Post-Deployment
- [ ] 24-hour monitoring period
- [ ] Success criteria met
- [ ] Documentation updated
- [ ] GitHub release created

---

## Emergency Contacts

- GitHub Repository: https://github.com/domdemcode/github-issues-addon
- GHCR Package: https://github.com/domdemcode/github-issues-addon/pkgs/container/github-issues-addon
- Home Assistant Forum: https://community.home-assistant.io/

---

## Appendix A: Command Reference

### Useful Commands
```bash
# Check Home Assistant version
ha info

# List all addons
ha addons list

# Check addon status
ha addons info local_github_issues

# Reload addons
ha addons reload

# View logs
ha addons logs local_github_issues

# Docker commands
docker ps
docker images
docker logs <container-id>
docker inspect <image>
docker pull <image>
docker system prune -af
```

---

## Appendix B: Troubleshooting Guide

### Issue: Exec Format Error
**Cause:** Architecture mismatch
**Solution:** Verify build.yaml uses GHCR images

### Issue: Image Not Found
**Cause:** GHCR image not public or doesn't exist
**Solution:** Check GHCR package visibility and build logs

### Issue: Addon Won't Start
**Cause:** Port conflict or configuration error
**Solution:** Check logs, verify port 3000 available

### Issue: Old Version Shows
**Cause:** Cache not cleared
**Solution:** Run `ha addons reload` and `docker system prune -f`

---

**Document Version:** 1.0
**Created:** 2025-12-02
**Author:** Deployment Team
**Status:** Ready for Execution
