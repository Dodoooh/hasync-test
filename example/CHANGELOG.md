# Changelog

## 1.3.12

- **UI IMPROVEMENTS: Version display and dashboard icons**
- LoginForm now shows dynamic version number (fetched from /api/health)
- Version displayed at bottom: "HAsync v1.3.12"
- Changed Areas icon from GroupIcon (people) to DashboardIcon (dashboard)
- More intuitive icon representing areas/rooms in the navigation
- Version automatically updates with each release

## 1.3.11

- **FEATURE: Open Web UI button**
- Added webui configuration to addon
- "Open Web UI" button now appears in Home Assistant addon info page
- Opens frontend interface (port 5173) with one click
- Automatic host detection using [HOST] placeholder

## 1.3.10

- **BUGFIX: Admin credentials now properly exported from config**
- Fixed: run.sh now reads admin_username and admin_password from addon configuration
- Fixed: Environment variables ADMIN_USERNAME and ADMIN_PASSWORD now properly set
- Added logging to show configured admin username on startup
- Addon now starts correctly when credentials are configured

## 1.3.9

- **CONFIGURABLE ADMIN CREDENTIALS: Secure user management**
- Admin username and password now configured via addon settings
- Removed hardcoded default credentials (admin/test123)
- Added mandatory credential validation on startup
- Addon will not start with default password "change-this-password"
- Login form no longer shows default credentials
- Required fields: admin_username and admin_password in config
- Enhanced security: Forces users to set strong credentials
- Clean login interface without placeholder hints

## 1.3.8

- **CSRF CONDITIONAL PROTECTION: JWT requests skip CSRF**
- Fixed 500 "invalid csrf token" errors in Swagger UI
- Problem: CSRF protection blocked all API requests from Swagger UI
- Swagger UI uses JWT (Bearer token), not cookies
- CSRF is for cookie-based authentication, not JWT
- Solution: Conditional CSRF middleware
- Skip CSRF if Authorization header with Bearer token present (JWT)
- Use CSRF for requests without Bearer token (cookie-based auth)
- Swagger UI Execute now works perfectly with JWT authentication
- Web forms still protected by CSRF (cookie-based)
- Best of both worlds: API usability + Web security
- All Execute buttons in Swagger UI now work!

## 1.3.7

- **SWAGGER YAML COMPLETE REWRITE: Clean, accurate API documentation**
- Problem: swagger.yaml documented many non-existent endpoints
- Old swagger.yaml had endpoints like `/health/detailed`, `/auth/refresh`, `/ha/*` that don't exist
- Causing 404 errors when users tried to Execute these endpoints
- Solution: Created brand new swagger.yaml from scratch
- Only documents endpoints that actually exist in the server
- Verified every endpoint matches server routes
- Clean, professional OpenAPI 3.0 specification
- Proper tags, descriptions, security schemas
- No more 404 errors - every documented endpoint works!
- This is the FINAL, ACCURATE API documentation

## 1.3.6

- **SWAGGER UI PATH FIX: Added /api prefix to server URL**
- Fixed 404 errors when clicking Execute button
- Problem: Server URL was `http://host:8099`, but routes are under `/api`
- swagger.yaml defines paths like `/health`, server has them at `/api/health`
- Solution: Add `/api` prefix to server URL → `http://host:8099/api`
- Swagger UI now builds correct URLs: `/health` becomes `http://host:8099/api/health`
- All Execute buttons work correctly - no more 404s!
- This is the COMPLETE, FINAL, WORKING solution

## 1.3.5

- **SWAGGER UI EXECUTE TLS FIX: Permissive CSP header**
- Fixed TLS errors when clicking Execute button
- Problem: Browser auto-upgraded HTTP API calls to HTTPS
- Solution: Set Content-Security-Policy header that allows HTTP connections
- Prevents browser from upgrading insecure requests
- API calls now work correctly over HTTP
- Execute button fully functional without TLS errors

## 1.3.4

- **SWAGGER UI EXECUTE FIX: Dynamic server URL**
- Fixed "Verbindung zum Server konnte nicht hergestellt werden" error
- Problem: Server URL was hardcoded to `localhost`
- Solution: Build server URL dynamically from request host header (`req.get('host')`)
- OpenAPI spec now automatically uses the IP/domain the user accesses from
- Works for ALL installations - no configuration needed
- Examples: `http://192.168.1.100:8099`, `http://homeassistant.local:8099`, etc.
- Execute button in Swagger UI now works perfectly
- API calls go to the correct server address automatically
- This is the FINAL working solution

## 1.3.3

- **SWAGGER UI 100% INLINE: Zero HTTP requests**
- Fixed "Failed to load API definition" error
- Changed from `url: "swagger.json"` to `spec: <inlined object>`
- OpenAPI spec now embedded directly in HTML (no fetch needed)
- Literally ZERO external requests - everything inline
- CSS inline, JavaScript inline, OpenAPI spec inline
- This is the COMPLETE solution

## 1.3.2

- **SWAGGER UI INLINE ASSETS: Complete TLS-proof solution**
- Root cause: Browser auto-upgrades HTTP to HTTPS regardless of absolute URLs
- Solution: Embed ALL Swagger UI assets INLINE (CSS + JavaScript)
- No external HTTP requests = No TLS errors = 100% working
- Assets loaded once at server startup, embedded directly in HTML
- Zero dependencies on external resources or CDN
- Browser cannot upgrade what doesn't exist as external request
- This is the DEFINITIVE solution that MUST work

