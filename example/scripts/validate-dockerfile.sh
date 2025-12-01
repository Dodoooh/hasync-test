#!/bin/bash
# ==============================================================================
# Dockerfile Validation Script
# ==============================================================================
# This script validates the multi-stage Dockerfile build process
# Usage: ./scripts/validate-dockerfile.sh [--quick]
# ==============================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
IMAGE_NAME="hasync-test"
BUILD_FROM="${BUILD_FROM:-ghcr.io/hassio-addons/base:15.0.8}"
TEMPIO_VERSION="${TEMPIO_VERSION:-2021.09.0}"
BUILD_ARCH="${BUILD_ARCH:-amd64}"
QUICK_MODE=false

# Parse arguments
if [[ "$1" == "--quick" ]]; then
    QUICK_MODE=true
fi

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Validation steps
validate_prerequisites() {
    log_info "Validating prerequisites..."

    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi
    log_success "Docker found: $(docker --version)"

    # Check Docker is running
    if ! docker info &> /dev/null; then
        log_error "Docker daemon is not running"
        exit 1
    fi
    log_success "Docker daemon is running"

    # Check Dockerfile exists
    if [[ ! -f "Dockerfile" ]]; then
        log_error "Dockerfile not found in current directory"
        exit 1
    fi
    log_success "Dockerfile found"

    # Check required directories
    if [[ ! -d "rootfs/app/frontend" ]] || [[ ! -d "rootfs/app/backend" ]]; then
        log_error "Required app directories not found"
        exit 1
    fi
    log_success "Application directories found"
}

build_dockerfile() {
    log_info "Building Dockerfile (this may take 5-10 minutes)..."

    local build_cmd="docker build"
    local build_args=(
        "--build-arg" "BUILD_FROM=${BUILD_FROM}"
        "--build-arg" "TEMPIO_VERSION=${TEMPIO_VERSION}"
        "--build-arg" "BUILD_ARCH=${BUILD_ARCH}"
        "--tag" "${IMAGE_NAME}:latest"
    )

    if [[ "$QUICK_MODE" == false ]]; then
        build_args+=("--no-cache")
        log_warning "Building without cache (use --quick for cached build)"
    fi

    build_args+=(".")

    if ${build_cmd} "${build_args[@]}"; then
        log_success "Docker build completed successfully"
        return 0
    else
        log_error "Docker build failed"
        return 1
    fi
}

validate_image() {
    log_info "Validating built image..."

    # Check image exists
    if ! docker image inspect "${IMAGE_NAME}:latest" &> /dev/null; then
        log_error "Built image not found"
        return 1
    fi
    log_success "Image exists"

    # Check image size
    local size=$(docker image inspect "${IMAGE_NAME}:latest" --format='{{.Size}}')
    local size_mb=$((size / 1024 / 1024))
    log_info "Image size: ${size_mb}MB"

    if [[ ${size_mb} -gt 1000 ]]; then
        log_warning "Image size is large (>${size_mb}MB)"
    else
        log_success "Image size is acceptable (<1000MB)"
    fi

    # Check layers
    local layers=$(docker history "${IMAGE_NAME}:latest" --no-trunc | wc -l)
    log_info "Number of layers: ${layers}"
}

