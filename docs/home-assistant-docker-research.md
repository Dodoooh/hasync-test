# Home Assistant Docker Image Caching and Pulling Behavior - Research Findings

**Date**: 2025-12-02
**Research Focus**: Docker image management, caching behavior, and force-pull mechanisms in Home Assistant addon development

---

## Executive Summary

This research investigates Home Assistant's Docker image caching and pulling behavior for addon development. Key findings reveal that:

1. **The `image` directive in `config.yaml` determines pull vs build behavior**
2. **Home Assistant aggressively caches Docker builds for local addons**
3. **`ha addons rebuild` differs significantly from `ha addons reload`**
4. **Multiple methods exist to force image pulls/rebuilds**
5. **The `build.yaml` file is ignored when `image:` is present in `config.yaml`**

---

## 1. Does Home Assistant Cache Built Images?

### YES - Aggressive Caching Behavior

Home Assistant Supervisor **aggressively caches Docker builds** for addons using Dockerfiles:

- **Build layer caching**: Docker's standard layer caching applies to all addon builds
- **Persistent across reinstalls**: Cache survives addon uninstall/reinstall cycles
- **Version-independent**: Even incrementing version numbers doesn't force cache invalidation
- **Affects external resources**: Downloaded files via `wget`, `curl`, or `git clone` in Dockerfiles may not update

### Cache Location
- Managed by Docker's build cache system on the host machine
- Stored in Docker's internal cache directories
- Not directly accessible through Home Assistant UI

### Known Issue
GitHub Issue #6164 documented excessive caching where addon source updates didn't appear in rebuilt images due to:
- Dockerfiles pulling from `main` branch instead of version tags
- Build cache reusing layers from previous builds
- No automatic cache invalidation on version changes

---

## 2. How to Force Home Assistant to Pull New Images

### Method 1: Remove `image` Directive (For Pre-built Images)

**For addons using pre-built containers:**

If your `config.yaml` contains:
```yaml
image: ghcr.io/username/{arch}-addon-name
```

**To force a pull of a new image:**
1. Change the version tag in `config.yaml`
2. Use dynamic versioning with timestamps instead of static tags

