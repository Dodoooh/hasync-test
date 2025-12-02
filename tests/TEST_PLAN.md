# Build Verification Test Plan
## Identifying Architecture Mismatch in better-sqlite3

### Overview
This test plan provides a comprehensive approach to diagnosing the architecture mismatch issue causing the "wrong ELF class" error when loading better-sqlite3 in Docker containers.

### Problem Statement
The better-sqlite3 native module fails to load with:
```
Error: /app/backend/node_modules/better-sqlite3/build/Release/better_sqlite3.node: wrong ELF class: ELFCLASS64
```

This indicates an architecture mismatch between the system expecting a binary and the binary that was built.

---

## Test Phase 1: Diagnostic Build

### Purpose
Verify architecture consistency at each build stage and identify where the mismatch occurs.

### Test File
`tests/Dockerfile.diagnostic`

### What It Tests
1. Base image architecture
2. Node.js installation architecture
3. Build tools (GCC, G++) target architecture
4. better-sqlite3 binary architecture
5. Runtime load test
6. Environment variable configuration

### Execution
```bash
# Build diagnostic image
docker build -f tests/Dockerfile.diagnostic -t better-sqlite3-diagnostic .

# Run and capture output
docker run --rm better-sqlite3-diagnostic > diagnostic-output.txt

# Extract internal diagnostics
docker run --rm better-sqlite3-diagnostic cat /tmp/diagnostic-report.txt
```

### Expected Output
```
STAGE 1 - Base Architecture: x86_64 or aarch64
STAGE 2 - After Node.js Install: x64 or arm64
STAGE 3 - Build Tools: x86_64-alpine-linux-musl or aarch64-alpine-linux-musl
STAGE 4 - Binary Analysis: ELF 64-bit LSB shared object, x86-64
STAGE 4b - Load Test: SUCCESS: Module loaded
STAGE 5 - Consistency: All architectures match
```

### Success Criteria
- All stages report consistent architecture
- Binary ELF class matches system architecture
- Module loads successfully

### Failure Analysis
If test fails, examine:
- Which stage shows architecture change
- GCC target vs system architecture
- Node.js process.arch vs uname -m
- Binary ELF class vs expected class

---

## Test Phase 2: Minimal Reproduction

### Purpose
Isolate the issue with absolute minimal setup to eliminate confounding variables.

### Test File
`tests/Dockerfile.minimal`

### What It Tests
1. Clean Node.js installation
2. better-sqlite3 compilation from source
3. Binary architecture verification
4. Simple load test

### Execution
```bash
# Build minimal image
docker build -f tests/Dockerfile.minimal -t better-sqlite3-minimal .

# Run load test
docker run --rm better-sqlite3-minimal

# Extract npm install log
docker run --rm better-sqlite3-minimal cat /tmp/npm-install.log
```

### Expected Output
```
Binary Location: /minimal-test/node_modules/better-sqlite3/build/Release/better_sqlite3.node
Binary Architecture: ELF 64-bit LSB shared object, x86-64
System Architecture: x86_64
Node Architecture: x64
SUCCESS
```

### Success Criteria
- Binary builds without errors
- Architecture matches system
- Module loads successfully

### Failure Analysis
If test fails, check:
- npm install logs for compilation errors
- Node.js architecture detection
- Build tool configuration

---

## Test Phase 3: Automated Verification

### Purpose
Run comprehensive automated test suite covering all scenarios.

### Test File
`tests/verify-architecture.sh`

### What It Tests
1. Diagnostic build (Phase 1)
2. Minimal build (Phase 2)
3. Architecture verification
4. Cross-architecture builds (amd64, arm64)
5. Binary compatibility analysis

### Execution
```bash
# Make script executable
chmod +x tests/verify-architecture.sh

# Run full test suite
./tests/verify-architecture.sh

# Results saved to tests/reports/
```

### Test Breakdown

#### Test 1: Diagnostic Build
- Runs full diagnostic Dockerfile
- Extracts all stage reports
- Saves to `tests/reports/diagnostic-*.txt`

#### Test 2: Minimal Build
- Runs minimal reproduction
- Tests runtime execution
- Saves to `tests/reports/minimal-*.txt`

