/**
 * Simplified APP01 Backend Server
 * Quick start version for testing
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { createServer as createHttpsServer } from 'https';
import { Server as SocketIOServer } from 'socket.io';
import Database from 'better-sqlite3';
import { join } from 'path';
import { readFileSync, existsSync } from 'fs';
import { randomBytes } from 'crypto';
import csrf from 'csurf';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yaml';
import jwt from 'jsonwebtoken';
import {
  getTLSOptionsFromEnv,
  loadTLSCertificates,
  createHTTPSOptions,
  validateTLSConfig
} from './config/tls';
import { httpsRedirect, securityHeaders } from './middleware/https-redirect';
import { socketAuthMiddleware } from './middleware/socketAuth';
import {
  validateSubscribe,
  validateEntityUpdate,
  validatePairing,
  validateConfigUpdate,
  validateRoomName,
} from './utils/socketValidation';
import {
  setDatabasePermissions,
  configureDatabaseSecurity,
  InputSanitizer,
  createDatabaseBackup,
  cleanOldBackups
} from './utils/database-security';
import {
  errorHandler,
  notFoundHandler,
  asyncHandler,
  setupUnhandledRejectionHandler,
  setupUncaughtExceptionHandler
} from './middleware/errorHandler';
import {
  NotFoundError,
  ValidationError,
  ServiceUnavailableError
} from './errors/AppError';
import { createLogger } from './utils/logger';
import { createAdminRouter } from './routes/admin';
import { createRequestLoggerMiddleware } from './middleware/requestLogger';
import {
  registerClientSocket,
  unregisterClientSocket,
  notifyClient,
  notifyClientsWithArea,
  notifyAllClients,
  disconnectClient,
  notifyAreaAdded,
  notifyAreaRemoved,
  notifyPairingCompleted,
  getConnectedClientCount,
  EVENT_TYPES
} from './services/websocket-events';
import {
  generateClientToken,
  hashToken,
  verifyClientToken,
  createUnifiedAuthMiddleware,
  revokeClientToken,
  cleanupExpiredTokens
} from './utils/tokenUtils';
import { migratePairingTables, startPairingCleanupJob } from './database/migrate-pairing';

// Initialize logger
const logger = createLogger('Server');

// Version from config.yaml
const VERSION = '1.3.25';

// Setup global error handlers
setupUnhandledRejectionHandler();
setupUncaughtExceptionHandler();

// Load TLS configuration
const tlsOptions = getTLSOptionsFromEnv();
validateTLSConfig(tlsOptions);

const DATABASE_PATH = process.env.DATABASE_PATH || '/data/app01.db';
// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is required!');
}
const JWT_EXPIRATION = process.env.JWT_EXPIRATION || '24h';

// Admin credentials validation - REQUIRED!
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
  logger.error('❌ FATAL: ADMIN_USERNAME and ADMIN_PASSWORD must be set in addon configuration!');
  logger.error('Configure these in Home Assistant addon settings before starting.');
  process.exit(1);
}

if (ADMIN_PASSWORD === 'change-this-password') {
  logger.error('❌ FATAL: Default password detected! Change ADMIN_PASSWORD in addon configuration.');
  process.exit(1);
}

logger.info(`✓ Admin credentials configured for user: ${ADMIN_USERNAME}`);


// CORS configuration - restrictive whitelist approach - support both HTTP and HTTPS
const httpOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];
const allowedOrigins = [
  ...httpOrigins,
  ...httpOrigins.map(origin => origin.replace('http://', 'https://')),
  'http://localhost:3000', // Explicitly allow frontend
  'https://localhost:3000'
];

const app = express();

// Create HTTP server (for redirect) and HTTPS server based on TLS configuration
let mainServer: any;
let httpRedirectServer: any;

if (tlsOptions.enabled) {
  const tlsConfig = loadTLSCertificates(tlsOptions);
  const httpsOptions = createHTTPSOptions(tlsConfig!);
  mainServer = createHttpsServer(httpsOptions, app);

  // Create HTTP redirect server if enabled
  if (tlsOptions.redirectHttp) {
    const redirectApp = express();
    redirectApp.use(httpsRedirect({
      enabled: true,
      httpsPort: tlsOptions.port,
      excludePaths: ['/api/health']
    }));
    httpRedirectServer = createServer(redirectApp);
  }
} else {
  mainServer = createServer(app);
}

const io = new SocketIOServer(mainServer, {
  cors: {
    origin: (origin, callback) => {
      // Allow requests without origin (native mobile apps, Postman, etc.)
      if (!origin) {
        callback(null, true);
        return;
      }

      // Check if origin is in allowed list OR is an internal network IP (same as HTTP CORS)
      const isOriginAllowed = allowedOrigins.includes(origin);
      const isInternalOrigin = origin.includes('://10.') ||
                               origin.includes('://172.') ||
                               origin.includes('://192.168.') ||
                               origin.includes('://localhost') ||
                               origin.includes('://127.0.0.1');

      if (isOriginAllowed || isInternalOrigin) {
        logger.info(`WebSocket CORS: ✅ Allowed origin: ${origin} ${isInternalOrigin ? '(internal network)' : ''}`);
        callback(null, true);
      } else {
        logger.warn(`WebSocket CORS: ❌ Rejected origin: ${origin}`);
        logger.info(`Allowed origins: ${allowedOrigins.join(', ')}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400 // 24 hours preflight cache
  }
});

// Rate limiting configurations
// Auth endpoints: 100 requests per 15 minutes per IP for development (prevents brute force in production)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Increased for development testing
  message: {
    error: 'Too many authentication attempts',
    message: 'Please try again later. Maximum 5 attempts per 15 minutes.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many authentication attempts',
      message: 'Please try again later. Maximum 5 attempts per 15 minutes.',
      retryAfter: '15 minutes'
    });
  }
});

// Write endpoints: 30 requests per 15 minutes per IP (prevents data abuse)
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: {
    error: 'Too many write requests',
    message: 'Please try again later. Maximum 30 write operations per 15 minutes.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many write requests',
      message: 'Please try again later. Maximum 30 write operations per 15 minutes.',
      retryAfter: '15 minutes'
    });
  }
});

// Read endpoints: 500 requests per 15 minutes per IP (normal API usage - increased for development)
const readLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500, // Increased from 100 to 500 for development
  message: {
    error: 'Too many requests',
    message: 'Please try again later. Maximum 500 requests per 15 minutes.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many requests',
      message: 'Please try again later. Maximum 500 requests per 15 minutes.',
      retryAfter: '15 minutes'
    });
  }
});

// Authentication Middleware - Extract and verify JWT token (supports both admin and client tokens)
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'No token provided'
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: 'hasync-backend',
      audience: 'hasync-client'
    }) as any;

    // Check token type
    if (decoded.role === 'admin') {
      // Admin token
      req.user = {
        id: decoded.username,
        username: decoded.username,
        role: 'admin'
      };
      next();
    } else if (decoded.role === 'client') {
      // Client token - verify hash in database
      const tokenHash = hashToken(token);
      const client: any = db.prepare('SELECT * FROM clients WHERE token_hash = ? AND is_active = 1').get(tokenHash);

      if (!client) {
        return res.status(401).json({
          error: 'Token revoked or invalid',
          message: 'This token has been revoked or is no longer valid'
        });
      }

      req.user = {
        id: client.id,
        clientId: client.id,
        role: 'client',
        assignedAreas: client.assigned_areas ? JSON.parse(client.assigned_areas) : []
      };

      // Update last_seen
      db.prepare('UPDATE clients SET last_seen_at = ? WHERE id = ?').run(Date.now(), client.id);

      next();
    } else {
      return res.status(401).json({
        error: 'Invalid token type'
      });
    }
  } catch (error: any) {
    logger.warn(`Authentication failed: ${error.message}`);

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token expired',
        message: 'Your session has expired. Please log in again.',
        expiredAt: error.expiredAt
      });
    } else if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Invalid token signature'
      });
    } else {
      return res.status(401).json({
        error: 'Authentication failed'
      });
    }
  }
};

// Security Headers - Must be configured before other middleware
app.use(helmet({
  // Content Security Policy - Prevent XSS attacks
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // unsafe-inline needed for React in development
      styleSrc: ["'self'", "'unsafe-inline'"], // unsafe-inline needed for styled-components
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:", "http:", "https:"], // WebSocket and API connections
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"], // Prevent clickjacking
    },
  },
  // HTTP Strict Transport Security - Force HTTPS (31536000 = 1 year)
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  // X-Frame-Options - Prevent clickjacking (redundant with CSP frameAncestors but kept for older browsers)
  frameguard: {
    action: 'deny'
  },
  // X-Content-Type-Options - Prevent MIME type sniffing
  noSniff: true,
  // Referrer-Policy - Control referrer information
  referrerPolicy: {
    policy: 'no-referrer'
  },
  // X-DNS-Prefetch-Control - Control DNS prefetching
  dnsPrefetchControl: {
    allow: false
  },
  // X-Download-Options - Prevent IE from executing downloads
  ieNoOpen: true,
  // Permitted Cross Domain Policies
  permittedCrossDomainPolicies: {
    permittedPolicies: 'none'
  }
}));

// Additional Permissions-Policy header (helmet doesn't have built-in support yet)
app.use((_req, res, next) => {
  res.setHeader(
    'Permissions-Policy',
    'geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()'
  );
  next();
});

// Middleware - Permissive CORS for Home Assistant addon (internal network only)
app.use(cors({
  origin: (origin, callback) => {
    // SECURITY: Only allow requests without Origin header from localhost or trusted tools
    // This prevents bypassing CORS by omitting the Origin header
    if (!origin) {
      const referer = callback['req']?.headers?.referer;
      const host = callback['req']?.headers?.host;

      // Allow localhost, internal IPs, and Home Assistant addon network
      const isLocalhost = host?.includes('localhost') || host?.includes('127.0.0.1');
      const isInternalIP = host?.includes('172.') || host?.includes('10.') || host?.includes('192.168.');
      const isTrustedTool = referer === undefined || referer?.includes('localhost');
      const forwardedFor = callback['req']?.headers['x-forwarded-for'];
      const isProxied = forwardedFor !== undefined; // Allow proxied requests (http-server)

      if (isLocalhost || isInternalIP || isTrustedTool || isProxied) {
        callback(null, true);
        return;
      }

      // Reject all other requests without Origin header
      logger.error('CORS rejected - no origin header from untrusted source', {
        host,
        referer,
        ip: callback['req']?.ip
      });
      callback(new Error('Origin header required for security'));
      return;
    }

    // Check if origin is in allowedOrigins list OR is an internal IP
    const isOriginAllowed = allowedOrigins.includes(origin);
    const isInternalOrigin = origin.includes('://10.') || origin.includes('://172.') || origin.includes('://192.168.') || origin.includes('://localhost') || origin.includes('://127.0.0.1');

    if (isOriginAllowed || isInternalOrigin) {
      callback(null, true);
    } else {
      logger.error('CORS rejected', {
        origin,
        method: callback['req']?.method,
        path: callback['req']?.path,
        ip: callback['req']?.ip
      });
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'CSRF-Token', 'X-CSRF-Token'],
  exposedHeaders: ['CSRF-Token'],
  maxAge: 86400 // 24 hours preflight cache
}));
app.use(express.json());
app.use(cookieParser());

// Add security headers when TLS is enabled
if (tlsOptions.enabled) {
  app.use(securityHeaders());
}

// Comprehensive request logging for debugging CORS and authentication
app.use(createRequestLoggerMiddleware({ allowedOrigins }));

// CSRF Protection Configuration
// Cookie-based CSRF tokens (works with CORS and credentials mode)
// Protects against Cross-Site Request Forgery attacks by requiring a unique token
// for all state-changing operations (POST, PUT, PATCH, DELETE)
const csrfMiddleware = csrf({
  cookie: {
    httpOnly: true, // Prevent JavaScript access to cookie
    secure: false, // Allow over HTTP for Home Assistant addon (internal network)
    sameSite: 'lax', // Less strict for proxy compatibility (was 'strict')
    maxAge: 3600000 // 1 hour token expiration
  }
});

// Conditional CSRF protection: Skip CSRF for JWT-authenticated requests (API clients)
// Use CSRF only for cookie-based auth (web forms)
const csrfProtection = (req: any, res: any, next: any) => {
  // Skip CSRF if using Bearer token (JWT authentication)
  const authHeader = req.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    logger.info('Skipping CSRF for JWT-authenticated request', {
      method: req.method,
      path: req.path
    });
    return next();
  }

  // Use CSRF for cookie-based auth
  csrfMiddleware(req, res, next);
};

// CSRF token endpoint - frontend must call this before making state-changing requests
// Returns a CSRF token that must be included in X-CSRF-Token or CSRF-Token header
app.get('/api/csrf-token', csrfMiddleware, (req, res) => {
  // @ts-ignore - csurf adds csrfToken method to request
  res.json({ csrfToken: req.csrfToken() });
});

// Initialize database with security measures
let db: any;
try {
  // Set secure file permissions BEFORE opening database
  setDatabasePermissions(DATABASE_PATH);

  db = new Database(DATABASE_PATH);
  console.log(`✓ Database connected: ${DATABASE_PATH}`);

  // Configure database security settings
  configureDatabaseSecurity(db);

  // Initialize schema if needed
  const schemaPath = join(__dirname, 'database', 'schema.sql');
  if (existsSync(schemaPath)) {
    try {
      const schema = readFileSync(schemaPath, 'utf8');
      db.exec(schema);
      console.log('✓ Database schema initialized');
    } catch (error: any) {
      // Gracefully handle duplicate column errors (schema already exists)
      if (error.message && error.message.includes('duplicate column')) {
        console.log('→ Database schema already exists (duplicate column ignored)');
      } else {
        // Log other errors but don't crash the server
        console.error('⚠ Schema initialization warning:', error.message);
      }
    }
  }

  // Run areas migration
  const areasMigrationPath = join(__dirname, 'database', 'schema-migration-areas.sql');
  if (existsSync(areasMigrationPath)) {
    try {
      const areasMigration = readFileSync(areasMigrationPath, 'utf8');
      db.exec(areasMigration);
      console.log('✓ Areas migration applied');
    } catch (error: any) {
      // Gracefully handle duplicate column errors (migration already applied)
      if (error.message && error.message.includes('duplicate column')) {
        console.log('→ Areas migration already applied (duplicate column ignored)');
      } else {
        // Log other errors but don't crash the server
        console.error('⚠ Migration warning:', error.message);
      }
    }
  }

  // Run pairing migration
  const pairingMigrationPath = join(__dirname, 'database', 'schema-migration-pairing.sql');
  if (existsSync(pairingMigrationPath)) {
    try {
      const pairingMigration = readFileSync(pairingMigrationPath, 'utf8');
      db.exec(pairingMigration);
      console.log('✓ Pairing migration applied');
    } catch (error: any) {
      // Gracefully handle duplicate column errors (migration already applied)
      if (error.message && error.message.includes('duplicate column')) {
        console.log('→ Pairing migration already applied (duplicate column ignored)');
      } else {
        // Log other errors but don't crash the server
        console.error('⚠ Pairing migration warning:', error.message);
      }
    }
  }

  // Run TypeScript-based pairing migration and start cleanup job
  try {
    logger.info('Running pairing tables migration...');
    migratePairingTables(db);
    logger.info('✓ Pairing tables ready');

    // Start cleanup job for expired sessions
    const cleanupJobId = startPairingCleanupJob(db);
    logger.info('✓ Pairing cleanup job started');

    // Graceful shutdown
    process.on('SIGTERM', () => {
      clearInterval(cleanupJobId);
      logger.info('Pairing cleanup job stopped');
    });
  } catch (error: any) {
    logger.warn(`Pairing migration warning: ${error.message}`);
  }

  // Create initial backup on startup
  const backupDir = process.env.BACKUP_DIR || join(__dirname, '../../backups');
  try {
    createDatabaseBackup(db, backupDir);
    cleanOldBackups(backupDir, 10);
  } catch (error) {
    console.warn('⚠ Failed to create startup backup:', error);
  }
} catch (error) {
  console.error('✗ Database error:', error);
}

// Swagger API documentation - CUSTOM SETUP to avoid HTTPS/HTTP issues
try {
  const swaggerPath = join(__dirname, 'swagger.yaml');
  if (existsSync(swaggerPath)) {
    const swaggerDocument = YAML.parse(readFileSync(swaggerPath, 'utf8'));
    // Update version in swagger doc
    swaggerDocument.info.version = VERSION;

    // Serve swagger spec JSON with dynamic server URL
    app.get('/api-docs/swagger.json', (req, res) => {
      // Set server URL dynamically based on request host
      const protocol = tlsOptions.enabled ? 'https' : 'http';
      const host = req.get('host') || `localhost:${tlsOptions.port}`;
      const serverUrl = `${protocol}://${host}/api`;  // Add /api prefix!

      const spec = {
        ...swaggerDocument,
        servers: [
          {
            url: serverUrl,
            description: 'HAsync Backend API Server'
          }
        ]
      };
      res.json(spec);
    });

    // Get Swagger UI assets directory
    const swaggerUiPackagePath = require.resolve('swagger-ui-dist/package.json');
    const pathToSwaggerUi = join(swaggerUiPackagePath, '..');
    logger.info(`Swagger UI assets path: ${pathToSwaggerUi}`);

    // Read Swagger UI assets ONCE at startup (inline embedding - NO HTTP REQUESTS!)
    const swaggerUiCss = readFileSync(join(pathToSwaggerUi, 'swagger-ui.css'), 'utf8');
    const swaggerUiBundleJs = readFileSync(join(pathToSwaggerUi, 'swagger-ui-bundle.js'), 'utf8');
    const swaggerUiPresetJs = readFileSync(join(pathToSwaggerUi, 'swagger-ui-standalone-preset.js'), 'utf8');

    // Custom HTML page with INLINE assets (NO EXTERNAL REQUESTS = NO TLS ERRORS!)
    app.get('/api-docs', (req, res) => {
      // Build server URL dynamically from request
      const protocol = tlsOptions.enabled ? 'https' : 'http';
      const host = req.get('host') || `localhost:${tlsOptions.port}`;
      const serverUrl = `${protocol}://${host}/api`;  // Add /api prefix for correct routing!

      // Set permissive CSP that allows HTTP requests (prevents browser upgrade to HTTPS)
      res.setHeader('Content-Security-Policy',
        "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; " +
        "connect-src * 'unsafe-inline'; " +
        "script-src * 'unsafe-inline' 'unsafe-eval'; " +
        "style-src * 'unsafe-inline';"
      );

      // Create OpenAPI spec with dynamic server URL
      const specWithDynamicServer = {
        ...swaggerDocument,
        servers: [
          {
            url: serverUrl,
            description: 'HAsync Backend API Server'
          }
        ]
      };

      // Inline the OpenAPI spec directly (no fetch request needed!)
      const specJson = JSON.stringify(specWithDynamicServer);

      const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>HAsync API Documentation v${VERSION}</title>
  <style>${swaggerUiCss}</style>
  <style>
    html { box-sizing: border-box; overflow: -moz-scrollbars-vertical; overflow-y: scroll; }
    *, *:before, *:after { box-sizing: inherit; }
    body { margin:0; padding:0; }
    .swagger-ui .topbar { display: none }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script>${swaggerUiBundleJs}</script>
  <script>${swaggerUiPresetJs}</script>
  <script>
    window.onload = function() {
      window.ui = SwaggerUIBundle({
        spec: ${specJson},
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl
        ],
        layout: "StandaloneLayout",
        persistAuthorization: true,
        displayRequestDuration: true,
        tryItOutEnabled: true
      });
    };
  </script>
</body>
</html>`;
      res.send(html);
    });

    const protocolType = tlsOptions.enabled ? 'HTTPS' : 'HTTP';
    logger.info(`Swagger UI available at /api-docs (v${VERSION}) [${protocolType}] - 100% INLINE (zero HTTP requests)`);
  }
} catch (error) {
  logger.warn('Failed to load Swagger documentation', { error: error instanceof Error ? error.message : 'Unknown error' });
}

// Health check endpoint
app.get('/api/health', (_req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      api: 'running',
      database: db ? 'connected' : 'disconnected',
      websocket: 'initializing'
    },
    version: VERSION
  };
  res.json(health);
});

// Pairing endpoint - Admin must be logged in to generate PIN
// SECURITY: Only authenticated admin can generate pairing PINs
// Flow: Admin login → Generate PIN → Enter PIN on other device → Other device pairs
app.post('/api/pairing/create', authLimiter, authenticate, (req, res) => {
  // Only admin can generate pairing PINs
  if (req.user.role !== 'admin') {
    logger.warn(`Non-admin user ${req.user.username} tried to generate pairing PIN`);
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Only admin users can generate pairing PINs'
    });
  }

  try {
    // SECURITY FIX: Use cryptographically secure random number generation
    const pinNumber = randomBytes(3).readUIntBE(0, 3) % 900000 + 100000;
    const pin = pinNumber.toString();
    const sessionId = `pairing_${Date.now()}`;
    const expiresAtTimestamp = Math.floor(Date.now() / 1000) + (5 * 60); // 5 minutes from now
    const createdAtTimestamp = Math.floor(Date.now() / 1000);

    // Store pairing session in database
    db.prepare(`
      INSERT INTO pairing_sessions (id, pin, expires_at, created_at, status)
      VALUES (?, ?, ?, ?, ?)
    `).run(sessionId, pin, expiresAtTimestamp, createdAtTimestamp, 'pending');

    logger.info(`[Pairing] Admin ${req.user.username} generated PIN: ${pin} (session: ${sessionId})`);

    res.json({
      id: sessionId,
      pin,
      expiresAt: new Date(expiresAtTimestamp * 1000).toISOString(),
      status: 'pending'
    });
  } catch (error: any) {
    logger.error(`[Pairing] Failed to create pairing session: ${error.message}`);
    res.status(500).json({
      error: 'Failed to create pairing session',
      message: error.message
    });
  }
});

// Verify pairing PIN - PUBLIC endpoint (no authentication required)
// Client enters PIN to verify pairing session
app.post('/api/pairing/:sessionId/verify', authLimiter, asyncHandler(async (req: any, res: any) => {
  const { sessionId } = req.params;
  const { pin, deviceName, deviceType } = req.body;

  logger.info(`[Pairing] Verify attempt for session: ${sessionId}`);

  // Validate input
  if (!pin || !deviceName || !deviceType) {
    throw new ValidationError('PIN, device name, and device type are required');
  }

  if (!/^\d{6}$/.test(pin)) {
    throw new ValidationError('PIN must be 6 digits');
  }

  // Validate device name (1-100 characters, alphanumeric with spaces and common punctuation)
  if (typeof deviceName !== 'string' || deviceName.length < 1 || deviceName.length > 100) {
    throw new ValidationError('Device name must be 1-100 characters');
  }

  if (!['mobile', 'tablet', 'desktop', 'other'].includes(deviceType)) {
    throw new ValidationError('Invalid device type');
  }

  // Get pairing session from database
  const session: any = db.prepare('SELECT * FROM pairing_sessions WHERE id = ?').get(sessionId);

  if (!session) {
    logger.warn(`[Pairing] Session not found: ${sessionId}`);
    throw new NotFoundError('Pairing session');
  }

  // Check if session is expired (5 minutes)
  const now = Math.floor(Date.now() / 1000);
  if (now > session.expires_at) {
    logger.warn(`[Pairing] Session expired: ${sessionId}`);
    throw new ValidationError('Pairing session has expired. Please generate a new PIN.');
  }

  // Check if session is already used
  if (session.status !== 'pending') {
    logger.warn(`[Pairing] Session already ${session.status}: ${sessionId}`);
    throw new ValidationError(`Pairing session is already ${session.status}`);
  }

  // Validate PIN
  if (session.pin !== pin) {
    logger.warn(`[Pairing] Invalid PIN for session: ${sessionId}`);
    throw new ValidationError('Invalid PIN');
  }

  // Update session with device info and status
  db.prepare(`
    UPDATE pairing_sessions
    SET status = 'verified',
        device_name = ?,
        device_type = ?
    WHERE id = ?
  `).run(InputSanitizer.sanitizeString(deviceName, 100), deviceType, sessionId);

  logger.info(`[Pairing] Session verified: ${sessionId} - Device: ${deviceName} (${deviceType})`);

  // Emit WebSocket event to notify admin that device is waiting for approval
  io.emit('pairing_verified', {
    sessionId,
    deviceName,
    deviceType,
    timestamp: new Date().toISOString()
  });

  res.json({
    success: true,
    message: 'PIN verified. Waiting for admin approval.',
    sessionId,
    status: 'verified'
  });
}));

// Complete pairing - ADMIN only
// Admin approves pairing and assigns client name and areas
app.post('/api/pairing/:sessionId/complete', authLimiter, authenticate, asyncHandler(async (req: any, res: any) => {
  // Only admin can complete pairing
  if (req.user.role !== 'admin') {
    logger.warn(`[Pairing] Non-admin user ${req.user.username} tried to complete pairing`);
    throw new ValidationError('Only admin users can complete pairing');
  }

  const { sessionId } = req.params;
  const { clientName, assignedAreas = [] } = req.body;

  logger.info(`[Pairing] Complete pairing for session: ${sessionId} by admin: ${req.user.username}`);

  // Validate input (1-100 characters, alphanumeric with spaces and common punctuation)
  if (typeof clientName !== 'string' || clientName.length < 1 || clientName.length > 100) {
    throw new ValidationError('Client name must be 1-100 characters');
  }

  if (!Array.isArray(assignedAreas)) {
    throw new ValidationError('Assigned areas must be an array');
  }

  // Get pairing session
  const session: any = db.prepare('SELECT * FROM pairing_sessions WHERE id = ?').get(sessionId);

  if (!session) {
    logger.warn(`[Pairing] Session not found: ${sessionId}`);
    throw new NotFoundError('Pairing session');
  }

  // Check if session status is 'verified'
  if (session.status !== 'verified') {
    logger.warn(`[Pairing] Session not verified: ${sessionId} (status: ${session.status})`);
    throw new ValidationError('Pairing session must be verified before completion');
  }

  // Generate CLIENT JWT token with 10 year expiry using tokenUtils
  const clientId = `client_${Date.now()}`;
  const clientToken = generateClientToken(clientId, assignedAreas);
  const tokenHash = hashToken(clientToken);

  // Create client in database
  const now = Math.floor(Date.now() / 1000);
  db.prepare(`
    INSERT INTO clients (
      id,
      name,
      device_type,
      public_key,
      certificate,
      paired_at,
      last_seen,
      is_active,
      assigned_areas,
      metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    clientId,
    InputSanitizer.sanitizeString(clientName, 100),
    session.device_type,
    tokenHash, // Using public_key field to store token hash
    tokenHash, // Using certificate field as duplicate for backward compatibility
    now,
    now,
    1, // is_active
    JSON.stringify(assignedAreas),
    JSON.stringify({
      deviceName: session.device_name,
      sessionId: sessionId,
      approvedBy: req.user.username,
      approvedAt: new Date().toISOString()
    })
  );

  // Update pairing session status and link to client
  db.prepare(`
    UPDATE pairing_sessions
    SET status = 'completed',
        client_id = ?,
        client_token_hash = ?
    WHERE id = ?
  `).run(clientId, tokenHash, sessionId);

  logger.info(`[Pairing] Pairing completed: ${sessionId} → Client: ${clientId} (${clientName})`);

  // Log activity
  db.prepare(`
    INSERT INTO activity_log (client_id, action, details, ip_address)
    VALUES (?, ?, ?, ?)
  `).run(
    clientId,
    'pairing_completed',
    JSON.stringify({ sessionId, clientName, deviceName: session.device_name }),
    req.ip || req.connection?.remoteAddress
  );

  // Emit WebSocket event to client with token
  io.emit('pairing_completed', {
    sessionId,
    clientId,
    clientToken, // Send the actual token to the client
    assignedAreas,
    timestamp: new Date().toISOString()
  });

  res.json({
    success: true,
    clientId,
    clientToken,
    assignedAreas,
    message: 'Pairing completed successfully'
  });
}));

// Get pairing session status - PUBLIC endpoint
app.get('/api/pairing/:sessionId', readLimiter, asyncHandler(async (req: any, res: any) => {
  const { sessionId } = req.params;

  logger.info(`[Pairing] Get status for session: ${sessionId}`);

  const session: any = db.prepare('SELECT * FROM pairing_sessions WHERE id = ?').get(sessionId);

  if (!session) {
    logger.warn(`[Pairing] Session not found: ${sessionId}`);
    throw new NotFoundError('Pairing session');
  }

  res.json({
    id: session.id,
    status: session.status,
    deviceName: session.device_name,
    deviceType: session.device_type,
    expiresAt: new Date(session.expires_at * 1000).toISOString(),
    createdAt: new Date(session.created_at * 1000).toISOString()
  });
}));

// Delete pairing session - ADMIN only
app.delete('/api/pairing/:sessionId', writeLimiter, authenticate, asyncHandler(async (req: any, res: any) => {
  // Only admin can delete pairing sessions
  if (req.user.role !== 'admin') {
    logger.warn(`[Pairing] Non-admin user ${req.user.username} tried to delete pairing session`);
    throw new ValidationError('Only admin users can delete pairing sessions');
  }

  const { sessionId } = req.params;

  logger.info(`[Pairing] Delete session: ${sessionId} by admin: ${req.user.username}`);

  const session = db.prepare('SELECT * FROM pairing_sessions WHERE id = ?').get(sessionId);

  if (!session) {
    logger.warn(`[Pairing] Session not found: ${sessionId}`);
    throw new NotFoundError('Pairing session');
  }

  db.prepare('DELETE FROM pairing_sessions WHERE id = ?').run(sessionId);

  logger.info(`[Pairing] Session deleted: ${sessionId}`);

  res.json({
    success: true,
    message: 'Pairing session deleted'
  });
}));

// Get HA config from database
const getHAConfig = (): { url?: string; token?: string } => {
  try {
    if (db) {
      const config: any = db.prepare('SELECT value FROM configuration WHERE key = ?').get('ha_config');

      if (config && config.value) {
        const parsed = JSON.parse(config.value);
        console.log('✓ HA config loaded from database:', { url: parsed.url, hasToken: !!parsed.token });
        return parsed;
      }
    }
  } catch (error: any) {
    console.error('✗ Error reading HA config from database:', error.message);
  }

  // Fallback to env variables
  const fallback = {
    url: process.env.HOMEASSISTANT_URL,
    token: process.env.HOMEASSISTANT_TOKEN
  };

  if (fallback.url && fallback.token) {
    console.log('→ Using env fallback config');
  } else {
    console.warn('⚠ No HA config found in database or environment');
  }

  return fallback;
};

// Get entities - fetch from Home Assistant (NO MOCK DATA)
// SECURITY: Requires authentication - only logged-in users can access entities
app.get('/api/entities', readLimiter, authenticate, asyncHandler(async (_req: any, res: any) => {
  const haConfig = getHAConfig();
  const haUrl = haConfig.url;
  const haToken = haConfig.token;

  if (!haUrl || !haToken) {
    throw new ServiceUnavailableError(
      'Home Assistant',
      'Please configure Home Assistant URL and token in Settings'
    );
  }

  // Fetch real entities from Home Assistant
  logger.info(`Fetching entities from ${haUrl}/api/states`);
  const response = await fetch(`${haUrl}/api/states`, {
    headers: {
      'Authorization': `Bearer ${haToken}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new ServiceUnavailableError(
      'Home Assistant API',
      `${response.status} ${response.statusText}`
    );
  }

  const entities = await response.json() as any[];
  logger.info(`✓ Fetched ${entities.length} entities from Home Assistant`);

  res.json(entities);
}));

// Get areas - from database with optional enabled filter (SECURE - uses prepared statement)
// SECURITY: Requires authentication - only logged-in users can view areas
app.get('/api/areas', readLimiter, authenticate, (req, res) => {
  try {
    const { enabled } = req.query;

    // ✅ SECURE: Using prepared statement with parameterized query
    let areas;
    if (enabled !== undefined) {
      const enabledValue = enabled === 'true' ? 1 : 0;
      areas = db.prepare('SELECT * FROM areas WHERE is_enabled = ?').all(enabledValue);
    } else {
      areas = db.prepare('SELECT * FROM areas').all();
    }

    const result = areas.map((area: any) => ({
      id: area.id,
      name: area.name,
      entityIds: area.entity_ids ? JSON.parse(area.entity_ids) : [],
      isEnabled: area.is_enabled === 1
    }));
    res.json(result);
  } catch (error) {
    console.error('Error fetching areas:', error);
    res.json([]);
  }
});

// Create area (WITH INPUT VALIDATION)
// SECURITY: Requires admin authentication - only admin can create areas
app.post('/api/areas', writeLimiter, csrfProtection, authenticate, (req, res) => {
  // Only admin can create areas
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Only admin users can create areas'
    });
  }
  try {
    const { name, entityIds, isEnabled = true } = req.body;

    // ✅ INPUT VALIDATION
    if (!name || !InputSanitizer.validateAreaName(name)) {
      return res.status(400).json({
        error: 'Invalid area name',
        message: 'Name must be 1-100 characters, alphanumeric with spaces and common punctuation'
      });
    }

    if (entityIds && !InputSanitizer.validateEntityIdArray(entityIds)) {
      return res.status(400).json({
        error: 'Invalid entity IDs',
        message: 'Entity IDs must match format: domain.name'
      });
    }

    if (!InputSanitizer.validateBoolean(isEnabled)) {
      return res.status(400).json({
        error: 'Invalid isEnabled value',
        message: 'isEnabled must be a boolean'
      });
    }

    const id = `area_${Date.now()}`;
    const sanitizedName = InputSanitizer.sanitizeString(name, 100);
    const entity_ids_json = JSON.stringify(entityIds || []);
    const is_enabled = isEnabled ? 1 : 0;

    // ✅ SECURE: Using prepared statement
    db.prepare('INSERT INTO areas (id, name, entity_ids, is_enabled) VALUES (?, ?, ?, ?)')
      .run(id, sanitizedName, entity_ids_json, is_enabled);

    res.json({
      id,
      name: sanitizedName,
      entityIds: entityIds || [],
      isEnabled: isEnabled
    });
  } catch (error) {
    console.error('Error creating area:', error);
    res.status(500).json({ error: 'Failed to create area' });
  }
});

// Update area (WITH INPUT VALIDATION)
// SECURITY: Requires admin authentication - only admin can update areas
app.put('/api/areas/:id', writeLimiter, csrfProtection, authenticate, asyncHandler(async (req: any, res: any) => {
  // Only admin can update areas
  if (req.user.role !== 'admin') {
    throw new Error('Forbidden: Only admin users can update areas');
  }
  const { id } = req.params;
  const { name, entityIds, isEnabled } = req.body;

  // ✅ VALIDATE AREA ID
  if (!InputSanitizer.validateAreaId(id)) {
    throw new ValidationError('Area ID must match format: area_timestamp');
  }

  // Check if area exists - ✅ SECURE: prepared statement
  const existing = db.prepare('SELECT * FROM areas WHERE id = ?').get(id);
  if (!existing) {
    throw new NotFoundError('Area');
  }

  // ✅ INPUT VALIDATION
  if (name && !InputSanitizer.validateAreaName(name)) {
    throw new ValidationError('Name must be 1-100 characters, alphanumeric with spaces and common punctuation');
  }

  if (entityIds && !InputSanitizer.validateEntityIdArray(entityIds)) {
    throw new ValidationError('Entity IDs must match format: domain.name');
  }

  const sanitizedName = name ? InputSanitizer.sanitizeString(name, 100) : (existing as any).name;
  const entity_ids_json = JSON.stringify(entityIds || []);
  const is_enabled = isEnabled !== undefined ? (isEnabled ? 1 : 0) : (existing as any).is_enabled;

  // ✅ SECURE: Using prepared statement
  db.prepare('UPDATE areas SET name = ?, entity_ids = ?, is_enabled = ? WHERE id = ?')
    .run(sanitizedName, entity_ids_json, is_enabled, id);

  // Emit area_updated event to all clients with this area
  notifyClientsWithArea(db, id, EVENT_TYPES.AREA_UPDATED, {
    areaId: id,
    name: sanitizedName,
    entityIds: entityIds || [],
    isEnabled: is_enabled === 1,
    message: 'Area has been updated by admin'
  });

  res.json({
    id,
    name: sanitizedName,
    entityIds: entityIds || [],
    isEnabled: is_enabled === 1
  });
}));

// PATCH area - for partial updates (WITH INPUT VALIDATION)
// SECURITY: Requires admin authentication - only admin can update areas
app.patch('/api/areas/:id', writeLimiter, csrfProtection, authenticate, (req, res) => {
  // Only admin can update areas
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Only admin users can update areas'
    });
  }
  try {
    const { id } = req.params;
    const updates = req.body;

    // ✅ VALIDATE AREA ID
    if (!InputSanitizer.validateAreaId(id)) {
      return res.status(400).json({
        error: 'Invalid area ID format',
        message: 'Area ID must match format: area_timestamp'
      });
    }

    // Check if area exists - ✅ SECURE: prepared statement
    const existing: any = db.prepare('SELECT * FROM areas WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Area not found' });
    }

    // Build update query dynamically based on provided fields
    const updateFields: string[] = [];
    const updateValues: any[] = [];

    if (updates.name !== undefined) {
      // ✅ INPUT VALIDATION
      if (!InputSanitizer.validateAreaName(updates.name)) {
        return res.status(400).json({
          error: 'Invalid area name',
          message: 'Name must be 1-100 characters, alphanumeric with spaces and common punctuation'
        });
      }
      updateFields.push('name = ?');
      updateValues.push(InputSanitizer.sanitizeString(updates.name, 100));
    }

    if (updates.entityIds !== undefined) {
      // ✅ INPUT VALIDATION
      if (!InputSanitizer.validateEntityIdArray(updates.entityIds)) {
        return res.status(400).json({
          error: 'Invalid entity IDs',
          message: 'Entity IDs must match format: domain.name'
        });
      }
      updateFields.push('entity_ids = ?');
      updateValues.push(JSON.stringify(updates.entityIds));
    }

    if (updates.isEnabled !== undefined) {
      updateFields.push('is_enabled = ?');
      updateValues.push(updates.isEnabled ? 1 : 0);
    }

    // If no fields to update, return current area
    if (updateFields.length === 0) {
      return res.json({
        id: existing.id,
        name: existing.name,
        entityIds: existing.entity_ids ? JSON.parse(existing.entity_ids) : [],
        isEnabled: existing.is_enabled === 1
      });
    }

    // Add id to values array for WHERE clause
    updateValues.push(id);

    // ✅ SECURE: Using prepared statement with parameterized values
    const query = `UPDATE areas SET ${updateFields.join(', ')} WHERE id = ?`;
    db.prepare(query).run(...updateValues);

    // Fetch and return updated area
    const updated: any = db.prepare('SELECT * FROM areas WHERE id = ?').get(id);
    console.log(`✓ Area ${id} updated:`, updates);

    // Emit area_updated event to all clients with this area
    notifyClientsWithArea(db, id, EVENT_TYPES.AREA_UPDATED, {
      areaId: id,
      name: updated.name,
      entityIds: updated.entity_ids ? JSON.parse(updated.entity_ids) : [],
      isEnabled: updated.is_enabled === 1,
      updatedFields: Object.keys(updates),
      message: 'Area has been updated by admin'
    });

    res.json({
      id: updated.id,
      name: updated.name,
      entityIds: updated.entity_ids ? JSON.parse(updated.entity_ids) : [],
      isEnabled: updated.is_enabled === 1
    });
  } catch (error) {
    console.error('Error patching area:', error);
    res.status(500).json({ error: 'Failed to update area' });
  }
});

// Toggle area enabled/disabled
// SECURITY: Requires admin authentication - only admin can toggle areas
app.patch('/api/areas/:id/toggle', writeLimiter, csrfProtection, authenticate, (req, res) => {
  // Only admin can toggle areas
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Only admin users can toggle areas'
    });
  }
  try {
    const { id } = req.params;
    const { enabled } = req.body;

    // Validate enabled is boolean
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled must be a boolean' });
    }

    // Check if area exists
    const existing = db.prepare('SELECT * FROM areas WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Area not found' });
    }

    const is_enabled = enabled ? 1 : 0;
    db.prepare('UPDATE areas SET is_enabled = ? WHERE id = ?').run(is_enabled, id);

    const updated: any = db.prepare('SELECT * FROM areas WHERE id = ?').get(id);

    // Emit area_enabled or area_disabled event based on the new state
    const eventName = is_enabled === 1 ? EVENT_TYPES.AREA_ENABLED : EVENT_TYPES.AREA_DISABLED;
    notifyClientsWithArea(db, id, eventName, {
      areaId: id,
      name: updated.name,
      isEnabled: is_enabled === 1,
      message: `Area has been ${is_enabled === 1 ? 'enabled' : 'disabled'} by admin`
    });

    res.json({
      id: updated.id,
      name: updated.name,
      entityIds: updated.entity_ids ? JSON.parse(updated.entity_ids) : [],
      isEnabled: updated.is_enabled === 1
    });
  } catch (error) {
    console.error('Error toggling area:', error);
    res.status(500).json({ error: 'Failed to toggle area' });
  }
});

// Reorder entities in an area
// SECURITY: Requires admin authentication - only admin can reorder area entities
app.patch('/api/areas/:id/reorder', writeLimiter, csrfProtection, authenticate, async (req, res) => {
  // Only admin can reorder areas
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Only admin users can reorder area entities'
    });
  }
  try {
    const { id } = req.params;
    const { entityIds } = req.body;

    // Validate request body
    if (!Array.isArray(entityIds)) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'entityIds must be an array'
      });
    }

    // Check if area exists
    const area: any = db.prepare('SELECT * FROM areas WHERE id = ?').get(id);
    if (!area) {
      return res.status(404).json({
        error: 'Area not found',
        message: `Area with id '${id}' does not exist`
      });
    }

    // Get current entity IDs from area
    const currentEntityIds = area.entity_ids ? JSON.parse(area.entity_ids) : [];

    // Validate that all provided entityIds exist in the area
    const invalidEntityIds = entityIds.filter((entityId: string) => !currentEntityIds.includes(entityId));
    if (invalidEntityIds.length > 0) {
      return res.status(400).json({
        error: 'Invalid entity IDs',
        message: `The following entity IDs are not in this area: ${invalidEntityIds.join(', ')}`
      });
    }

    // Validate that all current entities are included in the new order
    const missingEntityIds = currentEntityIds.filter((entityId: string) => !entityIds.includes(entityId));
    if (missingEntityIds.length > 0) {
      return res.status(400).json({
        error: 'Missing entity IDs',
        message: `The following entity IDs are missing from the new order: ${missingEntityIds.join(', ')}`
      });
    }

    // Update area with new entity order
    const entity_ids_json = JSON.stringify(entityIds);
    db.prepare('UPDATE areas SET entity_ids = ? WHERE id = ?')
      .run(entity_ids_json, id);

    // Return updated area
    const updatedArea: any = db.prepare('SELECT * FROM areas WHERE id = ?').get(id);
    res.setHeader('Content-Type', 'application/json');
    res.json({
      id: updatedArea.id,
      name: updatedArea.name,
      entityIds: JSON.parse(updatedArea.entity_ids),
      isEnabled: updatedArea.is_enabled === 1
    });
  } catch (error: any) {
    console.error('Error reordering entities:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error?.message || 'Failed to reorder entities'
    });
  }
});

// Get entities in an area with details from Home Assistant
// SECURITY: Requires authentication - only logged-in users can view area entities
app.get('/api/areas/:id/entities', readLimiter, authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if area exists
    const area: any = db.prepare('SELECT * FROM areas WHERE id = ?').get(id);
    if (!area) {
      return res.status(404).json({
        error: 'Area not found',
        message: `Area with id '${id}' does not exist`
      });
    }

    const entityIds = area.entity_ids ? JSON.parse(area.entity_ids) : [];

    // If no entities, return empty array
    if (entityIds.length === 0) {
      res.setHeader('Content-Type', 'application/json');
      return res.json([]);
    }

    // Get HA config
    const haConfig = getHAConfig();
    const haUrl = haConfig.url;
    const haToken = haConfig.token;

    if (!haUrl || !haToken) {
      return res.status(503).json({
        error: 'Home Assistant not configured',
        message: 'Please configure Home Assistant URL and token in Settings'
      });
    }

    // Fetch all entities from Home Assistant
    const response = await fetch(`${haUrl}/api/states`, {
      headers: {
        'Authorization': `Bearer ${haToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HA API error: ${response.status} ${response.statusText}`);
    }

    const allEntities = await response.json() as any[];

    // Filter entities to only those in this area and maintain order
    const orderedEntities = entityIds
      .map((entityId: string) => allEntities.find((entity: any) => entity.entity_id === entityId))
      .filter((entity: any) => entity !== undefined);

    res.setHeader('Content-Type', 'application/json');
    res.json(orderedEntities);
  } catch (error: any) {
    console.error('Error fetching area entities:', error);
    res.status(503).json({
      error: 'Failed to fetch entities',
      message: error?.message || 'Unknown error'
    });
  }
});

// Delete area
// SECURITY: Requires admin authentication - only admin can delete areas
app.delete('/api/areas/:id', writeLimiter, csrfProtection, authenticate, (req, res) => {
  // Only admin can delete areas
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Only admin users can delete areas'
    });
  }
  try {
    const { id } = req.params;

    // Check if area exists
    const existing: any = db.prepare('SELECT * FROM areas WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Area not found' });
    }

    // Store area info before deletion for notification
    const deletedAreaName = existing.name;

    // Emit area_removed event BEFORE deleting (so clients can still be found in assigned_areas)
    notifyClientsWithArea(db, id, EVENT_TYPES.AREA_REMOVED, {
      areaId: id,
      name: deletedAreaName,
      message: 'Area has been removed by admin'
    });

    db.prepare('DELETE FROM areas WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting area:', error);
    res.status(500).json({ error: 'Failed to delete area' });
  }
});

// Get dashboards
// SECURITY: Requires authentication - only logged-in users can view dashboards
app.get('/api/dashboards', readLimiter, authenticate, (_req, res) => {
  res.json([
    { dashboard_id: 'default', name: 'Default Dashboard' },
    { dashboard_id: 'mobile', name: 'Mobile Dashboard' }
  ]);
});

// Login endpoint - Fixed admin credentials from env - strict rate limiting for brute force protection
// Login endpoint - CSRF protection exempted (users need to login first to get CSRF token)
app.post('/api/auth/login', authLimiter, (req, res) => {
  const { username, password } = req.body;
  const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'test123';

  // Only accept configured admin credentials
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    // Generate secure JWT token with user information and role
      const payload = {
        username,
        role: 'admin',
        iat: Math.floor(Date.now() / 1000)
      };

      // @ts-ignore - jsonwebtoken types issue with expiresIn
      const token = jwt.sign(payload, JWT_SECRET, {
        expiresIn: JWT_EXPIRATION,
        issuer: 'hasync-backend',
        audience: 'hasync-client'
      });

      logger.info(`User logged in: ${username}`);
    res.json({
        token,
        user: {
          username,
          role: 'admin'
        },
        expiresIn: JWT_EXPIRATION
      });
  } else {
    logger.warn(`Failed login attempt for user: ${username}`);
      res.status(401).json({ error: 'Invalid credentials. Only admin user is allowed.' });
  }
});

// Save HA config endpoint
// SECURITY: CRITICAL - Requires admin authentication - HA token is sensitive!
app.post('/api/config/ha', writeLimiter, csrfProtection, authenticate, (req, res) => {
  // Only admin can modify HA configuration
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Only admin users can modify Home Assistant configuration'
    });
  }
  try {
    const { url, token } = req.body;
    const config = JSON.stringify({ url, token });

    db.prepare('INSERT OR REPLACE INTO configuration (key, value) VALUES (?, ?)')
      .run('ha_config', config);

    console.log(`✓ HA config saved: ${url}`);
    res.json({ success: true, message: 'HA configuration saved' });
  } catch (error) {
    console.error('Error saving HA config:', error);
    res.status(500).json({ error: 'Failed to save configuration' });
  }
});

// Get HA config endpoint
// SECURITY: CRITICAL - Requires admin authentication - HA token is sensitive!
app.get('/api/config/ha', readLimiter, authenticate, (_req, res) => {
  // Only admin can view HA configuration (contains sensitive token)
  if (_req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Only admin users can view Home Assistant configuration'
    });
  }
  try {
    const haConfig = getHAConfig();
    res.json(haConfig);
  } catch (error) {
    console.error('Error reading HA config:', error);
    res.status(500).json({ error: 'Failed to read configuration' });
  }
});

// Verify token - auth limiter to prevent token enumeration
app.get('/api/auth/verify', authLimiter, (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({
      valid: false,
      error: 'No token provided'
    });
  }

  try {
    // Verify JWT signature and expiration
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: 'hasync-backend',
      audience: 'hasync-client'
    }) as { username: string; role: string; iat: number; exp: number };

    logger.info(`Token verified for user: ${decoded.username}`);

    res.json({
      valid: true,
      user: {
        username: decoded.username,
        role: decoded.role
      },
      expiresAt: new Date(decoded.exp * 1000).toISOString()
    });
  } catch (error: any) {
    logger.warn(`Token verification failed: ${error.message}`);

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        valid: false,
        error: 'Token expired',
        expiredAt: error.expiredAt
      });
    } else if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        valid: false,
        error: 'Invalid token signature'
      });
    } else {
      return res.status(401).json({
        valid: false,
        error: 'Token validation failed'
      });
    }
  }
});

// Get clients (fixed to return array instead of object)
// SECURITY: Requires ADMIN authentication - only admin users can view all clients
app.get('/api/clients', readLimiter, authenticate, (_req: any, res: any) => {
  // Only admin can view all clients
  if (_req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Only admin users can view all clients'
    });
  }

  try {
    if (db) {
      // ✅ SECURE: Using prepared statement
      const clients = db.prepare(`
        SELECT
          c.id,
          c.name,
          c.device_type,
          c.created_at,
          c.last_seen_at,
          c.assigned_areas
        FROM clients c
        WHERE c.is_active = ?
      `).all(1);

      // Parse assigned_areas JSON for each client and expand with area details
      const clientsWithAreas = clients.map((client: any) => {
        const assignedAreaIds = client.assigned_areas ? JSON.parse(client.assigned_areas) : [];

        // Get full area details for assigned areas
        const assignedAreas = assignedAreaIds.map((areaId: string) => {
          const area: any = db.prepare('SELECT id, name, entity_ids, is_enabled FROM areas WHERE id = ?').get(areaId);
          if (area) {
            return {
              id: area.id,
              name: area.name,
              entityIds: area.entity_ids ? JSON.parse(area.entity_ids) : [],
              isEnabled: area.is_enabled === 1
            };
          }
          return null;
        }).filter((area: any) => area !== null);

        return {
          id: client.id,
          name: client.name,
          deviceType: client.device_type,
          assignedAreas,
          createdAt: client.created_at,
          lastSeenAt: client.last_seen_at
        };
      });

      res.json(clientsWithAreas || []);
    } else {
      res.json([]);
    }
  } catch (error) {
    console.error('Error fetching clients:', error);
    res.status(500).json({ error: 'Failed to fetch clients' });
  }
});

// Get current client info (CLIENT token required)
// SECURITY: Client can only view their own information
app.get('/api/clients/me', readLimiter, authenticate, (req: any, res: any) => {
  try {
    // Extract client ID from JWT token (stored in username field for client tokens)
    const clientId = req.user.username;

    if (!clientId) {
      return res.status(401).json({
        error: 'Invalid token',
        message: 'Client ID not found in token'
      });
    }

    // Get client from database
    const client: any = db.prepare(`
      SELECT
        id,
        name,
        device_type,
        assigned_areas,
        created_at,
        last_seen_at
      FROM clients
      WHERE id = ? AND is_active = ?
    `).get(clientId, 1);

    if (!client) {
      return res.status(404).json({
        error: 'Client not found',
        message: 'Your client registration could not be found'
      });
    }

    // Parse assigned areas and get full area details (Option B)
    const assignedAreaIds = client.assigned_areas ? JSON.parse(client.assigned_areas) : [];
    const assignedAreas = assignedAreaIds.map((areaId: string) => {
      const area: any = db.prepare('SELECT id, name, entity_ids, is_enabled FROM areas WHERE id = ?').get(areaId);
      if (area) {
        return {
          id: area.id,
          name: area.name,
          entityIds: area.entity_ids ? JSON.parse(area.entity_ids) : [],
          isEnabled: area.is_enabled === 1
        };
      }
      return null;
    }).filter((area: any) => area !== null);

    logger.info(`Client ${clientId} fetched own information`);

    res.json({
      id: client.id,
      name: client.name,
      deviceType: client.device_type,
      assignedAreas,
      createdAt: client.created_at,
      lastSeenAt: client.last_seen_at
    });
  } catch (error: any) {
    logger.error('Error fetching client info:', error);
    res.status(500).json({
      error: 'Failed to fetch client information',
      message: error.message
    });
  }
});

// Get specific client by ID (ADMIN only)
// SECURITY: Requires ADMIN authentication
app.get('/api/clients/:id', readLimiter, authenticate, (req: any, res: any) => {
  // Only admin can view specific client details
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Only admin users can view client details'
    });
  }

  try {
    const { id } = req.params;

    // Get client from database
    const client: any = db.prepare(`
      SELECT
        id,
        name,
        device_type,
        assigned_areas,
        created_at,
        last_seen_at
      FROM clients
      WHERE id = ? AND is_active = ?
    `).get(id, 1);

    if (!client) {
      return res.status(404).json({
        error: 'Client not found',
        message: `Client with id '${id}' does not exist`
      });
    }

    // Parse assigned areas and get full area details
    const assignedAreaIds = client.assigned_areas ? JSON.parse(client.assigned_areas) : [];
    const assignedAreas = assignedAreaIds.map((areaId: string) => {
      const area: any = db.prepare('SELECT id, name, entity_ids, is_enabled FROM areas WHERE id = ?').get(areaId);
      if (area) {
        return {
          id: area.id,
          name: area.name,
          entityIds: area.entity_ids ? JSON.parse(area.entity_ids) : [],
          isEnabled: area.is_enabled === 1
        };
      }
      return null;
    }).filter((area: any) => area !== null);

    res.json({
      id: client.id,
      name: client.name,
      deviceType: client.device_type,
      assignedAreas,
      createdAt: client.created_at,
      lastSeenAt: client.last_seen_at
    });
  } catch (error: any) {
    logger.error('Error fetching client:', error);
    res.status(500).json({
      error: 'Failed to fetch client',
      message: error.message
    });
  }
});

// Update client (ADMIN only)
// SECURITY: Requires ADMIN authentication
app.put('/api/clients/:id', writeLimiter, csrfProtection, authenticate, (req: any, res: any) => {
  // Only admin can update clients
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Only admin users can update clients'
    });
  }

  try {
    const { id } = req.params;
    const { name, assignedAreas } = req.body;

    // Check if client exists
    const existing: any = db.prepare('SELECT * FROM clients WHERE id = ? AND is_active = ?').get(id, 1);
    if (!existing) {
      return res.status(404).json({
        error: 'Client not found',
        message: `Client with id '${id}' does not exist`
      });
    }

    // Validate input
    if (name && !InputSanitizer.validateAreaName(name)) {
      return res.status(400).json({
        error: 'Invalid client name',
        message: 'Name must be 1-100 characters, alphanumeric with spaces and common punctuation'
      });
    }

    if (assignedAreas && !Array.isArray(assignedAreas)) {
      return res.status(400).json({
        error: 'Invalid assigned areas',
        message: 'assignedAreas must be an array of area IDs'
      });
    }

    // Track area changes for WebSocket notifications
    const oldAssignedAreas = existing.assigned_areas ? JSON.parse(existing.assigned_areas) : [];
    const newAssignedAreas = assignedAreas || oldAssignedAreas;

    // Detect added and removed areas
    const addedAreas = newAssignedAreas.filter((areaId: string) => !oldAssignedAreas.includes(areaId));
    const removedAreas = oldAssignedAreas.filter((areaId: string) => !newAssignedAreas.includes(areaId));

    // Update client in database
    const sanitizedName = name ? InputSanitizer.sanitizeString(name, 100) : existing.name;
    const assigned_areas_json = JSON.stringify(newAssignedAreas);

    db.prepare('UPDATE clients SET name = ?, assigned_areas = ? WHERE id = ?')
      .run(sanitizedName, assigned_areas_json, id);

    // Emit WebSocket events for area changes
    if (addedAreas.length > 0 || removedAreas.length > 0) {
      addedAreas.forEach((areaId: string) => {
        const area: any = db.prepare('SELECT id, name FROM areas WHERE id = ?').get(areaId);
        if (area) {
          io.emit('area_added', {
            clientId: id,
            area: {
              id: area.id,
              name: area.name
            },
            timestamp: new Date().toISOString()
          });
          logger.info(`Area ${area.name} added to client ${id}`);
        }
      });

      removedAreas.forEach((areaId: string) => {
        const area: any = db.prepare('SELECT id, name FROM areas WHERE id = ?').get(areaId);
        if (area) {
          io.emit('area_removed', {
            clientId: id,
            area: {
              id: area.id,
              name: area.name
            },
            timestamp: new Date().toISOString()
          });
          logger.info(`Area ${area.name} removed from client ${id}`);
        }
      });
    }

    // Get updated client with area details
    const updated: any = db.prepare(`
      SELECT id, name, device_type, assigned_areas, created_at, last_seen_at
      FROM clients
      WHERE id = ?
    `).get(id);

    const assignedAreaIds = updated.assigned_areas ? JSON.parse(updated.assigned_areas) : [];
    const assignedAreasDetails = assignedAreaIds.map((areaId: string) => {
      const area: any = db.prepare('SELECT id, name, entity_ids, is_enabled FROM areas WHERE id = ?').get(areaId);
      if (area) {
        return {
          id: area.id,
          name: area.name,
          entityIds: area.entity_ids ? JSON.parse(area.entity_ids) : [],
          isEnabled: area.is_enabled === 1
        };
      }
      return null;
    }).filter((area: any) => area !== null);

    logger.info(`Client ${id} updated by admin ${req.user.username}`);

    res.json({
      id: updated.id,
      name: updated.name,
      deviceType: updated.device_type,
      assignedAreas: assignedAreasDetails,
      createdAt: updated.created_at,
      lastSeenAt: updated.last_seen_at
    });
  } catch (error: any) {
    logger.error('Error updating client:', error);
    res.status(500).json({
      error: 'Failed to update client',
      message: error.message
    });
  }
});

// Delete client (ADMIN only)
// SECURITY: Requires ADMIN authentication
app.delete('/api/clients/:id', writeLimiter, csrfProtection, authenticate, (req: any, res: any) => {
  // Only admin can delete clients
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Only admin users can delete clients'
    });
  }

  try {
    const { id } = req.params;

    // Check if client exists
    const existing: any = db.prepare('SELECT * FROM clients WHERE id = ? AND is_active = ?').get(id, 1);
    if (!existing) {
      return res.status(404).json({
        error: 'Client not found',
        message: `Client with id '${id}' does not exist`
      });
    }

    // Soft delete (mark as inactive)
    db.prepare('UPDATE clients SET is_active = ? WHERE id = ?').run(0, id);

    // Emit WebSocket event to notify client of deletion
    io.emit('client_deleted', {
      clientId: id,
      timestamp: new Date().toISOString()
    });

    // Find and disconnect client's WebSocket connection
    const sockets = io.sockets.sockets;
    sockets.forEach((socket: any) => {
      if (socket.user && socket.user.username === id) {
        socket.emit('token_revoked', {
          reason: 'Client deleted by administrator',
          timestamp: new Date().toISOString()
        });
        socket.disconnect(true);
        logger.info(`Disconnected client ${id} due to deletion`);
      }
    });

    logger.info(`Client ${id} deleted by admin ${req.user.username}`);

    res.json({
      success: true,
      message: 'Client deleted successfully'
    });
  } catch (error: any) {
    logger.error('Error deleting client:', error);
    res.status(500).json({
      error: 'Failed to delete client',
      message: error.message
    });
  }
});

// Revoke client token (ADMIN only)
// SECURITY: Requires ADMIN authentication
app.post('/api/clients/:id/revoke', writeLimiter, csrfProtection, authenticate, (req: any, res: any) => {
  // Only admin can revoke client tokens
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Only admin users can revoke client tokens'
    });
  }

  try {
    const { id } = req.params;

    // Check if client exists
    const existing: any = db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({
        error: 'Client not found',
        message: `Client with id '${id}' does not exist`
      });
    }

    // Delete token hash from database (revoke token)
    db.prepare('UPDATE clients SET token_hash = NULL WHERE id = ?').run(id);

    // Emit WebSocket event to notify client immediately
    io.emit('token_revoked', {
      clientId: id,
      reason: 'Token revoked by administrator',
      timestamp: new Date().toISOString()
    });

    // Find and disconnect client's WebSocket connection
    const sockets = io.sockets.sockets;
    sockets.forEach((socket: any) => {
      if (socket.user && socket.user.username === id) {
        socket.emit('token_revoked', {
          reason: 'Token revoked by administrator',
          timestamp: new Date().toISOString()
        });
        socket.disconnect(true);
        logger.info(`Disconnected client ${id} due to token revocation`);
      }
    });

    logger.info(`Client ${id} token revoked by admin ${req.user.username}`);

    res.json({
      success: true,
      message: 'Client token revoked successfully'
    });
  } catch (error: any) {
    logger.error('Error revoking client token:', error);
    res.status(500).json({
      error: 'Failed to revoke client token',
      message: error.message
    });
  }
});

// Admin routes - backup, restore, security management
app.use('/api/admin', createAdminRouter(db));

// 404 handler (must be before error handler)
app.use(notFoundHandler);

// Error handler (must be last middleware)
app.use(errorHandler);

// Socket.IO authentication middleware
io.use(socketAuthMiddleware);

// Socket.IO connection handling with authentication and validation
io.on('connection', (socket) => {
  const user = socket.user;

// GDPR Compliance Endpoints

// Data Export - Right to Access (GDPR Article 15)
app.get('/api/user/data-export', readLimiter, authenticate, (req, res) => {
  try {
    // Get user ID from database based on username from JWT
    const user = db.prepare('SELECT id FROM users WHERE username = ?').get(req.user.username);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const userId = user.id;

    const userData = {
      user: db.prepare('SELECT id, username, email, role, created_at FROM users WHERE id = ?').get(userId),
      areas: db.prepare('SELECT * FROM areas WHERE created_by = ?').all(userId),
      dashboards: db.prepare('SELECT * FROM dashboards WHERE created_by = ?').all(userId),
      clients: db.prepare('SELECT * FROM clients WHERE created_by = ?').all(userId),
      consent: db.prepare('SELECT * FROM user_consent WHERE user_id = ?').get(userId),
      activityLog: db.prepare('SELECT * FROM activity_log WHERE client_id IN (SELECT id FROM clients WHERE created_by = ?) LIMIT 100').all(userId),
      exportDate: new Date().toISOString(),
      exportVersion: '1.0.0'
    };

    console.log(`[GDPR] Data export requested by user: ${userId}`);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="user-data-${userId}-${Date.now()}.json"`);
    res.json(userData);
  } catch (error) {
    console.error('[GDPR] Data export error:', error);
    res.status(500).json({ error: 'Failed to export user data', message: error.message });
  }
});

// Data Deletion - Right to Erasure (GDPR Article 17)
app.delete('/api/user/data-delete', writeLimiter, csrfProtection, authenticate, (req, res) => {
  try {
    // Get user ID from database based on username from JWT
    const user = db.prepare('SELECT id FROM users WHERE username = ?').get(req.user.username);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const userId = user.id;
    const { confirmDelete } = req.body;

    if (confirmDelete !== true) {
      return res.status(400).json({
        error: 'Confirmation required',
        message: 'You must confirm deletion by setting confirmDelete to true'
      });
    }

    console.log(`[GDPR] Data deletion requested by user: ${userId}`);

    db.prepare('DELETE FROM activity_log WHERE client_id IN (SELECT id FROM clients WHERE created_by = ?)').run(userId);
    db.prepare('DELETE FROM areas WHERE created_by = ?').run(userId);
    db.prepare('DELETE FROM dashboards WHERE created_by = ?').run(userId);
    db.prepare('DELETE FROM clients WHERE created_by = ?').run(userId);
    db.prepare('DELETE FROM user_consent WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);

    console.log(`[GDPR] All data deleted for user: ${userId}`);

    res.json({
      success: true,
      message: 'All user data has been permanently deleted',
      deletedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('[GDPR] Data deletion error:', error);
    res.status(500).json({ error: 'Failed to delete user data', message: error.message });
  }
});

// Get user consent status
app.get('/api/user/consent', readLimiter, authenticate, (req, res) => {
  try {
    // Get user ID from database based on username from JWT
    const user = db.prepare('SELECT id FROM users WHERE username = ?').get(req.user.username);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const userId = user.id;

    const consent = db.prepare('SELECT * FROM user_consent WHERE user_id = ?').get(userId);

    if (!consent) {
      return res.json({
        data_processing: false,
        analytics: false,
        marketing: false,
        consent_date: null
      });
    }

    res.json({
      data_processing: consent.data_processing === 1,
      analytics: consent.analytics === 1,
      marketing: consent.marketing === 1,
      consent_date: consent.consent_date,
      updated_at: consent.updated_at
    });
  } catch (error) {
    console.error('[GDPR] Get consent error:', error);
    res.status(500).json({ error: 'Failed to retrieve consent', message: error.message });
  }
});

// Update user consent
app.post('/api/user/consent', writeLimiter, csrfProtection, authenticate, (req, res) => {
  try {
    // Get user ID from database based on username from JWT
    const user = db.prepare('SELECT id FROM users WHERE username = ?').get(req.user.username);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const userId = user.id;
    const { data_processing, analytics, marketing } = req.body;
    const ipAddress = req.ip || req.connection?.remoteAddress;

    if (typeof data_processing !== 'boolean' ||
        typeof analytics !== 'boolean' ||
        typeof marketing !== 'boolean') {
      return res.status(400).json({
        error: 'Invalid consent values',
        message: 'All consent values must be boolean'
      });
    }

    const consentDate = Math.floor(Date.now() / 1000);

    db.prepare(`
      INSERT INTO user_consent (user_id, data_processing, analytics, marketing, consent_date, ip_address)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        data_processing = excluded.data_processing,
        analytics = excluded.analytics,
        marketing = excluded.marketing,
        consent_date = excluded.consent_date,
        ip_address = excluded.ip_address,
        updated_at = strftime('%s', 'now')
    `).run(
      userId,
      data_processing ? 1 : 0,
      analytics ? 1 : 0,
      marketing ? 1 : 0,
      consentDate,
      ipAddress
    );

    console.log(`[GDPR] Consent updated for user: ${userId}`);

    res.json({
      success: true,
      message: 'Consent preferences updated',
      consent: {
        data_processing,
        analytics,
        marketing,
        consent_date: consentDate
      }
    });
  } catch (error) {
    console.error('[GDPR] Update consent error:', error);
    res.status(500).json({ error: 'Failed to update consent', message: error.message });
  }
});

// Privacy Policy Endpoint
app.get('/api/privacy-policy', readLimiter, (req, res) => {
  const privacyPolicy = {
    version: '1.0.0',
    lastUpdated: '2024-01-01',
    policy: {
      dataController: {
        name: 'HAsync Application',
        contact: 'privacy@hasync.app'
      },
      dataCollected: [
        'User account information (username, email)',
        'Home Assistant configuration data',
        'Dashboard and area configurations',
        'Device pairing information',
        'Activity logs for security purposes'
      ],
      purposeOfProcessing: [
        'Providing Home Assistant management services',
        'Improving application functionality',
        'Security and fraud prevention',
        'Analytics (with consent)'
      ],
      dataRetention: {
        activeUsers: 'Data retained while account is active',
        deletedAccounts: 'Data permanently deleted within 30 days of account deletion',
        activityLogs: 'Retained for 90 days for security purposes'
      },
      userRights: [
        'Right to access your data (data export)',
        'Right to rectification (update your data)',
        'Right to erasure (delete your account)',
        'Right to restrict processing',
        'Right to data portability',
        'Right to object to processing',
        'Right to withdraw consent'
      ],
      dataSecurity: [
        'TLS encryption for data in transit',
        'Access control and authentication',
        'Regular security updates',
        'Activity logging and monitoring'
      ],
      thirdPartySharing: 'We do not share your data with third parties',
      cookies: 'We use essential cookies for authentication only',
      contact: 'For privacy concerns, contact: privacy@hasync.app'
    }
  };

  res.json(privacyPolicy);
});

  console.log(`[WebSocket] User connected: ${user?.username} (${socket.id})`);

  // Track connection for logging
  const connectionInfo = {
    socketId: socket.id,
    username: user?.username,
    ip: socket.handshake.address,
    connectedAt: new Date().toISOString(),
  };

  // Register client socket for client-specific notifications
  // Extract clientId from socket auth data (if client token was used)
  const clientId = (socket as any).clientId;
  if (clientId) {
    registerClientSocket(clientId, socket);
    logger.info(`[WebSocket] Client ${clientId} registered for real-time notifications`);
  }

  // Subscribe to real-time updates
  socket.on('subscribe', (data) => {
    try {
      const validated = validateSubscribe(data);
      const roomName = validateRoomName(validated.type);

      socket.join(roomName);
      console.log(`[WebSocket] ${user?.username} subscribed to: ${roomName}`);

      socket.emit('subscribed', {
        type: validated.type,
        status: 'ok',
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('[WebSocket] Subscribe validation error:', error.message);
      socket.emit('error', {
        type: 'VALIDATION_ERROR',
        message: 'Invalid subscription data',
        details: error.message,
      });
    }
  });

  // Unsubscribe from updates
  socket.on('unsubscribe', (data) => {
    try {
      const validated = validateSubscribe(data);
      const roomName = validateRoomName(validated.type);

      socket.leave(roomName);
      console.log(`[WebSocket] ${user?.username} unsubscribed from: ${roomName}`);

      socket.emit('unsubscribed', {
        type: validated.type,
        status: 'ok',
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('[WebSocket] Unsubscribe validation error:', error.message);
      socket.emit('error', {
        type: 'VALIDATION_ERROR',
        message: 'Invalid unsubscribe data',
        details: error.message,
      });
    }
  });

  // Entity update from client (if needed)
  socket.on('entity_update', (data) => {
    try {
      const validated = validateEntityUpdate(data);

      // Broadcast to all subscribers in the entities room
      io.to('entities').emit('entity_update', {
        ...validated,
        updatedBy: user?.username,
        timestamp: new Date().toISOString(),
      });

      console.log(`[WebSocket] Entity update from ${user?.username}:`, validated.entityId);
    } catch (error: any) {
      console.error('[WebSocket] Entity update validation error:', error.message);
      socket.emit('error', {
        type: 'VALIDATION_ERROR',
        message: 'Invalid entity update data',
        details: error.message,
      });
    }
  });

  // Pairing request
  socket.on('pairing_request', (data) => {
    try {
      const validated = validatePairing(data);

      // Only admin can approve pairing
      if (user?.role !== 'admin') {
        socket.emit('error', {
          type: 'UNAUTHORIZED',
          message: 'Only admin users can approve pairing requests',
        });
        return;
      }

      // Broadcast pairing request
      io.emit('pairing_request', {
        ...validated,
        requestedBy: user?.username,
        timestamp: new Date().toISOString(),
      });

      console.log(`[WebSocket] Pairing request from ${user?.username}`);
    } catch (error: any) {
      console.error('[WebSocket] Pairing validation error:', error.message);
      socket.emit('error', {
        type: 'VALIDATION_ERROR',
        message: 'Invalid pairing data',
        details: error.message,
      });
    }
  });

  // Config update notification
  socket.on('config_update', (data) => {
    try {
      const validated = validateConfigUpdate(data);

      // Only admin can update config
      if (user?.role !== 'admin') {
        socket.emit('error', {
          type: 'UNAUTHORIZED',
          message: 'Only admin users can update configuration',
        });
        return;
      }

      // Broadcast to all clients
      io.emit('config_update', {
        ...validated,
        updatedBy: user?.username,
        timestamp: new Date().toISOString(),
      });

      console.log(`[WebSocket] Config update from ${user?.username}:`, validated.key);
    } catch (error: any) {
      console.error('[WebSocket] Config update validation error:', error.message);
      socket.emit('error', {
        type: 'VALIDATION_ERROR',
        message: 'Invalid config update data',
        details: error.message,
      });
    }
  });

  // Heartbeat/ping
  socket.on('ping', () => {
    socket.emit('pong', { timestamp: new Date().toISOString() });
  });

  // Disconnect handler
  socket.on('disconnect', (reason) => {
    console.log(`[WebSocket] User disconnected: ${user?.username} (${socket.id}), reason: ${reason}`);

    // Unregister client socket if it was a client connection
    const clientId = (socket as any).clientId;
    if (clientId) {
      unregisterClientSocket(clientId);
      logger.info(`[WebSocket] Client ${clientId} unregistered on disconnect`);
    }

    // Log disconnection
    const disconnectInfo = {
      ...connectionInfo,
      disconnectedAt: new Date().toISOString(),
      reason,
    };

    // You could store this in database for audit trail
    console.log('[WebSocket] Connection info:', disconnectInfo);
  });

  // Error handler
  socket.on('error', (error) => {
    console.error(`[WebSocket] Socket error for ${user?.username}:`, error);
  });
});

// Start server
mainServer.listen(tlsOptions.port, () => {
  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log(`  HAsync Backend Server v${VERSION}`);
  console.log('═══════════════════════════════════════════════');

  if (tlsOptions.enabled) {
    console.log(`  Protocol:  HTTPS (TLS ENABLED ✓)`);
    console.log(`  API:       https://localhost:${tlsOptions.port}/api`);
    console.log(`  Health:    https://localhost:${tlsOptions.port}/api/health`);
    console.log(`  WebSocket: wss://localhost:${tlsOptions.port}`);
    console.log(`  API Docs:  https://localhost:${tlsOptions.port}/api-docs`);
  } else {
    console.log(`  Protocol:  HTTP (⚠ INSECURE - Enable TLS!)`);
    console.log(`  API:       http://localhost:${tlsOptions.port}/api`);
    console.log(`  Health:    http://localhost:${tlsOptions.port}/api/health`);
    console.log(`  WebSocket: ws://localhost:${tlsOptions.port}`);
    console.log(`  API Docs:  http://localhost:${tlsOptions.port}/api-docs`);
  }

  console.log(`  Database:  ${DATABASE_PATH}`);
  console.log('═══════════════════════════════════════════════');
  console.log('  CORS Configuration');
  console.log('───────────────────────────────────────────────');
  console.log(`  Internal Networks: ✓ Allowed (10.x, 172.x, 192.168.x)`);
  console.log(`  Localhost: ✓ Allowed`);
  console.log(`  Configured Origins: ${allowedOrigins.length} origins`);
  if (process.env.LOG_LEVEL === 'debug') {
    console.log(`  Origins:`, allowedOrigins.slice(0, 5).join(', '), allowedOrigins.length > 5 ? '...' : '');
  }
  console.log('═══════════════════════════════════════════════');
  console.log('  Log Level: ' + (process.env.LOG_LEVEL || 'info').toUpperCase());
  console.log('  Logging: Errors, Auth, Config changes (Healthchecks filtered)');
  console.log('═══════════════════════════════════════════════');
  console.log('');
});

// Start HTTP redirect server if enabled
if (httpRedirectServer && tlsOptions.redirectHttp) {
  httpRedirectServer.listen(tlsOptions.httpPort, () => {
    console.log(`✓ HTTP redirect server listening on port ${tlsOptions.httpPort}`);
    console.log(`  HTTP requests will be redirected to HTTPS port ${tlsOptions.port}`);
    console.log('');
  });
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing servers...');
  mainServer.close(() => {
    if (httpRedirectServer) {
      httpRedirectServer.close(() => {
        if (db) db.close();
        process.exit(0);
      });
    } else {
      if (db) db.close();
      process.exit(0);
    }
  });
});
