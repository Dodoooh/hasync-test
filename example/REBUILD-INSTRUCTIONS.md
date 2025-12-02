# HAsync Addon Rebuild Instructions (v1.3.29)

## Problem
The addon shows "Exec format error" because it's using an old cached build.

## Solution: Force Rebuild Without Cache

### Method 1: Home Assistant CLI (Recommended)

```bash
# SSH into Home Assistant
ssh root@homeassistant.local

# Stop the addon first
ha addons stop local_example

# Remove old images and cache
docker system prune -af

# Rebuild addon from scratch
ha addons rebuild local_example

# Start the addon
ha addons start local_example

# Check logs
ha addons logs local_example
```

### Method 2: Home Assistant Supervisor UI

1. **Stop Addon**
   - Settings → Add-ons → HAsync
   - Click "STOP"

2. **Clear Docker Cache** (SSH required)
   ```bash
   ssh root@homeassistant.local
   docker system prune -af
   ```

3. **Rebuild**
   - Settings → Add-ons → HAsync
   - Click "REBUILD"
   - Wait for build to complete (3-5 minutes)

4. **Start Addon**
   - Click "START"
   - Check "Log" tab for success

### Method 3: Local Test Build (Verify Fix Works)

```bash
cd /Users/domde/Documents/CLAUDE/Addon/githubv4/example

# Clean everything
docker system prune -af
rm -rf rootfs/app/*/node_modules

# Build with buildx (correct way)
docker buildx build \
  --platform linux/amd64 \
  --build-arg BUILD_FROM=ghcr.io/home-assistant/amd64-base:3.15 \
  --build-arg TEMPIO_VERSION=2021.09.0 \
  --build-arg BUILD_ARCH=amd64 \
  --load \
  --no-cache \
  -t hasync-test:v1.3.29 \
  .

# Test it
docker run --rm -d \
  --name hasync-test \
  -e JWT_SECRET="test-secret-123" \
  -e ADMIN_USERNAME="admin" \
  -e ADMIN_PASSWORD="test123" \
  hasync-test:v1.3.29

# Check logs (should NOT show "Exec format error")
sleep 10
docker logs hasync-test

# If successful, you'll see:
# ✅ "Server v1.3.29"
# ✅ "✓ Pairing tables ready"
# ✅ NO "Exec format error"

# Cleanup
docker stop hasync-test
```

## What Changed in v1.3.29

- ✅ Fixed Docker architecture mismatch
- ✅ Native modules now compile for correct platform
- ✅ Added buildx documentation
- ✅ Verified working in local tests

## Expected Success Output

```
[INFO] Starting HAsync...
[INFO] Configuration loaded:
[INFO] - Admin User: admin
[INFO] ✓ Backup directory ready: /app/backups
[INFO] Starting backend server on port 8099...
[INFO] ✓ Pairing tables ready
[INFO] Server v1.3.29
```

**NO "Exec format error" should appear!**

## Troubleshooting

### If rebuild still fails:

1. **Check Home Assistant version**
   ```bash
   ha core info
   ```
   Requires Home Assistant OS 10.0+ for proper buildx support

2. **Check builder version**
   ```bash
   docker buildx version
   ```

3. **Manual build with explicit platform**
   Edit `/usr/share/hassio/addons/local/example/build.yaml`:
   ```yaml
   build_from:
     amd64: "ghcr.io/home-assistant/amd64-base:3.15"
   args:
     TEMPIO_VERSION: "2021.09.0"
   ```

4. **Check addon repository**
   - Verify git pull worked: `cd /usr/share/hassio/addons/local && git log -1`
   - Should show commit: `0c958e2 fix(docker): Solve architecture mismatch`

## Verification

After rebuild, check:
- ✅ Addon status: "Running"
- ✅ Logs show: "Server v1.3.29"
- ✅ No error messages in logs
- ✅ Health check passes
- ✅ Can access web UI

## Contact

If issues persist after rebuild:
1. Check addon logs: `ha addons logs local_example`
2. Verify version: Should show v1.3.29 in logs
3. Check build logs: `ha addons info local_example --raw-json`
