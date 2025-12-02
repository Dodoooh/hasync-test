#!/bin/bash
# Architecture Verification Script
# Purpose: Automated testing of Docker build architecture consistency

set -e

COLORS_RED='\033[0;31m'
COLORS_GREEN='\033[0;32m'
COLORS_YELLOW='\033[1;33m'
COLORS_BLUE='\033[0;34m'
COLORS_NC='\033[0m' # No Color

# Configuration
DOCKERFILE_DIR="tests"
REPORT_DIR="tests/reports"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

# Create report directory
mkdir -p "${REPORT_DIR}"

# Logging functions
log_info() {
    echo -e "${COLORS_BLUE}[INFO]${COLORS_NC} $1"
}

log_success() {
    echo -e "${COLORS_GREEN}[SUCCESS]${COLORS_NC} $1"
}

log_warning() {
    echo -e "${COLORS_YELLOW}[WARNING]${COLORS_NC} $1"
}

log_error() {
    echo -e "${COLORS_RED}[ERROR]${COLORS_NC} $1"
}

# Test 1: Diagnostic Build
test_diagnostic_build() {
    log_info "=== TEST 1: Diagnostic Build ==="

    local image_name="better-sqlite3-diagnostic:${TIMESTAMP}"
    local report_file="${REPORT_DIR}/diagnostic-${TIMESTAMP}.txt"

    log_info "Building diagnostic image..."
    if docker build -f "${DOCKERFILE_DIR}/Dockerfile.diagnostic" -t "${image_name}" . > "${report_file}" 2>&1; then
        log_success "Diagnostic build completed"

        log_info "Extracting diagnostic report..."
        docker run --rm "${image_name}" > "${REPORT_DIR}/diagnostic-runtime-${TIMESTAMP}.txt" 2>&1 || true

        log_info "Extracting internal diagnostics..."
        docker run --rm "${image_name}" cat /tmp/diagnostic-report.txt > "${REPORT_DIR}/diagnostic-internal-${TIMESTAMP}.txt" 2>&1 || true

        log_success "Diagnostic reports saved to ${REPORT_DIR}"

        # Cleanup
        docker rmi "${image_name}" 2>/dev/null || true
        return 0
    else
        log_error "Diagnostic build failed"
        log_info "Build log saved to ${report_file}"
        return 1
    fi
}

# Test 2: Minimal Build
test_minimal_build() {
    log_info "=== TEST 2: Minimal Reproduction Build ==="

    local image_name="better-sqlite3-minimal:${TIMESTAMP}"
    local report_file="${REPORT_DIR}/minimal-${TIMESTAMP}.txt"

    log_info "Building minimal image..."
    if docker build -f "${DOCKERFILE_DIR}/Dockerfile.minimal" -t "${image_name}" . > "${report_file}" 2>&1; then
        log_success "Minimal build completed"

        log_info "Testing runtime..."
        if docker run --rm "${image_name}" > "${REPORT_DIR}/minimal-runtime-${TIMESTAMP}.txt" 2>&1; then
            log_success "Minimal runtime test PASSED"
        else
            log_error "Minimal runtime test FAILED"
            log_info "Runtime log saved to ${REPORT_DIR}/minimal-runtime-${TIMESTAMP}.txt"
        fi

        # Cleanup
        docker rmi "${image_name}" 2>/dev/null || true
        return 0
    else
        log_error "Minimal build failed"
        log_info "Build log saved to ${report_file}"
        return 1
    fi
}

