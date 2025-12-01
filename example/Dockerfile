# https://developers.home-assistant.io/docs/add-ons/configuration#add-on-dockerfile
ARG BUILD_FROM
FROM $BUILD_FROM

# Build arguments from build.yaml
ARG NODE_VERSION

# Install build dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    sqlite \
    curl \
    bash \
    xz \
    && rm -rf /var/cache/apk/*

# Install Node.js 18.x (required for Vite and modern packages)
ARG NODE_VERSION=18.20.5
RUN curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" -o /tmp/node.tar.xz \
    && mkdir -p /usr/local/lib/nodejs \
    && tar -xJf /tmp/node.tar.xz -C /usr/local/lib/nodejs \
    && rm /tmp/node.tar.xz \
    && ln -s "/usr/local/lib/nodejs/node-v${NODE_VERSION}-linux-x64/bin/node" /usr/local/bin/node \
    && ln -s "/usr/local/lib/nodejs/node-v${NODE_VERSION}-linux-x64/bin/npm" /usr/local/bin/npm \
    && ln -s "/usr/local/lib/nodejs/node-v${NODE_VERSION}-linux-x64/bin/npx" /usr/local/bin/npx \
    && node --version \
    && npm --version

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
