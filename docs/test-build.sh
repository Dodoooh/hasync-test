#!/bin/bash
# HAsync Alpine Build Validation Test Suite
# Tests the Alpine edge Node.js solution across multiple scenarios

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
IMAGE_NAME="hasync-test"
TAG="alpine-edge-validation"
FULL_IMAGE="${IMAGE_NAME}:${TAG}"
TEST_RESULTS_DIR="./test-results"
BUILD_ARCH="amd64" # Change for other architectures

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1"
}

cleanup() {
    log_info "Cleaning up test containers..."
    docker stop ${IMAGE_NAME}-runtime 2>/dev/null || true
    docker rm ${IMAGE_NAME}-runtime 2>/dev/null || true
}

# Trap cleanup on exit
trap cleanup EXIT

# Create results directory
mkdir -p "$TEST_RESULTS_DIR"

echo "============================================"
echo "  HAsync Alpine Build Validation Suite"
echo "============================================"
echo ""

# Test 1: Dockerfile Syntax Validation
log_info "Test 1: Validating Dockerfile syntax..."
if docker build --no-cache --dry-run -f ../example/Dockerfile ../example 2>&1 | grep -q "DEPRECATED"; then
    log_warning "Dockerfile has deprecated syntax"
else
    log_success "Dockerfile syntax valid"
fi
echo ""

# Test 2: Build Test
log_info "Test 2: Building Docker image..."
BUILD_START=$(date +%s)

if docker build \
    --build-arg BUILD_FROM=ghcr.io/home-assistant/${BUILD_ARCH}-base:3.15 \
    --build-arg TEMPIO_VERSION=2021.09.0 \
    --build-arg BUILD_ARCH=${BUILD_ARCH} \
    -t ${FULL_IMAGE} \
    -f ../example/Dockerfile \
    ../example 2>&1 | tee "${TEST_RESULTS_DIR}/build.log"; then

    BUILD_END=$(date +%s)
    BUILD_TIME=$((BUILD_END - BUILD_START))
    log_success "Build completed in ${BUILD_TIME} seconds"
    echo "${BUILD_TIME}" > "${TEST_RESULTS_DIR}/build-time.txt"
else
    log_error "Build failed! Check ${TEST_RESULTS_DIR}/build.log"
    exit 1
fi
echo ""

# Test 3: Image Size Check
log_info "Test 3: Checking image size..."
IMAGE_SIZE=$(docker images ${FULL_IMAGE} --format "{{.Size}}")
log_info "Image size: ${IMAGE_SIZE}"
echo "${IMAGE_SIZE}" > "${TEST_RESULTS_DIR}/image-size.txt"
echo ""

# Test 4: Node.js Version Verification
log_info "Test 4: Verifying Node.js version..."
NODE_VERSION=$(docker run --rm ${FULL_IMAGE} node --version)
NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d'.' -f1 | sed 's/v//')

if [ "$NODE_MAJOR" -ge 18 ]; then
    log_success "Node.js version: ${NODE_VERSION} (>= 18.0.0)"
    echo "${NODE_VERSION}" > "${TEST_RESULTS_DIR}/node-version.txt"
else
    log_error "Node.js version ${NODE_VERSION} does not meet requirement (>= 18.0.0)"
    exit 1
fi
echo ""

# Test 5: npm Version Check
log_info "Test 5: Verifying npm version..."
NPM_VERSION=$(docker run --rm ${FULL_IMAGE} npm --version)
log_success "npm version: ${NPM_VERSION}"
echo "${NPM_VERSION}" > "${TEST_RESULTS_DIR}/npm-version.txt"
echo ""

# Test 6: Native Module Loading Test
log_info "Test 6: Testing native module loading..."
if docker run --rm ${FULL_IMAGE} node -e "require('bcrypt'); require('better-sqlite3'); console.log('OK')" 2>&1 | grep -q "OK"; then
    log_success "Native modules (bcrypt, better-sqlite3) loaded successfully"
else
    log_error "Native modules failed to load"
    exit 1
fi
echo ""

# Test 7: libc Verification
log_info "Test 7: Verifying musl libc linkage..."
LIBC_INFO=$(docker run --rm ${FULL_IMAGE} ldd /usr/bin/node 2>&1 | head -5)
if echo "$LIBC_INFO" | grep -q "musl"; then
    log_success "Node.js correctly linked with musl libc"
    echo "$LIBC_INFO" > "${TEST_RESULTS_DIR}/libc-info.txt"
else
    log_warning "Could not verify musl linkage"
fi
echo ""

# Test 8: Runtime Dependencies Check
log_info "Test 8: Checking runtime dependencies..."
MISSING_DEPS=$(docker run --rm ${FULL_IMAGE} sh -c "ldd /usr/bin/node 2>&1 | grep 'not found' || echo 'none'")
if [ "$MISSING_DEPS" = "none" ]; then
    log_success "All runtime dependencies satisfied"
else
    log_error "Missing dependencies: ${MISSING_DEPS}"
    exit 1
fi
echo ""

# Test 9: Application Structure Verification
log_info "Test 9: Verifying application structure..."
APP_STRUCTURE=$(docker run --rm ${FULL_IMAGE} sh -c "ls -la /app && ls -la /app/backend && ls -la /app/frontend/dist")
if echo "$APP_STRUCTURE" | grep -q "backend" && echo "$APP_STRUCTURE" | grep -q "dist"; then
    log_success "Application structure correct"
