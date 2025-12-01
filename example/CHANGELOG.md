# Changelog

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