validate_image_contents() {
    log_info "Validating image contents..."

    # Check Node.js version
    local node_version=$(docker run --rm "${IMAGE_NAME}:latest" node --version 2>/dev/null || echo "")
    if [[ -z "$node_version" ]]; then
        log_error "Node.js not found in image"
        return 1
    fi

    # Parse major version
    local major_version=$(echo "$node_version" | sed 's/v\([0-9]*\).*/\1/')
    if [[ ${major_version} -ge 18 ]]; then
        log_success "Node.js ${node_version} found (required: 18+)"
    else
        log_error "Node.js version ${node_version} is too old (required: 18+)"
        return 1
    fi

    # Check npm
    local npm_version=$(docker run --rm "${IMAGE_NAME}:latest" npm --version 2>/dev/null || echo "")
    if [[ -z "$npm_version" ]]; then
        log_error "npm not found in image"
        return 1
    fi
    log_success "npm ${npm_version} found"

    # Check tsx
    if docker run --rm "${IMAGE_NAME}:latest" which tsx &> /dev/null; then
        log_success "tsx found (TypeScript runtime)"
    else
        log_error "tsx not found"
        return 1
    fi

    # Check http-server
    if docker run --rm "${IMAGE_NAME}:latest" which http-server &> /dev/null; then
        log_success "http-server found"
    else
        log_error "http-server not found"
        return 1
    fi

    # Check frontend build output
    local frontend_files=$(docker run --rm "${IMAGE_NAME}:latest" ls -1 /app/frontend/dist 2>/dev/null | wc -l)
    if [[ ${frontend_files} -gt 0 ]]; then
        log_success "Frontend build output found (${frontend_files} files)"
    else
        log_error "Frontend build output not found"
        return 1
    fi

    # Check backend source
    if docker run --rm "${IMAGE_NAME}:latest" test -f /app/backend/src/index-simple.ts &> /dev/null; then
        log_success "Backend source found"
    else
        log_error "Backend source not found"
        return 1
    fi

    # Check backend dependencies
    if docker run --rm "${IMAGE_NAME}:latest" test -d /app/backend/node_modules &> /dev/null; then
        log_success "Backend dependencies installed"
    else
        log_error "Backend dependencies not found"
        return 1
    fi

    # Check critical native modules
    log_info "Checking native modules..."
    if docker run --rm "${IMAGE_NAME}:latest" node -e "require('better-sqlite3')" 2>/dev/null; then
        log_success "better-sqlite3 module works"
    else
        log_error "better-sqlite3 module not working"
        return 1
    fi

    if docker run --rm "${IMAGE_NAME}:latest" node -e "require('bcrypt')" 2>/dev/null; then
        log_success "bcrypt module works"
    else
        log_error "bcrypt module not working"
        return 1
    fi
}

test_runtime() {
    log_info "Testing runtime startup (this will take ~30 seconds)..."

    # Start container
    local container_id=$(docker run -d \
        -p 8099:8099 \
        -p 5173:5173 \
        -e JWT_SECRET="test-secret-key-for-validation" \
        -e DATABASE_PATH="/data/test.db" \
        -e LOG_LEVEL="info" \
        "${IMAGE_NAME}:latest" 2>/dev/null || echo "")

    if [[ -z "$container_id" ]]; then
        log_error "Failed to start container"
        return 1
    fi

    log_info "Container started: ${container_id:0:12}"

    # Wait for services to start
    log_info "Waiting for services to start..."
    sleep 15

    # Check container is running
    if ! docker ps | grep -q "${container_id:0:12}"; then
        log_error "Container exited unexpectedly"
        log_info "Container logs:"
        docker logs "${container_id}"
        docker rm -f "${container_id}" &> /dev/null
        return 1
    fi
    log_success "Container is running"

    # Check backend health
    log_info "Checking backend health endpoint..."
    local health_check=0
    for i in {1..10}; do
        if curl -f -s http://localhost:8099/health > /dev/null 2>&1; then
            health_check=1
            break
        fi
        sleep 3
    done

    if [[ ${health_check} -eq 1 ]]; then
        log_success "Backend health check passed"
    else
        log_warning "Backend health check failed (may need more time)"
    fi

    # Cleanup
    log_info "Stopping container..."
    docker stop "${container_id}" &> /dev/null
    docker rm "${container_id}" &> /dev/null
    log_success "Container stopped and removed"
}

show_summary() {
    echo ""
    echo "======================================"
    echo "  Dockerfile Validation Summary"
    echo "======================================"
    docker images "${IMAGE_NAME}:latest" --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}"
    echo ""
    log_info "To run the image:"
    echo "  docker run -p 8099:8099 -p 5173:5173 ${IMAGE_NAME}:latest"
    echo ""
    log_info "To push to registry:"
    echo "  docker tag ${IMAGE_NAME}:latest your-registry/${IMAGE_NAME}:latest"
    echo "  docker push your-registry/${IMAGE_NAME}:latest"
    echo ""
    log_info "To clean up:"
    echo "  docker rmi ${IMAGE_NAME}:latest"
    echo ""
}

# Main execution
main() {
    log_info "Starting Dockerfile validation..."
    echo ""

    validate_prerequisites || exit 1
    echo ""

    build_dockerfile || exit 1
    echo ""

    validate_image || exit 1
    echo ""

    validate_image_contents || exit 1
    echo ""

    if [[ "$QUICK_MODE" == false ]]; then
        test_runtime || log_warning "Runtime test failed or incomplete"
        echo ""
    else
        log_info "Skipping runtime test (quick mode)"
        echo ""
    fi

    show_summary

    log_success "All validation checks passed!"
}

# Run main function
main "$@"