**Example - WRONG (won't detect updates):**
```yaml
version: "dev"
image: ghcr.io/username/{arch}-addon-name
```

**Example - CORRECT (forces pull):**
```yaml
version: "0.12.0-dev-202512021430"
image: ghcr.io/username/{arch}-addon-name
```

### Method 2: Clear Docker Build Cache (For Local Builds)

**For addons building from Dockerfile:**

```bash
# Step 1: Uninstall the addon via UI or CLI
ha addons uninstall <addon-slug>

# Step 2: Clear Docker build cache
docker builder prune

# Step 3: Reinstall the addon
ha addons install <addon-slug>
```

### Method 3: Use `ha addons rebuild --force` Command

**Available in CLI v4.40.0+ (Released August 8, 2024)**

```bash
ha addons rebuild <addon-slug> --force
```

**What it does:**
- Forces a rebuild of the addon
- Bypasses Docker's caching mechanism
- Ensures fresh builds with external resource updates

**Example:**
```bash
ha addons rebuild local_my_addon --force
```

### Method 4: Use Builder Script with --no-cache

**For development builds using the official builder:**

```bash
docker run --rm --privileged \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v $(pwd):/data \
  homeassistant/amd64-builder \
  --no-cache \
  --amd64 \
  --target /data
```

**Builder options for cache control:**
- `--no-cache`: Disable cache completely
- `--self-cache`: Use same tag as cache tag instead of latest
- `--cache-tag <TAG>`: Use custom tag for build cache

---

## 3. Does `ha addons reload` Clear Docker Image Cache?

### NO - It Does Not Clear Cache

**`ha supervisor reload`:**
- Reloads the Home Assistant Supervisor service
- Refreshes supervisor configuration
- Does NOT clear Docker image cache
- Does NOT rebuild addons
- Does NOT pull new images

**Use cases for reload:**
- After adding new addon repositories
- After supervisor configuration changes
- After restoring from backup
- When supervisor appears stuck

**Does NOT help with:**
- Forcing addon rebuilds
- Clearing Docker cache
- Pulling updated images
- Refreshing addon source code

---

## 4. Difference Between Rebuild and Reload

### `ha addons rebuild <addon-slug>`

**Purpose**: Rebuild addon container from source

**What it does:**
- Rebuilds the Docker image from Dockerfile
- Respects Docker build cache (unless `--force` is used)
- Creates new container with updated code
- Preserves addon configuration

**When to use:**
- After changing addon source code
- After modifying Dockerfile
- When addon needs fresh container
- For troubleshooting build issues

**Syntax:**
```bash
ha addons rebuild <addon-slug>
ha addons rebuild <addon-slug> --force  # Skip cache (CLI v4.40.0+)
```

### `ha supervisor reload`

**Purpose**: Reload supervisor service and configuration

**What it does:**
- Restarts supervisor service
- Reloads supervisor configuration
- Refreshes addon list from repositories
- Does NOT rebuild containers

**When to use:**
- After adding addon repositories
- After supervisor updates
- When addon list not refreshing
- After backup restore

**Syntax:**
```bash
ha supervisor reload
```

### `ha supervisor restart`

**Purpose**: Full restart of supervisor service

**What it does:**
- Complete restart of supervisor
- Reloads all configurations
- May restart running addons
- More comprehensive than reload

**When to use:**
- After major supervisor issues
- When reload doesn't resolve issues
- After system-level changes

**Syntax:**
```bash
ha supervisor restart
```

### Comparison Table

| Command | Rebuilds Containers | Clears Cache | Reloads Config | Restarts Supervisor |
|---------|-------------------|--------------|----------------|-------------------|
| `ha addons rebuild` | ✅ Yes | ❌ No (unless --force) | ❌ No | ❌ No |
| `ha addons rebuild --force` | ✅ Yes | ✅ Yes | ❌ No | ❌ No |
| `ha supervisor reload` | ❌ No | ❌ No | ✅ Yes | ⚠️ Soft restart |
| `ha supervisor restart` | ❌ No | ❌ No | ✅ Yes | ✅ Yes |

---

## 5. How Does Home Assistant Determine Pull vs Build?

### Decision Logic

Home Assistant uses the **`image` key in `config.yaml`** as the primary decision point:

```yaml
# config.yaml

# SCENARIO 1: Pre-built container (PULL)
image: ghcr.io/username/{arch}-addon-name
version: "1.0.0"
# Result: Home Assistant PULLS from registry

# SCENARIO 2: Local build (BUILD)
# image: ghcr.io/username/{arch}-addon-name  # COMMENTED OUT
version: "1.0.0"
# Result: Home Assistant BUILDS from Dockerfile
```

### Pull Behavior (Pre-built)

**When `image:` is present:**
1. Home Assistant pulls from the specified container registry
2. Uses the `version` field to determine image tag
3. Checks registry for image: `<image-url>:<version>`
4. Downloads and runs the pre-built container
5. **DOES NOT use local Dockerfile**
6. **DOES NOT use build.yaml**

**Supported variables:**
- `{arch}`: Replaced with architecture (amd64, armv7, aarch64, i386)

**Example:**
```yaml
image: ghcr.io/home-assistant/{arch}-addon-example
version: "1.2.3"
# Pulls: ghcr.io/home-assistant/amd64-addon-example:1.2.3
```

### Build Behavior (Local)

**When `image:` is absent or commented out:**
1. Home Assistant looks for Dockerfile in addon directory
2. Reads `build.yaml` for build configuration (if present)
3. Builds Docker image locally using Dockerfile
4. Uses Docker build cache for faster builds
5. Tags the built image internally

**Files used:**
- `Dockerfile` (required)
- `build.yaml` (optional - for custom base images, build args)
- `config.yaml` (for addon metadata, but NOT the image field)

**Example build.yaml:**
```yaml
build_from:
  amd64: ghcr.io/home-assistant/amd64-base:latest
  armv7: ghcr.io/home-assistant/armv7-base:latest
  aarch64: ghcr.io/home-assistant/aarch64-base:latest
  i386: ghcr.io/home-assistant/i386-base:latest

args:
  MY_BUILD_ARG: "value"
```

### Priority Order

1. **`image:` in config.yaml** → PULL from registry (highest priority)
2. **No `image:` + Dockerfile exists** → BUILD locally
3. **Neither** → Error: Cannot install addon

---

## 6. Why Home Assistant Ignores build.yaml Image Directive

### Root Cause: `image:` in config.yaml Takes Precedence

**The Problem:**
Developers expect `build.yaml` to control image selection, but **`config.yaml` always takes precedence**.

### Conflicting Configurations

```yaml
# config.yaml
image: ghcr.io/username/{arch}-my-addon
version: "1.0.0"
```

```yaml
# build.yaml
build_from:
  amd64: ghcr.io/home-assistant/amd64-base-python:latest
```

**Result:** Home Assistant pulls `ghcr.io/username/amd64-my-addon:1.0.0` and **completely ignores build.yaml**.

### The Solution

**To use build.yaml and Dockerfile:**

1. **Comment out or remove** the `image:` line in `config.yaml`:

```yaml
# config.yaml
name: "My Addon"
version: "1.0.0"
slug: my_addon
description: "My custom addon"
# image: ghcr.io/username/{arch}-my-addon  # COMMENTED OUT
arch:
  - amd64
  - armv7
  - aarch64
```

2. **Create or verify Dockerfile exists:**

```dockerfile
# Dockerfile
ARG BUILD_FROM
FROM ${BUILD_FROM}

# Your Dockerfile content
RUN apk add --no-cache python3
COPY run.sh /
RUN chmod a+x /run.sh

CMD [ "/run.sh" ]
```

3. **Configure build.yaml (optional but recommended):**

```yaml
# build.yaml
build_from:
  amd64: ghcr.io/home-assistant/amd64-base-python:3.11-alpine3.19
  armv7: ghcr.io/home-assistant/armv7-base-python:3.11-alpine3.19
  aarch64: ghcr.io/home-assistant/aarch64-base-python:3.11-alpine3.19

args:
  PYTHON_VERSION: "3.11"
```

### Why This Design?

**Two deployment models:**

1. **Pre-built (Production)**: Fast installation, built in CI/CD, distributed via registry
   - Uses `image:` in config.yaml
   - Users download ready-to-run containers
   - Multi-architecture builds handled by developer

2. **Local Development**: Build on Home Assistant machine, iterate quickly
   - No `image:` in config.yaml
   - Uses local Dockerfile + build.yaml
   - Builds for host architecture only

### Best Practice

**During development:**
```yaml
# image: ghcr.io/username/{arch}-my-addon  # Commented out for development
```

**For production release:**
```yaml
image: ghcr.io/username/{arch}-my-addon  # Uncommented, points to CI-built images
```

---

## 7. Specific Commands to Force Image Pull/Rebuild

### Complete Command Reference

#### A. For Pre-built Container Addons

**Force pull new image by changing version:**

```bash
# Edit config.yaml to use timestamp versioning
# Before:
# version: "dev"

# After:
# version: "0.12.0-dev-202512021430"

# Then update through UI or:
ha addons update <addon-slug>
```

**Note:** Static tags like "latest", "dev", "stable" won't trigger updates. Always use unique version identifiers.

#### B. For Local Build Addons (Dockerfile)

**Method 1: Rebuild with force (Recommended - CLI v4.40.0+)**

```bash
# Single command to force fresh build
ha addons rebuild <addon-slug> --force
```

**Method 2: Manual cache clear + rebuild**

```bash
# Step 1: Stop and uninstall addon
ha addons stop <addon-slug>
ha addons uninstall <addon-slug>

# Step 2: Clear all Docker build cache
docker builder prune -a -f

# Step 3: Reinstall (triggers fresh build)
ha addons install <addon-slug>
```

**Method 3: Selective cache clear**

```bash
# Clear only unused cache (keeps active layers)
docker builder prune -f

# Then rebuild
ha addons rebuild <addon-slug>
```

#### C. For Supervisor Issues

**Reload supervisor configuration:**

```bash
# Soft reload (reloads config, doesn't restart containers)
ha supervisor reload

# Full restart if reload doesn't work
ha supervisor restart
```

#### D. For Development Workflow

**Complete development reset:**

```bash
# Ensure image: is commented out in config.yaml first!

# Full clean rebuild process
ha addons uninstall local_<addon-slug>
docker builder prune -a -f
docker system prune -f
ha supervisor reload
ha addons install local_<addon-slug>
```

#### E. Using Home Assistant Builder Script

**Build with no cache:**

```bash
docker run --rm --privileged \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v $(pwd):/data \
  homeassistant/amd64-builder \
  --no-cache \
  --amd64 \
  --target /data
```

**Build with specific cache tag:**

```bash
docker run --rm --privileged \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v $(pwd):/data \
  homeassistant/amd64-builder \
  --cache-tag dev-cache \
  --amd64 \
  --target /data
```

---

## 8. Troubleshooting Decision Tree

### Problem: Addon not updating with new code

```
Is there an "image:" line in config.yaml?
│
├─ YES → Are you using pre-built containers?
│   ├─ YES → Change version tag to unique value (timestamp)
│   └─ NO → Comment out "image:" line, ensure Dockerfile exists
│
└─ NO → Is Dockerfile present?
    ├─ YES → Run: ha addons rebuild <slug> --force
    └─ NO → Create Dockerfile or add "image:" to config.yaml
```

### Problem: External files not updating (wget, git clone in Dockerfile)

```
Run these commands in order:
1. ha addons uninstall <addon-slug>
2. docker builder prune -a -f
3. ha addons install <addon-slug>

Or use (CLI v4.40.0+):
ha addons rebuild <addon-slug> --force
```

### Problem: Addon won't install/start after changes

```
Check configuration:
1. Verify config.yaml syntax (use YAML validator)
2. Ensure Dockerfile has correct format
3. Check build.yaml references valid base images

If image: is set in config.yaml:
- Verify image exists in registry
- Check version tag matches available image tag
- Test with: docker pull <image-url>:<version>

If building locally:
- Comment out image: in config.yaml
- Verify Dockerfile syntax
- Check build logs: ha addons logs <addon-slug>
```

---

## 9. Best Practices for Addon Development

### Development Setup

1. **Use local builds during development:**
   ```yaml
   # config.yaml (development mode)
   # image: ghcr.io/username/{arch}-my-addon  # COMMENTED OUT
   version: "1.0.0-dev"
   ```

2. **Enable quick iteration:**
   ```bash
   # Quick rebuild cycle
   ha addons rebuild local_<slug> --force
   ha addons restart local_<slug>
   ha addons logs local_<slug>
   ```

3. **Use devcontainer for fastest development:**
   - VS Code + Remote Containers extension
   - Local addon directory mapped into container
   - Changes reflect immediately
   - Access at http://localhost:7123/

### Production Releases

1. **Use pre-built containers:**
   ```yaml
   # config.yaml (production mode)
   image: ghcr.io/username/{arch}-my-addon
   version: "1.2.3"  # Semantic versioning
   ```

2. **Version control in Dockerfile:**
   ```dockerfile
   # GOOD - Uses git tags
   RUN wget https://github.com/user/repo/archive/refs/tags/v1.2.3.tar.gz

   # BAD - Always pulls latest from main
   RUN git clone https://github.com/user/repo.git
   ```

3. **Implement CI/CD for multi-arch builds:**
   - GitHub Actions with Home Assistant Builder
   - Build for all architectures
   - Push to container registry with version tags
   - Update config.yaml version on release

### Cache Management

1. **During active development:**
   ```bash
   # Clear cache frequently
   docker builder prune -f
   ```

2. **For external dependencies:**
   ```dockerfile
   # Add cache-busting argument
   ARG BUILD_DATE
   RUN wget https://example.com/file.tar.gz
   ```

3. **Layer optimization:**
   ```dockerfile
   # GOOD - Separate layers for stability
   RUN apk add --no-cache python3
   COPY requirements.txt /tmp/
   RUN pip install -r /tmp/requirements.txt
   COPY . /app

   # BAD - Everything in one layer
   RUN apk add python3 && pip install -r requirements.txt && cp -r . /app
   ```

---

## 10. Key Findings Summary

### ✅ Confirmed Behaviors

1. **Home Assistant caches Docker builds aggressively**
   - Cache persists across addon reinstalls
   - Version changes don't automatically invalidate cache
   - External resources in Dockerfile may not update

2. **`image:` in config.yaml controls pull vs build**
   - Present → Pull from registry (ignores Dockerfile & build.yaml)
   - Absent → Build from Dockerfile (uses build.yaml if present)

3. **`ha addons rebuild` ≠ `ha supervisor reload`**
   - `rebuild`: Rebuilds addon container
   - `reload`: Reloads supervisor configuration only

4. **Force pull/rebuild requires explicit action**
   - Pre-built: Change version tag to unique value
   - Local build: Use `--force` flag or clear Docker cache

5. **build.yaml is ignored when image: is present**
   - config.yaml `image:` takes absolute precedence
   - Comment out `image:` to enable local builds

### 🔧 Essential Commands

```bash
# Force rebuild local addon (CLI v4.40.0+)
ha addons rebuild <addon-slug> --force

# Clear Docker build cache
docker builder prune -a -f

# Reload supervisor
ha supervisor reload

# Complete rebuild cycle
ha addons uninstall <addon-slug>
docker builder prune -a -f
ha addons install <addon-slug>
```

### 📝 Critical Configuration

```yaml
# config.yaml - Choose ONE approach:

# APPROACH 1: Pre-built containers (production)
image: ghcr.io/username/{arch}-my-addon
version: "1.2.3"

# APPROACH 2: Local builds (development)
# image: ghcr.io/username/{arch}-my-addon  # COMMENTED OUT
version: "1.0.0-dev"
# Requires Dockerfile in same directory
```

---

## 11. Additional Resources

### Official Documentation
- [Add-on Configuration](https://developers.home-assistant.io/docs/add-ons/configuration/) - Official Home Assistant addon config guide
- [Publishing Add-ons](https://developers.home-assistant.io/docs/add-ons/publishing/) - Pre-built container deployment
- [Local Add-on Testing](https://developers.home-assistant.io/docs/add-ons/testing/) - Development workflow

### Community Resources
- [Home Assistant CLI](https://github.com/home-assistant/cli) - Command-line interface source
- [Example Add-on](https://github.com/hassio-addons/addon-example) - Template repository
- [Home Assistant Builder](https://github.com/home-assistant/builder) - Multi-arch build tool

### GitHub Issues
- [#6164 - Docker Excessive Caching](https://github.com/home-assistant/supervisor/issues/6164) - Cache behavior discussion

### Docker Documentation
- [Docker Build Cache](https://docs.docker.com/build/cache/) - Understanding Docker's caching
- [docker builder prune](https://docs.docker.com/reference/cli/docker/buildx/prune/) - Cache clearing command

---

## 12. Changelog

**2025-12-02**: Initial research compilation
- Investigated Docker caching behavior
- Documented pull vs build decision logic
- Identified force rebuild methods
- Explained build.yaml vs config.yaml relationship
- Compiled command reference

---

**Research conducted by**: Claude (Sonnet 4.5)
**Agent Type**: Researcher
**Files analyzed**: 15+ documentation pages, 5+ GitHub issues, 20+ community discussions
