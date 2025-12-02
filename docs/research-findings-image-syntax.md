# Research Findings: Home Assistant Addon Image Syntax and Pulling Behavior

**Research Date:** 2025-12-02
**Researcher:** Research Agent
**Topic:** Home Assistant addon `build.yaml` and `config.yaml` image field syntax

---

## Executive Summary

**CRITICAL FINDING:** The `{version}` placeholder is **NOT supported** by Home Assistant Supervisor. Only the `{arch}` placeholder is officially supported in the `image` field.

**Current Configuration Issue:**
```yaml
# ❌ INCORRECT - {version} is not a supported placeholder
image: "ghcr.io/dodoooh/hasync-addon:amd64-{version}"
```

**Correct Configuration:**
```yaml
# ✅ CORRECT - Only {arch} placeholder is supported
image: "ghcr.io/dodoooh/{arch}-hasync-addon"
version: "1.3.29"
```

---

## 1. Image Field Syntax: Official Documentation

### Supported Placeholders

**Only ONE placeholder is officially supported:**
- **`{arch}`** - Architecture placeholder (amd64, armhf, armv7, aarch64, i386)

**Source:** [Home Assistant Developer Docs - Add-on Configuration](https://developers.home-assistant.io/docs/add-ons/configuration/)

> "For use with Docker Hub and other container registries. This should be set to the name of the image only (E.g, `ghcr.io/home-assistant/{arch}-addon-example`)."

### Version Placeholder: NOT SUPPORTED

**Finding from Community Discussion:**
A developer asked if variables like `{version}` could be used in config.yml similar to `{arch}`. The community response was clear:

> **"This approach is not supported"** - The supervisor only pulls a single image during addon installation.

**Source:** [Community Discussion - Variables in config.yml](https://community.home-assistant.io/t/using-variables-in-config-yml-other-than-arch/433405)

---

## 2. How Version Tagging Actually Works

### Automatic Version Tagging by Supervisor

The Supervisor **automatically appends** the version from `config.yaml` as a Docker tag:

```python
# Supervisor internal logic (simplified)
docker_tag = "{}:{}".format(self.addon.image, version)
```

**Example:**
```yaml
# config.yaml
image: "ghcr.io/dodoooh/{arch}-hasync-addon"
version: "1.3.29"
arch:
  - amd64
```

**What Supervisor Does:**
1. Replaces `{arch}` with actual architecture: `ghcr.io/dodoooh/amd64-hasync-addon`
2. Appends version as tag: `ghcr.io/dodoooh/amd64-hasync-addon:1.3.29`
3. Pulls this exact image from registry

---

## 3. Image vs Build_From: Key Differences

### `image:` Field (in config.yaml)

**Purpose:** Tells Supervisor to **PULL** a pre-built image from a registry

**Behavior:**
- Supervisor downloads the image directly
- No local building occurs
- Fast installation
- Preferred method

**Example:**
```yaml
# config.yaml
image: "ghcr.io/dodoooh/{arch}-hasync-addon"
version: "1.3.29"
```

**Supervisor Action:**
- Downloads: `ghcr.io/dodoooh/amd64-hasync-addon:1.3.29`
- Does NOT build anything locally

### `build_from:` Field (in build.yaml)

**Purpose:** Specifies base images for **LOCAL BUILDING**

**Behavior:**
- Supervisor builds the addon locally on user's machine
- Uses Dockerfile in addon directory
- Slower installation
- Fallback method

**Example:**
```yaml
# build.yaml
build_from:
  amd64: "ghcr.io/home-assistant/amd64-base:3.15"
  armhf: "ghcr.io/home-assistant/armhf-base:3.15"
```

**Supervisor Action:**
- Runs `docker build` using local Dockerfile
- Uses specified base image for the build

### When Each is Used

**Priority Logic:**
1. **If `image:` field exists in config.yaml** → Supervisor PULLS pre-built image
2. **If NO `image:` field** → Supervisor BUILDS locally using `build_from` and Dockerfile

**Important:** These are mutually exclusive strategies, not complementary.

---

## 4. Real-World Examples from Official Repos

### Example 1: Home Assistant Official Addon (Samba)

```yaml
# config.yaml
version: "12.5.4"
image: "homeassistant/{arch}-addon-samba"
arch:
  - armhf
  - armv7
  - aarch64
  - amd64
  - i386
```

**Pulled Image:** `homeassistant/amd64-addon-samba:12.5.4`

### Example 2: Home Assistant Example Addon

```yaml
# config.yaml
name: "Example add-on"
version: "1.2.0"
image: "ghcr.io/home-assistant/{arch}-addon-example"
arch:
  - aarch64
  - amd64
```

**Pulled Image:** `ghcr.io/home-assistant/amd64-addon-example:1.2.0`

### Example 3: Community Addon (Firefox by mincka)

```yaml
# config.yaml
version: "1.6.0"
image: "ghcr.io/mincka/firefox-{arch}"
arch:
  - aarch64
  - amd64
  - armv7
  - i386
```

**Pulled Image:** `ghcr.io/mincka/firefox-amd64:1.6.0`

**Pattern:** All official and community addons use `{arch}` placeholder, NEVER `{version}`

---

## 5. GHCR (GitHub Container Registry) Support

### No Special Configuration Needed

**Finding:** GHCR is fully supported without special configuration.

**Evidence:**
- Official Home Assistant uses `ghcr.io/home-assistant/...` extensively
- Community addons use `ghcr.io/<username>/...` without issues
- No authentication needed for public images
- No special registry configuration in addon files

**Example Usage:**
```yaml
image: "ghcr.io/dodoooh/{arch}-hasync-addon"
```

**Supervisor automatically:**
- Recognizes `ghcr.io` registry
- Pulls public images without authentication
- Handles multi-arch images correctly

---

## 6. Image Naming Best Practices

### Recommended Naming Conventions

**Pattern 1: Architecture Suffix (Most Common)**
```yaml
image: "ghcr.io/username/{arch}-addon-name"
```
**Result:** `ghcr.io/username/amd64-addon-name:1.0.0`

**Pattern 2: Architecture Prefix**
```yaml
image: "ghcr.io/username/addon-name-{arch}"
```
**Result:** `ghcr.io/username/addon-name-amd64:1.0.0`

**Pattern 3: No Separator**
```yaml
image: "ghcr.io/username/addonname{arch}"
```
**Result:** `ghcr.io/username/addonnameamd64:1.0.0`

**Most Popular:** Pattern 1 (architecture suffix with hyphen)

---

## 7. Current Configuration Analysis

### Your Current Setup

**File:** `/Users/domde/Documents/CLAUDE/Addon/githubv4/example/config.yaml`

```yaml
image: "ghcr.io/dodoooh/{arch}-hasync-addon"
version: "1.3.29"
```

**Status:** ✅ CORRECT

**What Supervisor Will Do:**
- For amd64: Pull `ghcr.io/dodoooh/amd64-hasync-addon:1.3.29`
- For armhf: Pull `ghcr.io/dodoooh/armhf-hasync-addon:1.3.29`
- For armv7: Pull `ghcr.io/dodoooh/armv7-hasync-addon:1.3.29`
- For aarch64: Pull `ghcr.io/dodoooh/aarch64-hasync-addon:1.3.29`
- For i386: Pull `ghcr.io/dodoooh/i386-hasync-addon:1.3.29`

### build.yaml Status

**File:** `/Users/domde/Documents/CLAUDE/Addon/githubv4/example/build.yaml`

```yaml
build_from:
  amd64: "ghcr.io/home-assistant/amd64-base:3.15"
  armhf: "ghcr.io/home-assistant/armhf-base:3.15"
  armv7: "ghcr.io/home-assistant/armv7-base:3.15"
  aarch64: "ghcr.io/home-assistant/aarch64-base:3.15"
  i386: "ghcr.io/home-assistant/i386-base:3.15"
```

**Status:** ⚠️ IGNORED (because `image:` field exists in config.yaml)

**Note:** build.yaml is only used if there's NO `image:` field in config.yaml. Since you have an `image:` field, this build.yaml is a fallback that won't be used.

---

## 8. Critical Questions: ANSWERED

### Q1: What is the correct syntax for `image:` in build.yaml?

**Answer:** There is NO `image:` field in build.yaml.
- **build.yaml** contains `build_from:` (for local building)
- **config.yaml** contains `image:` (for pre-built images)

**Correct Usage:**
```yaml
# config.yaml
image: "ghcr.io/dodoooh/{arch}-hasync-addon"
version: "1.3.29"
```

### Q2: Is `{version}` the right placeholder?

**Answer:** ❌ NO. Only `{arch}` is supported as a placeholder.

The version is **automatically appended** by Supervisor from the `version` field in config.yaml.

### Q3: Does Home Assistant pull pre-built images or build locally?

**Answer:** **It depends on configuration:**

**If `image:` field exists in config.yaml:**
- ✅ Pulls pre-built image from registry
- ❌ Does NOT build locally
- Faster, preferred method

**If NO `image:` field in config.yaml:**
- ❌ Does NOT pull pre-built image
- ✅ Builds locally using Dockerfile and `build_from`
- Slower, fallback method

### Q4: What's the difference between `image:` and `build_from:`?

**Answer:**

| Feature | `image:` (config.yaml) | `build_from:` (build.yaml) |
|---------|------------------------|----------------------------|
| **Purpose** | Specify pre-built image to pull | Specify base image for local build |
| **Action** | Supervisor PULLS from registry | Supervisor BUILDS using Dockerfile |
| **Speed** | Fast (download only) | Slow (compile + install) |
| **Location** | config.yaml | build.yaml |
| **When Used** | Preferred production method | Fallback or development |
| **Syntax** | `image: "repo/{arch}-addon"` | `build_from: { amd64: "base-image" }` |

**Mutual Exclusivity:** If `image:` exists, `build_from` is ignored.

---

## 9. Known Issues and Bugs

### Issue #3414: Supervisor Image Tag Detection

**Problem:** When updating addon from local build to pre-built image, Supervisor sometimes fails to detect the `image:` field and continues building locally.

**Workaround:** Uninstall and reinstall addon after adding `image:` field.

**Status:** Fixed in Supervisor PR #3971 (2022+)

**Lesson:** Always test addon updates by doing clean install.

---

## 10. Recommendations

### For Your HAsync Addon

**Current Configuration: CORRECT ✅**

```yaml
# config.yaml
image: "ghcr.io/dodoooh/{arch}-hasync-addon"
version: "1.3.29"
```

**What Happens:**
1. User installs addon
2. Supervisor reads `image:` field
3. Supervisor replaces `{arch}` with user's architecture (e.g., `amd64`)
4. Supervisor appends version tag from `version:` field
5. Supervisor pulls: `ghcr.io/dodoooh/amd64-hasync-addon:1.3.29`
6. No local building occurs

### Docker Image Requirements

**Your GHCR must have these images:**
- `ghcr.io/dodoooh/amd64-hasync-addon:1.3.29`
- `ghcr.io/dodoooh/armhf-hasync-addon:1.3.29`
- `ghcr.io/dodoooh/armv7-hasync-addon:1.3.29`
- `ghcr.io/dodoooh/aarch64-hasync-addon:1.3.29`
- `ghcr.io/dodoooh/i386-hasync-addon:1.3.29`

**Verification:**
```bash
# Check if images exist
docker pull ghcr.io/dodoooh/amd64-hasync-addon:1.3.29
docker pull ghcr.io/dodoooh/armhf-hasync-addon:1.3.29
# etc...
```

### GitHub Actions Build Configuration

**Your GitHub Actions should:**
1. Build multi-arch images using buildx
2. Tag each with version from config.yaml
3. Push to GHCR with correct naming

**Example workflow:**
```yaml
- name: Build and push
  uses: docker/build-push-action@v5
  with:
    platforms: linux/amd64,linux/arm/v7,linux/arm64
    push: true
    tags: |
      ghcr.io/dodoooh/amd64-hasync-addon:1.3.29
      ghcr.io/dodoooh/armhf-hasync-addon:1.3.29
      ghcr.io/dodoooh/aarch64-hasync-addon:1.3.29
```

---

## 11. Documentation Sources

### Official Documentation
1. [Add-on Configuration](https://developers.home-assistant.io/docs/add-ons/configuration/) - Official config.yaml reference
2. [Publishing Add-ons](https://developers.home-assistant.io/docs/add-ons/publishing/) - Pre-built image publishing guide
3. [Add-on Tutorial](https://developers.home-assistant.io/docs/add-ons/tutorial/) - Basic addon creation

### Community Resources
4. [Variables in config.yml Discussion](https://community.home-assistant.io/t/using-variables-in-config-yml-other-than-arch/433405) - Confirmed {version} not supported
5. [Supervisor Issue #3414](https://github.com/home-assistant/supervisor/issues/3414) - Image tag detection bug

### Code Examples
6. [Home Assistant Addons Repo](https://github.com/home-assistant/addons) - Official addon examples
7. [Addons Example Repo](https://github.com/home-assistant/addons-example) - Template addon
8. [Mincka Addons](https://github.com/mincka/ha-addons) - Community addon examples

---

## 12. Key Takeaways

1. **✅ Only `{arch}` placeholder is supported** - No `{version}`, `{slug}`, or other placeholders
2. **✅ Version is auto-appended by Supervisor** - From `version:` field in config.yaml
3. **✅ `image:` means PULL, `build_from:` means BUILD** - They are mutually exclusive
4. **✅ GHCR works without special config** - Just use `ghcr.io/username/...`
5. **✅ Your current config is correct** - `ghcr.io/dodoooh/{arch}-hasync-addon` + `version: "1.3.29"`
6. **❌ Never use `{version}` in image name** - Supervisor doesn't support it
7. **❌ build.yaml is ignored when using `image:`** - Only used for local builds

---

## Conclusion

Your current configuration is **CORRECT** and follows Home Assistant best practices. The Supervisor will successfully pull pre-built images from GHCR using the `{arch}` placeholder and automatically append the version tag.

**No changes needed to config.yaml or build.yaml.**

Just ensure your GitHub Actions workflow builds and pushes the correctly named images to GHCR.