# Test 3: Architecture Verification
test_architecture_verification() {
    log_info "=== TEST 3: Architecture Verification ==="

    local image_name="arch-verify:${TIMESTAMP}"
    local report_file="${REPORT_DIR}/arch-verify-${TIMESTAMP}.txt"

    cat > /tmp/Dockerfile.arch-verify <<'EOF'
ARG BUILD_FROM=ghcr.io/hassio-addons/base-python/amd64:17.0.0
FROM ${BUILD_FROM}

RUN apk add --no-cache nodejs npm python3 make g++ file && \
    echo "System Architecture: $(uname -m)" && \
    echo "Node Architecture: $(node -p 'process.arch')" && \
    echo "GCC Target: $(gcc -dumpmachine)" && \
    mkdir /test && cd /test && \
    npm init -y && \
    npm install better-sqlite3 --build-from-source && \
    echo "Binary File Type:" && \
    find /test -name "better_sqlite3.node" -exec file {} \; && \
    echo "Binary ELF Header:" && \
    find /test -name "better_sqlite3.node" -exec readelf -h {} \; 2>&1 || true

CMD ["node", "-p", "require('better-sqlite3')(':memory:'); 'SUCCESS'"]
EOF

    log_info "Building architecture verification image..."
    if docker build -f /tmp/Dockerfile.arch-verify -t "${image_name}" . > "${report_file}" 2>&1; then
        log_success "Architecture verification build completed"

        log_info "Running architecture verification..."
        if docker run --rm "${image_name}" > "${REPORT_DIR}/arch-verify-runtime-${TIMESTAMP}.txt" 2>&1; then
            log_success "Architecture verification PASSED"
        else
            log_error "Architecture verification FAILED"
        fi

        # Cleanup
        docker rmi "${image_name}" 2>/dev/null || true
        rm /tmp/Dockerfile.arch-verify
        return 0
    else
        log_error "Architecture verification build failed"
        log_info "Build log saved to ${report_file}"
        rm /tmp/Dockerfile.arch-verify
        return 1
    fi
}

# Test 4: Cross-Architecture Build Test
test_cross_architecture() {
    log_info "=== TEST 4: Cross-Architecture Build Test ==="

    local platforms=("linux/amd64" "linux/arm64")

    for platform in "${platforms[@]}"; do
        log_info "Testing platform: ${platform}"

        local safe_platform=$(echo "${platform}" | tr '/' '-')
        local image_name="better-sqlite3-cross:${safe_platform}-${TIMESTAMP}"
        local report_file="${REPORT_DIR}/cross-${safe_platform}-${TIMESTAMP}.txt"

        log_info "Building for ${platform}..."
        if docker buildx build \
            --platform "${platform}" \
            -f "${DOCKERFILE_DIR}/Dockerfile.minimal" \
            -t "${image_name}" \
            --load \
            . > "${report_file}" 2>&1; then
            log_success "Build completed for ${platform}"

            log_info "Testing runtime for ${platform}..."
            if docker run --rm --platform "${platform}" "${image_name}" > "${REPORT_DIR}/cross-runtime-${safe_platform}-${TIMESTAMP}.txt" 2>&1; then
                log_success "Runtime test PASSED for ${platform}"
            else
                log_warning "Runtime test FAILED for ${platform}"
            fi

            # Cleanup
            docker rmi "${image_name}" 2>/dev/null || true
        else
            log_warning "Build failed for ${platform}"
            log_info "Build log saved to ${report_file}"
        fi
    done
}

