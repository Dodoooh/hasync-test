# https://developers.home-assistant.io/docs/add-ons/configuration#add-on-dockerfile
ARG BUILD_FROM
FROM $BUILD_FROM

# Build arguments from build.yaml
ARG NODE_VERSION

# Install build dependencies and Node.js 18 from edge repository
# Alpine 3.15 has Node 16, but edge has Node 18+ (musl-compatible)
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    sqlite \
    curl \
    bash \
    && apk add --no-cache --repository=http://dl-cdn.alpinelinux.org/alpine/edge/main \
    nodejs \
    npm \
    && rm -rf /var/cache/apk/*

# Execute during the build of the image
ARG TEMPIO_VERSION BUILD_ARCH
RUN \
    curl -sSLf -o /usr/bin/tempio \
    "https://github.com/home-assistant/tempio/releases/download/${TEMPIO_VERSION}/tempio_${BUILD_ARCH}"

# Copy root filesystem
COPY rootfs /

# Set working directory
WORKDIR /app

# Copy backend package files first for better layer caching
COPY rootfs/app/backend/package*.json /app/backend/
WORKDIR /app/backend
RUN npm install --omit=dev --no-audit --no-fund \
    && npm cache clean --force

# Copy backend source
COPY rootfs/app/backend/src /app/backend/src

# Copy frontend package files
WORKDIR /app/frontend
COPY rootfs/app/frontend/package*.json /app/frontend/
COPY rootfs/app/frontend/tsconfig*.json /app/frontend/
COPY rootfs/app/frontend/vite.config.ts /app/frontend/
RUN npm install --no-audit --no-fund

# Copy frontend source
COPY rootfs/app/frontend/src /app/frontend/src
COPY rootfs/app/frontend/public /app/frontend/public
COPY rootfs/app/frontend/index.html /app/frontend/

# Build frontend
RUN npm run build \
    && npm cache clean --force

# Install global tools
RUN npm install -g tsx http-server --no-audit --no-fund \
    && npm cache clean --force

# Setup data directory
RUN mkdir -p /data && chmod 755 /data

# Reset to app directory
WORKDIR /app

# Make run.sh executable
RUN chmod a+x /run.sh

# Expose ports
EXPOSE 8099 5173

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8099/health || exit 1

# Use exec form for proper signal handling
CMD ["/run.sh"]