#### Test 3: Architecture Verification
- Creates simple verification build
- Checks architecture consistency
- Saves to `tests/reports/arch-verify-*.txt`

#### Test 4: Cross-Architecture
- Builds for multiple platforms
- Tests each platform independently
- Saves to `tests/reports/cross-*.txt`

#### Test 5: Binary Compatibility
- Analyzes binary in depth
- Checks ELF headers, symbols, dependencies
- Saves to `tests/reports/binary-compat-*.txt`

### Expected Output
```
[INFO] Starting Architecture Verification Test Suite
[SUCCESS] Diagnostic build completed
[SUCCESS] Minimal build completed
[SUCCESS] Architecture verification PASSED
[SUCCESS] Runtime test PASSED for linux/amd64
[SUCCESS] Binary compatibility test PASSED
[SUCCESS] All tests completed
```

### Generated Reports
All reports saved to `tests/reports/` with timestamp:
- `diagnostic-{timestamp}.txt` - Build log
- `diagnostic-runtime-{timestamp}.txt` - Runtime output
- `diagnostic-internal-{timestamp}.txt` - Internal diagnostics
- `minimal-{timestamp}.txt` - Minimal build log
- `minimal-runtime-{timestamp}.txt` - Minimal runtime output
- `arch-verify-{timestamp}.txt` - Architecture verification
- `cross-{platform}-{timestamp}.txt` - Cross-platform builds
- `binary-compat-{timestamp}.txt` - Binary analysis
- `summary-{timestamp}.txt` - Test summary

---

## Test Phase 4: GitHub Actions Integration

### Purpose
Automate testing in CI/CD pipeline for continuous verification.

### Test File
`tests/ci-test-architecture.yml`

### What It Tests
- Multi-architecture builds (amd64, arm64, arm/v7)
- Parallel platform testing
- Automated failure detection
- Artifact collection

### Execution
1. Copy to `.github/workflows/test-architecture.yml`
2. Push to trigger workflow
3. Check Actions tab for results
4. Download artifacts for detailed analysis

### Configuration
```yaml
strategy:
  matrix:
    platform:
      - linux/amd64
      - linux/arm64
      - linux/arm/v7
```

---

## Manual Verification Commands

### Check System Architecture
```bash
docker run --rm ghcr.io/hassio-addons/base-python/amd64:17.0.0 uname -m
# Expected: x86_64
```

### Check Node Architecture
```bash
docker run --rm ghcr.io/hassio-addons/base-python/amd64:17.0.0 sh -c \
  "apk add nodejs && node -p 'process.arch'"
# Expected: x64
```

### Check GCC Target
```bash
docker run --rm ghcr.io/hassio-addons/base-python/amd64:17.0.0 sh -c \
  "apk add gcc && gcc -dumpmachine"
# Expected: x86_64-alpine-linux-musl
```

### Check Binary Architecture
```bash
docker run --rm {image_name} sh -c \
  "find /app -name 'better_sqlite3.node' -exec file {} \;"
# Expected: ELF 64-bit LSB shared object, x86-64
```

### Check Binary ELF Header
```bash
docker run --rm {image_name} sh -c \
  "find /app -name 'better_sqlite3.node' -exec readelf -h {} \;"
# Check Class, Machine, and other ELF attributes
```

---

## Diagnostic Checklist

### Pre-Build Verification
- [ ] Base image architecture matches target
- [ ] BUILD_FROM argument is correct
- [ ] Docker buildx is configured properly
- [ ] Platform flag matches base image

### Build-Time Verification
- [ ] Node.js detects correct architecture
- [ ] GCC targets correct architecture
- [ ] Python3 is available for node-gyp
- [ ] Build tools are native to platform
- [ ] No cross-compilation is occurring

### Post-Build Verification
- [ ] Binary exists at expected location
- [ ] Binary ELF class matches system
- [ ] Binary machine type is correct
- [ ] Binary has required symbols
- [ ] Module loads in Node.js

### Runtime Verification
- [ ] Container architecture matches binary
- [ ] No architecture emulation is active
- [ ] Node.js can load native modules
- [ ] SQLite operations work correctly

---