else
    log_error "Application structure incomplete"
    exit 1
fi
echo ""

# Test 10: Frontend Build Artifacts Check
log_info "Test 10: Checking frontend build artifacts..."
FRONTEND_FILES=$(docker run --rm ${FULL_IMAGE} ls /app/frontend/dist)
if echo "$FRONTEND_FILES" | grep -q "index.html"; then
    log_success "Frontend build artifacts present"
    echo "$FRONTEND_FILES" > "${TEST_RESULTS_DIR}/frontend-files.txt"
else
    log_error "Frontend build artifacts missing"
    exit 1
fi
echo ""

# Test 11: Global Tools Verification
log_info "Test 11: Verifying global tools (tsx, http-server)..."
if docker run --rm ${FULL_IMAGE} tsx --version >/dev/null 2>&1; then
    log_success "tsx installed globally"
else
    log_error "tsx not found"
    exit 1
fi

if docker run --rm ${FULL_IMAGE} http-server --version >/dev/null 2>&1; then
    log_success "http-server installed globally"
else
    log_error "http-server not found"
    exit 1
fi
echo ""

# Test 12: Runtime Container Test
log_info "Test 12: Starting runtime container..."
docker run -d \
    --name ${IMAGE_NAME}-runtime \
    -p 8099:8099 \
    -p 5173:5173 \
    ${FULL_IMAGE} >/dev/null

log_info "Waiting for application startup (40 seconds)..."
sleep 40

# Test 13: Health Check Endpoint
log_info "Test 13: Testing health check endpoint..."
HEALTH_RESPONSE=$(curl -s http://localhost:8099/health || echo "FAILED")
if echo "$HEALTH_RESPONSE" | grep -q "ok\|healthy\|OK"; then
    log_success "Health check endpoint responding"
    echo "$HEALTH_RESPONSE" > "${TEST_RESULTS_DIR}/health-response.txt"
else
    log_warning "Health check endpoint not responding as expected: ${HEALTH_RESPONSE}"
fi
echo ""

# Test 14: Container Logs Check
log_info "Test 14: Checking container logs for errors..."
CONTAINER_LOGS=$(docker logs ${IMAGE_NAME}-runtime 2>&1)
echo "$CONTAINER_LOGS" > "${TEST_RESULTS_DIR}/container-logs.txt"

if echo "$CONTAINER_LOGS" | grep -qi "error\|fatal\|crash"; then
    log_warning "Errors found in container logs (check ${TEST_RESULTS_DIR}/container-logs.txt)"
else
    log_success "No critical errors in container logs"
fi
echo ""

# Test 15: Memory Usage Check
log_info "Test 15: Checking memory usage..."
MEMORY_USAGE=$(docker stats ${IMAGE_NAME}-runtime --no-stream --format "{{.MemUsage}}")
log_info "Current memory usage: ${MEMORY_USAGE}"
echo "${MEMORY_USAGE}" > "${TEST_RESULTS_DIR}/memory-usage.txt"
echo ""

# Test 16: CPU Usage Check
log_info "Test 16: Checking CPU usage..."
CPU_USAGE=$(docker stats ${IMAGE_NAME}-runtime --no-stream --format "{{.CPUPerc}}")
log_info "Current CPU usage: ${CPU_USAGE}"
echo "${CPU_USAGE}" > "${TEST_RESULTS_DIR}/cpu-usage.txt"
echo ""

# Test 17: Port Accessibility
log_info "Test 17: Testing port accessibility..."
if nc -z localhost 8099 2>/dev/null; then
    log_success "Port 8099 (backend) accessible"
else
    log_error "Port 8099 (backend) not accessible"
fi

if nc -z localhost 5173 2>/dev/null; then
    log_success "Port 5173 (frontend) accessible"
else
    log_error "Port 5173 (frontend) not accessible"
fi
echo ""

# Generate Summary Report
log_info "Generating summary report..."
{
    echo "HAsync Alpine Build Validation Report"
    echo "======================================"
    echo ""
    echo "Test Date: $(date)"
    echo "Build Architecture: ${BUILD_ARCH}"
    echo "Docker Image: ${FULL_IMAGE}"
    echo ""
    echo "Build Metrics:"
    echo "  - Build Time: $(cat ${TEST_RESULTS_DIR}/build-time.txt) seconds"
    echo "  - Image Size: $(cat ${TEST_RESULTS_DIR}/image-size.txt)"
    echo ""
    echo "Runtime Versions:"
    echo "  - Node.js: $(cat ${TEST_RESULTS_DIR}/node-version.txt)"
    echo "  - npm: $(cat ${TEST_RESULTS_DIR}/npm-version.txt)"
    echo ""
    echo "Resource Usage:"
    echo "  - Memory: $(cat ${TEST_RESULTS_DIR}/memory-usage.txt)"
    echo "  - CPU: $(cat ${TEST_RESULTS_DIR}/cpu-usage.txt)"
    echo ""
    echo "Test Results: Check individual logs in ${TEST_RESULTS_DIR}/"
} > "${TEST_RESULTS_DIR}/summary-report.txt"

cat "${TEST_RESULTS_DIR}/summary-report.txt"
echo ""

log_success "All validation tests completed!"
log_info "Results saved to: ${TEST_RESULTS_DIR}/"
echo ""

# Optional: Keep container running for manual testing
read -p "Keep container running for manual testing? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    cleanup
fi