# Test 5: Binary Compatibility Test
test_binary_compatibility() {
    log_info "=== TEST 5: Binary Compatibility Test ==="

    local image_name="binary-compat:${TIMESTAMP}"
    local report_file="${REPORT_DIR}/binary-compat-${TIMESTAMP}.txt"

    cat > /tmp/Dockerfile.binary-compat <<'EOF'
ARG BUILD_FROM=ghcr.io/hassio-addons/base-python/amd64:17.0.0
FROM ${BUILD_FROM}

RUN apk add --no-cache nodejs npm python3 make g++ file binutils && \
    mkdir /test && cd /test && \
    npm init -y && \
    npm install better-sqlite3 --build-from-source

# Comprehensive binary analysis
RUN cd /test && \
    echo "=== Binary Location ===" && \
    find . -name "better_sqlite3.node" && \
    echo "=== File Type ===" && \
    find . -name "better_sqlite3.node" -exec file {} \; && \
    echo "=== Size ===" && \
    find . -name "better_sqlite3.node" -exec ls -lh {} \; && \
    echo "=== Dependencies ===" && \
    find . -name "better_sqlite3.node" -exec ldd {} \; 2>&1 || echo "Static binary or ldd failed" && \
    echo "=== ELF Header ===" && \
    find . -name "better_sqlite3.node" -exec readelf -h {} \; 2>&1 || echo "Not ELF" && \
    echo "=== Symbols ===" && \
    find . -name "better_sqlite3.node" -exec nm -D {} \; 2>&1 | head -20 || echo "No symbols"

# Test loading
RUN cd /test && node -e "const db = require('better-sqlite3')(':memory:'); console.log('Load test: SUCCESS'); db.close();"

CMD ["sh", "-c", "cd /test && node -e \"const db = require('better-sqlite3')(':memory:'); console.log('Runtime test: SUCCESS'); db.close();\""]
EOF

    log_info "Building binary compatibility image..."
    if docker build -f /tmp/Dockerfile.binary-compat -t "${image_name}" . > "${report_file}" 2>&1; then
        log_success "Binary compatibility build completed"

        log_info "Running binary compatibility test..."
        if docker run --rm "${image_name}" > "${REPORT_DIR}/binary-compat-runtime-${TIMESTAMP}.txt" 2>&1; then
            log_success "Binary compatibility test PASSED"
        else
            log_error "Binary compatibility test FAILED"
        fi

        # Extract detailed binary info
        docker run --rm "${image_name}" sh -c "find /test -name 'better_sqlite3.node' -exec readelf -a {} \;" > "${REPORT_DIR}/binary-readelf-${TIMESTAMP}.txt" 2>&1 || true

        # Cleanup
        docker rmi "${image_name}" 2>/dev/null || true
        rm /tmp/Dockerfile.binary-compat
        return 0
    else
        log_error "Binary compatibility build failed"
        log_info "Build log saved to ${report_file}"
        rm /tmp/Dockerfile.binary-compat
        return 1
    fi
}

# Generate Summary Report
generate_summary() {
    log_info "=== Generating Summary Report ==="

    local summary_file="${REPORT_DIR}/summary-${TIMESTAMP}.txt"

    cat > "${summary_file}" <<EOF
================================================================================
ARCHITECTURE VERIFICATION TEST SUMMARY
Generated: $(date)
================================================================================

TEST RESULTS:
EOF

    # Count test results
    local total_tests=5
    local passed=0
    local failed=0

    for report in "${REPORT_DIR}"/*-${TIMESTAMP}.txt; do
        if [ -f "${report}" ]; then
            if grep -q "SUCCESS" "${report}" 2>/dev/null; then
                ((passed++))
            else
                ((failed++))
            fi
        fi
    done

    cat >> "${summary_file}" <<EOF

Total Tests: ${total_tests}
Completed: $((passed + failed))
Status: $([ ${failed} -eq 0 ] && echo "PASSED" || echo "FAILED")

REPORT FILES:
$(ls -1 "${REPORT_DIR}"/*-${TIMESTAMP}.txt 2>/dev/null || echo "No reports generated")

================================================================================
DIAGNOSTIC RECOMMENDATIONS:
================================================================================

1. Check diagnostic-internal-*.txt for architecture timeline
2. Review minimal-runtime-*.txt for basic functionality test
3. Examine arch-verify-runtime-*.txt for consistency issues
4. Analyze binary-compat-runtime-*.txt for compatibility problems
5. Compare cross-architecture results for platform-specific issues

KEY AREAS TO INVESTIGATE:
- System architecture vs binary architecture mismatch
- GCC compilation target settings
- Node.js architecture detection
- Better-sqlite3 build configuration
- ELF binary format compatibility

================================================================================
EOF

    cat "${summary_file}"
    log_success "Summary report saved to ${summary_file}"
}

# Main execution
main() {
    log_info "Starting Architecture Verification Test Suite"
    log_info "Timestamp: ${TIMESTAMP}"
    log_info "Report Directory: ${REPORT_DIR}"
    echo ""

    # Run all tests
    test_diagnostic_build
    echo ""

    test_minimal_build
    echo ""

    test_architecture_verification
    echo ""

    test_cross_architecture
    echo ""

    test_binary_compatibility
    echo ""

    # Generate summary
    generate_summary

    log_success "All tests completed. Reports available in ${REPORT_DIR}"
}

# Run main function
main "$@"