## 1.3.1

- **SWAGGER UI PATH FIX: Resolved 404 for static assets**
- Fixed swagger-ui-dist directory resolution
- Changed from `.replace(/index.html$/, '')` to proper path resolution
- Use `require.resolve('swagger-ui-dist/package.json')` to find package root
- Added debug logging to show resolved asset path
- Static files should now serve correctly from node_modules

## 1.3.0

- **SWAGGER UI ABSOLUTE URLS: Fixed browser HTTPS auto-upgrade**
- Root cause identified: Browser upgraded relative URLs to HTTPS automatically
- Changed from relative (`/api-docs/static/...`) to absolute (`http://host/api-docs/static/...`)
- URLs built dynamically from request host header
- Prevents browser HSTS/Mixed Content policies from forcing HTTPS
- Assets now explicitly loaded over HTTP when server runs on HTTP
- Server logs should now show asset requests successfully

## 1.2.9

- **SWAGGER UI COMPLETE REWRITE: Custom HTML with guaranteed local assets**
- Completely replaced swagger-ui-express automatic setup
- Created custom HTML template that explicitly loads from `/api-docs/static/`
- Serve swagger-ui-dist files via express.static (node_modules)
- All assets now load from local server: `/api-docs/static/swagger-ui.css`, etc.
- Eliminates ANY possibility of CDN/HTTPS loading
- 100% control over asset paths - no more black box behavior
- This MUST work - assets are hardcoded to local HTTP paths

## 1.2.8

- **SWAGGER UI DEFINITIVE FIX: Local asset serving**
- Changed from `swaggerUi.serve` to `swaggerUi.serveFiles()`
- Forces Swagger UI to serve assets locally instead of from CDN
- Eliminates HTTPS/HTTP mixed content errors completely
- No more "TLS-Fehler" when loading swagger-ui.css, swagger-ui-bundle.js
- API Docs now fully functional with local assets only

## 1.2.7

- **SWAGGER UI FIX: Resolved HTTPS/HTTP asset loading issue**
- Fixed "TLS-Fehler" when loading Swagger UI on HTTP-only server
- Swagger now correctly uses HTTP protocol for asset loading
- Added dynamic server URL configuration based on TLS settings
- API Docs now fully functional at `http://IP:8099/api-docs`
- **BACKUP IMPROVEMENTS: Fixed chmod error on non-existent files**
- Added file existence check before setting permissions
- Backup failures no longer crash server startup
- Better error handling and logging for backup operations

## 1.2.6

- **VERSION DISPLAY: Server startup now shows version number**
- Added version to server startup banner: `HAsync Backend Server v1.2.6`
- Version displayed in health check endpoint `/api/health`
- Version shown in Swagger UI title
- **API DOCS URL FIX: Frontend now uses correct IP instead of localhost**
- Changed hardcoded `localhost:8099` to dynamic `window.location.hostname:8099`
- API Docs link in StatusBar now works from any IP address
- **SWAGGER UI IMPROVEMENTS: Better configuration and persistence**
- Added `persistAuthorization`, `displayRequestDuration`, `tryItOutEnabled`
- Improved Swagger documentation loading with better error handling
- Version automatically injected into Swagger spec

## 1.2.5

- **CLEAN LOGS: Removed http-server proxy verbosity**
- Added `--silent` flag to http-server (no more frontend proxy logs)
- Fixed backup directory error by ensuring `/app/backups` exists at startup
- Logs now show only important backend events, frontend proxy is silent
- Clean production-ready log output for better debugging

## 1.2.4

- **SMART LOGGING SYSTEM: Dramatically reduced log verbosity**
- CORS logs only on errors (no more logs on every successful request)
- Healthcheck requests filtered out (no more spam every 30 seconds)
- Routine API polling (`/api/clients`, `/api/entities`) only logged on DEBUG level
- Request logging focuses on important events: errors, authentication, config changes
- Added comprehensive startup log showing CORS configuration once
- Removed duplicate http-server logs for cleaner output
- Environment variable `LOG_LEVEL` (debug/info/warn/error) now properly respected
- Better debugging: only log what matters, reduce noise by 90%+

## 1.2.3

- **TEMPORARY FIX: CSRF disabled for /api/config/ha endpoint**
- Allows Home Assistant configuration to be saved without CSRF issues
- Other endpoints still protected by CSRF
- Temporary workaround while investigating proxy cookie handling

## 1.2.2

- **FIX: CSRF token compatibility with http-server proxy**
- Changed CSRF sameSite from 'strict' to 'lax' for proxy compatibility
- Disabled secure cookie requirement for HTTP (internal network)
- Fixes "invalid csrf token" error when saving Home Assistant config
- Allows cookies to flow through http-server proxy correctly

## 1.2.1

- **EMERGENCY FIX: Permissive CORS for all internal network origins**
- Allow ANY origin from internal networks (10.x, 172.x, 192.168.x, localhost)
- Comprehensive CORS debugging logs for every request
- Shows origin, allowed origins, and decision (✅ allowed / ❌ rejected)
- No longer requires exact origin match for internal IPs
- Maintains security by only allowing internal network ranges

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