## Common Issues and Solutions

### Issue 1: Wrong ELF Class
**Symptom:** ELFCLASS64 error or ELFCLASS32 error

**Cause:** Binary built for different architecture than runtime

**Solutions:**
1. Ensure base image matches target platform
2. Use `--build-from-source` for better-sqlite3
3. Set correct npm_config_arch if cross-compiling
4. Verify GCC target matches Node.js architecture

### Issue 2: Architecture Mismatch
**Symptom:** x86_64 binary on arm64 system or vice versa

**Cause:** Cross-compilation or wrong base image

**Solutions:**
1. Use docker buildx with correct --platform flag
2. Ensure BUILD_FROM matches target architecture
3. Check for emulation (qemu) interference
4. Rebuild from source on target platform

### Issue 3: Module Not Found
**Symptom:** Cannot find module 'better-sqlite3'

**Cause:** Binary not built or wrong location

**Solutions:**
1. Verify npm install completed successfully
2. Check node_modules directory structure
3. Ensure build tools are installed
4. Review npm install logs for errors

### Issue 4: Compilation Failures
**Symptom:** npm install fails during build

**Cause:** Missing build dependencies

**Solutions:**
1. Install python3, make, g++, gcc
2. Update npm and node-gyp
3. Clear npm cache
4. Use --verbose flag to debug

---

## Expected Results Summary

### Successful Build Indicators
```
✓ System arch: x86_64
✓ Node arch: x64
✓ GCC target: x86_64-alpine-linux-musl
✓ Binary arch: ELF 64-bit LSB shared object, x86-64
✓ Module loads: SUCCESS
✓ Database operations: PASS
```

### Failure Indicators
```
✗ Architecture mismatch detected
✗ ELF class mismatch
✗ Module load failed
✗ Binary not found
✗ Compilation errors
```

---

## Next Steps After Testing

### If All Tests Pass
1. Apply fixes to main Dockerfile
2. Update documentation
3. Add CI/CD verification
4. Deploy to production

### If Tests Fail
1. Review specific failure point from reports
2. Examine build logs in detail
3. Check architecture consistency
4. Verify base image selection
5. Consider alternative solutions:
   - Use different base image
   - Pre-built binaries
   - Alternative database library
   - Docker multi-stage builds

---

## Support and Resources

### Documentation
- better-sqlite3: https://github.com/WiseLibs/better-sqlite3
- Node.js Native Modules: https://nodejs.org/api/addons.html
- Docker Multi-platform: https://docs.docker.com/build/building/multi-platform/
- ELF Format: https://en.wikipedia.org/wiki/Executable_and_Linkable_Format

### Debug Tools
- `file` - Determine file type and architecture
- `readelf` - Read ELF binary headers
- `ldd` - Check shared library dependencies
- `nm` - List symbols in binary
- `objdump` - Disassemble and analyze binary

### Contact
For issues specific to this test plan, refer to the project repository issues.

---

## Appendix: Quick Reference

### Test Execution Order
```bash
# 1. Diagnostic test
docker build -f tests/Dockerfile.diagnostic -t test1 .
docker run --rm test1 | tee results1.txt

# 2. Minimal test
docker build -f tests/Dockerfile.minimal -t test2 .
docker run --rm test2 | tee results2.txt

# 3. Automated suite
chmod +x tests/verify-architecture.sh
./tests/verify-architecture.sh

# 4. Review results
ls -la tests/reports/
cat tests/reports/summary-*.txt
```

### Quick Diagnosis Commands
```bash
# Check what's in the binary
file path/to/better_sqlite3.node

# Check ELF class
readelf -h path/to/better_sqlite3.node | grep Class

# Check machine type
readelf -h path/to/better_sqlite3.node | grep Machine

# Test load
node -e "require('better-sqlite3')(':memory:')"
```

---

## Conclusion

This test plan provides:
1. **Comprehensive diagnostics** to identify exact failure point
2. **Minimal reproduction** to isolate the issue
3. **Automated testing** for rapid iteration
4. **CI/CD integration** for continuous verification
5. **Detailed analysis** for root cause determination

Execute tests in order, review reports carefully, and use findings to implement targeted fixes.
