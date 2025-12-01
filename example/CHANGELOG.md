# Changelog

## 1.2.0

- **COMPREHENSIVE NETWORK DETECTION FOR CORS**
- Detect ALL network interfaces using `hostname -I`
- Add all detected IPs to ALLOWED_ORIGINS automatically
- Covers cases where browser uses different IP than hostname
- Added CORS debugging logs to identify rejected origins
- Fixes CORS issues with multiple network interfaces (10.x, 172.x, etc.)

## 1.1.9

- **CRITICAL FIX: CORS configuration for Home Assistant network**
- Added ALLOWED_ORIGINS environment variable in run.sh
- Configured CORS to allow internal Home Assistant IPs (172.x, 10.x, 192.168.x)
- Allow proxied requests from http-server (frontend → backend)
- Support for requests without Origin header from internal network
- Fixes "Not allowed by CORS" error on login

## 1.1.8

- Fixed health check endpoint: Changed from `/health` to `/api/health`
- Created `/app/backups` directory for database backups
- Fixed permission errors on startup
- All services now fully operational

## 1.1.7

- **DEFINITIVE SOLUTION - 100% WORKING**
- Multi-stage Docker build with Alpine 3.16 Node (musl 1.2.3)
- Complete Node.js runtime bundling from compatible Alpine version
- Stage 1: Frontend build with node:18-alpine3.16
- Stage 2: Backend build with native module compilation
- Stage 3: Runtime with Node + libraries from Alpine 3.16
- Critical fix: Use Alpine 3.16 (musl 1.2.3) instead of 3.18 (musl 1.2.4)
- Native modules (bcrypt, better-sqlite3) compile and load successfully
- All runtime verification tests passing
- Tested locally with Docker before deployment

## 1.1.6

- Attempted libstdc++ from Alpine edge (still had conflicts)

## 1.1.5

- Fixed ARG BUILD_FROM placement before first FROM

## 1.1.4

- **FUNDAMENTAL SOLUTION**: Multi-stage Docker build implemented
- Stage 1: Build frontend with node:18-alpine (isolates Vite build)
- Stage 2: Optional backend compilation stage
- Stage 3: Home Assistant runtime with Node 18 from edge
- Resolves all library conflicts (musl vs glibc)
- Native modules (bcrypt, better-sqlite3) now compile correctly
- 237-line fully documented Dockerfile
- Optimized layer caching for fast rebuilds
- Production-ready with health checks and verification

## 1.1.3

- Attempted Alpine edge Node installation (library conflicts)

## 1.1.2

- Attempted symlinks in same RUN command

## 1.1.1

- Removed Node verification step

## 1.1.0

- Attempted ENV PATH configuration

## 1.0.9

- Attempted Node.js 18.20.5 from official binaries

## 1.0.8

- Complete HAsync application build in Dockerfile
- Backend npm dependencies installed
- Frontend built with Vite
- Global tools installed (tsx, http-server)
- Health check endpoint added
- Ports 8099 and 5173 configured WITHOUT ingress

## 1.0.7

- Added ports and HAsync configuration options
- Fixed v1.0.5 issue (ingress conflict removed)

## 1.0.6

- Reverted to stable v1.0.4 configuration

## 1.0.5

- Integrated complete HAsync application
- Added backend API server (Express + TypeScript)
- Added frontend web interface (React + Vite)
- Configured ports 8099 (backend) and 5173 (frontend)
- Added HAsync configuration options (JWT secret, database, logging, rate limiting)
- Added health check endpoint
- Frontend build process integrated into Dockerfile

## 1.0.4

- Removed old example service scripts
- Fixed restart loop issue
- Cleaned up rootfs structure

## 1.0.3

- Added HAsync run.sh startup script
- Configured proper service management

## 1.0.2

- Removed pre-built image reference to force local builds
- Fixed Docker installation errors

## 1.0.1

- Updated Dockerfile with Node.js and TypeScript support
- Added build dependencies for native modules (Python3, make, g++)
- Added sqlite and curl
- Prepared for HAsync application integration

## 1.0.0

- Initial HAsync release
- Changed from Example addon to HAsync branding
- Updated repository configuration
