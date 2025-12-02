#!/bin/bash
# Force rebuild HAsync addon for Home Assistant
# This script clears all caches and rebuilds from scratch

set -e

echo "🧹 HAsync Addon Force Rebuild Script v1.3.29"
echo "============================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running on Home Assistant
if command -v ha &> /dev/null; then
    echo "✅ Running on Home Assistant system"
    HA_MODE=true
else
    echo "⚠️  Not running on Home Assistant - using Docker mode"
    HA_MODE=false
fi

echo ""
echo "Step 1: Stop addon..."
if [ "$HA_MODE" = true ]; then
    ha addons stop local_example 2>/dev/null || echo "Addon already stopped"
else
    docker stop hasync-test 2>/dev/null || echo "Container not running"
    docker rm hasync-test 2>/dev/null || echo "Container removed"
fi

echo ""
echo "Step 2: Clear Docker cache..."
echo "${YELLOW}WARNING: This will remove ALL unused Docker images${NC}"
read -p "Continue? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    docker system prune -af --volumes
    echo "✅ Cache cleared"
else
    echo "Skipping cache clear"
fi

echo ""
echo "Step 3: Clean node_modules..."
cd "$(dirname "$0")/.."
rm -rf rootfs/app/backend/node_modules
rm -rf rootfs/app/frontend/node_modules
echo "✅ node_modules removed"

echo ""
echo "Step 4: Rebuild addon..."
if [ "$HA_MODE" = true ]; then
    echo "Using Home Assistant builder..."
    ha addons rebuild local_example --no-cache
else
    echo "Using Docker buildx..."
    docker buildx build \
        --platform linux/amd64 \
        --build-arg BUILD_FROM=ghcr.io/home-assistant/amd64-base:3.15 \
        --build-arg TEMPIO_VERSION=2021.09.0 \
        --build-arg BUILD_ARCH=amd64 \
        --load \
        --no-cache \
        -t hasync-test:v1.3.29 \
        .
fi

echo ""
echo "Step 5: Start addon..."
if [ "$HA_MODE" = true ]; then
    ha addons start local_example
    sleep 5
    echo ""
    echo "📋 Checking logs..."
    ha addons logs local_example | tail -30
else
    docker run --rm -d \
        --name hasync-test \
        -e JWT_SECRET="test-secret-$(openssl rand -hex 16)" \
        -e ADMIN_USERNAME="admin" \
        -e ADMIN_PASSWORD="test123" \
        -p 8099:8099 \
        -p 5173:5173 \
        hasync-test:v1.3.29

    sleep 10
    echo ""
    echo "📋 Checking logs..."
    docker logs hasync-test | tail -30
fi

echo ""
echo "============================================"
echo "✅ Rebuild complete!"
echo ""
echo "Expected output:"
echo "  ${GREEN}✓ Server v1.3.29${NC}"
echo "  ${GREEN}✓ Pairing tables ready${NC}"
echo "  ${GREEN}✓ NO 'Exec format error'${NC}"
echo ""
echo "If you still see errors, check:"
echo "  1. Addon version is 1.3.29"
echo "  2. Build completed successfully"
echo "  3. No cached images remain"
