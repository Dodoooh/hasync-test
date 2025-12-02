"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const http_1 = require("http");
const https_1 = require("https");
const socket_io_1 = require("socket.io");
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const path_1 = require("path");
const fs_1 = require("fs");
const crypto_1 = require("crypto");
const csurf_1 = __importDefault(require("csurf"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const yaml_1 = __importDefault(require("yaml"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const tls_1 = require("./config/tls");
const https_redirect_1 = require("./middleware/https-redirect");
const socketAuth_1 = require("./middleware/socketAuth");
const socketValidation_1 = require("./utils/socketValidation");
const database_security_1 = require("./utils/database-security");
const errorHandler_1 = require("./middleware/errorHandler");
const AppError_1 = require("./errors/AppError");
const logger_1 = require("./utils/logger");
const admin_1 = require("./routes/admin");
const auth_1 = require("./routes/auth");
const requestLogger_1 = require("./middleware/requestLogger");
const websocket_events_1 = require("./services/websocket-events");
const tokenUtils_1 = require("./utils/tokenUtils");
const migrate_pairing_1 = require("./database/migrate-pairing");
const homeassistant_1 = require("./services/homeassistant");
const logger = (0, logger_1.createLogger)('Server');
const VERSION = '1.4.0';
(0, errorHandler_1.setupUnhandledRejectionHandler)();
(0, errorHandler_1.setupUncaughtExceptionHandler)();
const tlsOptions = (0, tls_1.getTLSOptionsFromEnv)();
(0, tls_1.validateTLSConfig)(tlsOptions);
const DATABASE_PATH = process.env.DATABASE_PATH || '/data/app01.db';
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error('FATAL: JWT_SECRET environment variable is required!');
}
const JWT_EXPIRATION = process.env.JWT_EXPIRATION || '24h';
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
const httpOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];
const allowedOrigins = [
    ...httpOrigins,
    ...httpOrigins.map(origin => origin.replace('http://', 'https://')),
    'http://localhost:3000',
    'https://localhost:3000'
];
const app = (0, express_1.default)();
let mainServer;
let httpRedirectServer;
if (tlsOptions.enabled) {
    const tlsConfig = (0, tls_1.loadTLSCertificates)(tlsOptions);
    const httpsOptions = (0, tls_1.createHTTPSOptions)(tlsConfig);
    mainServer = (0, https_1.createServer)(httpsOptions, app);
    if (tlsOptions.redirectHttp) {
        const redirectApp = (0, express_1.default)();
        redirectApp.use((0, https_redirect_1.httpsRedirect)({
            enabled: true,
            httpsPort: tlsOptions.port,
            excludePaths: ['/api/health']
        }));
        httpRedirectServer = (0, http_1.createServer)(redirectApp);
    }
}
else {
    mainServer = (0, http_1.createServer)(app);
}
const io = new socket_io_1.Server(mainServer, {
    cors: {
        origin: (origin, callback) => {
            if (!origin) {
                callback(null, true);
                return;
            }
            const isOriginAllowed = allowedOrigins.includes(origin);
            const isInternalOrigin = origin.includes('://10.') ||
                origin.includes('://172.') ||
                origin.includes('://192.168.') ||
                origin.includes('://localhost') ||
                origin.includes('://127.0.0.1');
            if (isOriginAllowed || isInternalOrigin) {
                logger.info(`WebSocket CORS: ✅ Allowed origin: ${origin} ${isInternalOrigin ? '(internal network)' : ''}`);
                callback(null, true);
            }
            else {
                logger.warn(`WebSocket CORS: ❌ Rejected origin: ${origin}`);
                logger.info(`Allowed origins: ${allowedOrigins.join(', ')}`);
                callback(new Error('Not allowed by CORS'));
            }
        },
        credentials: true,
        methods: ['GET', 'POST'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        maxAge: 86400
    }
});
const authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: {
        error: 'Too many authentication attempts',
        message: 'Please try again later. Maximum 5 attempts per 15 minutes.',
        retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        res.status(429).json({
            error: 'Too many authentication attempts',
            message: 'Please try again later. Maximum 5 attempts per 15 minutes.',
            retryAfter: '15 minutes'
        });
    }
});
const writeLimiter = (0, express_rate_limit_1.default)({
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
const readLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 500,
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
const authenticate = (req, res, next) => {
    logger.debug('Authenticate middleware', {
        method: req.method,
        path: req.path,
        hasAuthHeader: !!req.headers.authorization,
        authHeaderPreview: req.headers.authorization ? req.headers.authorization.substring(0, 20) + '...' : 'none'
    });
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
        logger.warn('Authentication failed: No token provided', {
            path: req.path,
            method: req.method
        });
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'No token provided'
        });
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET, {
            issuer: 'hasync-backend',
            audience: 'hasync-client'
        });
        if (decoded.role === 'admin') {
            req.user = {
                id: decoded.username,
                username: decoded.username,
                role: 'admin'
            };
            next();
        }
        else if (decoded.role === 'client') {
            const tokenHash = (0, tokenUtils_1.hashToken)(token);
            const client = db.prepare('SELECT * FROM clients WHERE token_hash = ? AND is_active = 1').get(tokenHash);
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
            db.prepare('UPDATE clients SET last_seen = ? WHERE id = ?').run(Math.floor(Date.now() / 1000), client.id);
            next();
        }
        else {
            return res.status(401).json({
                error: 'Invalid token type'
            });
        }
    }
    catch (error) {
        logger.warn(`Authentication failed: ${error.message}`);
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                error: 'Token expired',
                message: 'Your session has expired. Please log in again.',
                expiredAt: error.expiredAt
            });
        }
        else if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                error: 'Invalid token signature'
            });
        }
        else {
            return res.status(401).json({
                error: 'Authentication failed'
            });
        }
    }
};
app.use((0, helmet_1.default)({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "ws:", "wss:", "http:", "https:"],
            fontSrc: ["'self'", "data:"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            frameAncestors: ["'none'"],
        },
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    },
    frameguard: {
        action: 'deny'
    },
    noSniff: true,
    referrerPolicy: {
        policy: 'no-referrer'
    },
    dnsPrefetchControl: {
        allow: false
    },
    ieNoOpen: true,
    permittedCrossDomainPolicies: {
        permittedPolicies: 'none'
    }
}));
app.use((_req, res, next) => {
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()');
    next();
});
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin) {
            const referer = callback['req']?.headers?.referer;
            const host = callback['req']?.headers?.host;
            const isLocalhost = host?.includes('localhost') || host?.includes('127.0.0.1');
            const isInternalIP = host?.includes('172.') || host?.includes('10.') || host?.includes('192.168.');
            const isTrustedTool = referer === undefined || referer?.includes('localhost');
            const forwardedFor = callback['req']?.headers['x-forwarded-for'];
            const isProxied = forwardedFor !== undefined;
            if (isLocalhost || isInternalIP || isTrustedTool || isProxied) {
                callback(null, true);
                return;
            }
            logger.error('CORS rejected - no origin header from untrusted source', {
                host,
                referer,
                ip: callback['req']?.ip
            });
            callback(new Error('Origin header required for security'));
            return;
        }
        const isOriginAllowed = allowedOrigins.includes(origin);
        const isInternalOrigin = origin.includes('://10.') || origin.includes('://172.') || origin.includes('://192.168.') || origin.includes('://localhost') || origin.includes('://127.0.0.1');
        if (isOriginAllowed || isInternalOrigin) {
            callback(null, true);
        }
        else {
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
    maxAge: 86400
}));
app.use(express_1.default.json());
app.use((0, cookie_parser_1.default)());
if (tlsOptions.enabled) {
    app.use((0, https_redirect_1.securityHeaders)());
}
app.use((0, requestLogger_1.createRequestLoggerMiddleware)({ allowedOrigins }));
const csrfMiddleware = (0, csurf_1.default)({
    cookie: {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        maxAge: 3600000
    }
});
const csrfProtection = (req, res, next) => {
    const authHeader = req.get('authorization');
    const csrfToken = req.get('x-csrf-token') || req.get('csrf-token');
    logger.debug('CSRF Protection Check', {
        method: req.method,
        path: req.path,
        hasAuthHeader: !!authHeader,
        authHeaderValue: authHeader ? `${authHeader.substring(0, 20)}...` : 'none',
        hasCsrfToken: !!csrfToken,
        allHeaders: Object.keys(req.headers)
    });
    if (authHeader && authHeader.startsWith('Bearer ')) {
        logger.info('✓ Skipping CSRF for JWT-authenticated request', {
            method: req.method,
            path: req.path
        });
        return next();
    }
    logger.debug('Using CSRF middleware (no JWT Bearer token found)', {
        method: req.method,
        path: req.path
    });
    csrfMiddleware(req, res, next);
};
app.get('/api/csrf-token', csrfMiddleware, (req, res) => {
    res.json({ csrfToken: req.csrfToken() });
});
let db;
try {
    (0, database_security_1.setDatabasePermissions)(DATABASE_PATH);
    db = new better_sqlite3_1.default(DATABASE_PATH);
    console.log(`✓ Database connected: ${DATABASE_PATH}`);
    (0, database_security_1.configureDatabaseSecurity)(db);
    const schemaPath = (0, path_1.join)(__dirname, 'database', 'schema.sql');
    if ((0, fs_1.existsSync)(schemaPath)) {
        try {
            const schema = (0, fs_1.readFileSync)(schemaPath, 'utf8');
            db.exec(schema);
            console.log('✓ Database schema initialized');
        }
        catch (error) {
            if (error.message && error.message.includes('duplicate column')) {
                console.log('→ Database schema already exists (duplicate column ignored)');
            }
            else {
                console.error('⚠ Schema initialization warning:', error.message);
            }
        }
    }
    const areasMigrationPath = (0, path_1.join)(__dirname, 'database', 'schema-migration-areas.sql');
    if ((0, fs_1.existsSync)(areasMigrationPath)) {
        try {
            const areasMigration = (0, fs_1.readFileSync)(areasMigrationPath, 'utf8');
            db.exec(areasMigration);
            console.log('✓ Areas migration applied');
        }
        catch (error) {
            if (error.message && error.message.includes('duplicate column')) {
                console.log('→ Areas migration already applied (duplicate column ignored)');
            }
            else {
                console.error('⚠ Migration warning:', error.message);
            }
        }
    }
    const pairingMigrationPath = (0, path_1.join)(__dirname, 'database', 'schema-migration-pairing.sql');
    if ((0, fs_1.existsSync)(pairingMigrationPath)) {
        try {
            const pairingMigration = (0, fs_1.readFileSync)(pairingMigrationPath, 'utf8');
            db.exec(pairingMigration);
            console.log('✓ Pairing migration applied');
        }
        catch (error) {
            if (error.message && error.message.includes('duplicate column')) {
                console.log('→ Pairing migration already applied (duplicate column ignored)');
            }
            else {
                console.error('⚠ Pairing migration warning:', error.message);
            }
        }
    }
    try {
        logger.info('Running pairing tables migration...');
        (0, migrate_pairing_1.migratePairingTables)(db);
        logger.info('✓ Pairing tables ready');
        const cleanupJobId = (0, migrate_pairing_1.startPairingCleanupJob)(db);
        logger.info('✓ Pairing cleanup job started');
        process.on('SIGTERM', () => {
            clearInterval(cleanupJobId);
            logger.info('Pairing cleanup job stopped');
        });
    }
    catch (error) {
        logger.warn(`Pairing migration warning: ${error.message}`);
    }
    const backupDir = process.env.BACKUP_DIR || (0, path_1.join)(__dirname, '../../backups');
    try {
        (0, database_security_1.createDatabaseBackup)(db, backupDir);
        (0, database_security_1.cleanOldBackups)(backupDir, 10);
    }
    catch (error) {
        console.warn('⚠ Failed to create startup backup:', error);
    }
}
catch (error) {
    console.error('✗ Database error:', error);
}
try {
    const swaggerPath = (0, path_1.join)(__dirname, 'swagger.yaml');
    if ((0, fs_1.existsSync)(swaggerPath)) {
        const swaggerDocument = yaml_1.default.parse((0, fs_1.readFileSync)(swaggerPath, 'utf8'));
        swaggerDocument.info.version = VERSION;
        app.get('/api-docs/swagger.json', (req, res) => {
            const protocol = tlsOptions.enabled ? 'https' : 'http';
            const host = req.get('host') || `localhost:${tlsOptions.port}`;
            const serverUrl = `${protocol}://${host}/api`;
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
        const swaggerUiPackagePath = require.resolve('swagger-ui-dist/package.json');
        const pathToSwaggerUi = (0, path_1.join)(swaggerUiPackagePath, '..');
        logger.info(`Swagger UI assets path: ${pathToSwaggerUi}`);
        const swaggerUiCss = (0, fs_1.readFileSync)((0, path_1.join)(pathToSwaggerUi, 'swagger-ui.css'), 'utf8');
        const swaggerUiBundleJs = (0, fs_1.readFileSync)((0, path_1.join)(pathToSwaggerUi, 'swagger-ui-bundle.js'), 'utf8');
        const swaggerUiPresetJs = (0, fs_1.readFileSync)((0, path_1.join)(pathToSwaggerUi, 'swagger-ui-standalone-preset.js'), 'utf8');
        app.get('/api-docs', (req, res) => {
            const protocol = tlsOptions.enabled ? 'https' : 'http';
            const host = req.get('host') || `localhost:${tlsOptions.port}`;
            const serverUrl = `${protocol}://${host}/api`;
            res.setHeader('Content-Security-Policy', "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; " +
                "connect-src * 'unsafe-inline'; " +
                "script-src * 'unsafe-inline' 'unsafe-eval'; " +
                "style-src * 'unsafe-inline';");
            const specWithDynamicServer = {
                ...swaggerDocument,
                servers: [
                    {
                        url: serverUrl,
                        description: 'HAsync Backend API Server'
                    }
                ]
            };
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
}
catch (error) {
    logger.warn('Failed to load Swagger documentation', { error: error instanceof Error ? error.message : 'Unknown error' });
}
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
app.post('/api/pairing/create', authLimiter, authenticate, (req, res) => {
    if (req.user.role !== 'admin') {
        logger.warn(`Non-admin user ${req.user.username} tried to generate pairing PIN`);
        return res.status(403).json({
            error: 'Forbidden',
            message: 'Only admin users can generate pairing PINs'
        });
    }
    try {
        const pinNumber = (0, crypto_1.randomBytes)(3).readUIntBE(0, 3) % 900000 + 100000;
        const pin = pinNumber.toString();
        const sessionId = `pairing_${Date.now()}`;
        const expiresAtTimestamp = Math.floor(Date.now() / 1000) + (5 * 60);
        const createdAtTimestamp = Math.floor(Date.now() / 1000);
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
    }
    catch (error) {
        logger.error(`[Pairing] Failed to create pairing session: ${error.message}`);
        res.status(500).json({
            error: 'Failed to create pairing session',
            message: error.message
        });
    }
});
app.post('/api/pairing/:sessionId/verify', authLimiter, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { sessionId } = req.params;
    const { pin, deviceName, deviceType } = req.body;
    logger.info(`[Pairing] Verify attempt for session: ${sessionId}`);
    if (!pin || !deviceName || !deviceType) {
        throw new AppError_1.ValidationError('PIN, device name, and device type are required');
    }
    if (!/^\d{6}$/.test(pin)) {
        throw new AppError_1.ValidationError('PIN must be 6 digits');
    }
    if (typeof deviceName !== 'string' || deviceName.length < 1 || deviceName.length > 100) {
        throw new AppError_1.ValidationError('Device name must be 1-100 characters');
    }
    if (!['mobile', 'tablet', 'desktop', 'other'].includes(deviceType)) {
        throw new AppError_1.ValidationError('Invalid device type');
    }
    let session;
    if (/^\d{6}$/.test(sessionId)) {
        logger.info(`[Pairing] Looking up session by PIN: ${sessionId}`);
        session = db.prepare('SELECT * FROM pairing_sessions WHERE pin = ? AND status = ?').get(sessionId, 'pending');
    }
    else {
        session = db.prepare('SELECT * FROM pairing_sessions WHERE id = ?').get(sessionId);
    }
    if (!session) {
        logger.warn(`[Pairing] Session not found: ${sessionId}`);
        throw new AppError_1.NotFoundError('Pairing session');
    }
    const now = Math.floor(Date.now() / 1000);
    if (now > session.expires_at) {
        logger.warn(`[Pairing] Session expired: ${sessionId}`);
        throw new AppError_1.ValidationError('Pairing session has expired. Please generate a new PIN.');
    }
    if (session.status !== 'pending') {
        logger.warn(`[Pairing] Session already ${session.status}: ${sessionId}`);
        throw new AppError_1.ValidationError(`Pairing session is already ${session.status}`);
    }
    if (session.pin !== pin) {
        logger.warn(`[Pairing] Invalid PIN for session: ${sessionId}`);
        throw new AppError_1.ValidationError('Invalid PIN');
    }
    const clientId = `client_${Date.now()}`;
    let assignedAreas = [];
    try {
        if (haService) {
            const areas = await haService.getAreas();
            assignedAreas = areas.map((area) => area.area_id || area.id);
            logger.info(`[Pairing] Fetched ${assignedAreas.length} areas from Home Assistant`);
        }
        else {
            logger.warn('[Pairing] Home Assistant Service not initialized - no areas assigned');
        }
    }
    catch (error) {
        logger.error(`[Pairing] Failed to fetch areas from Home Assistant: ${error.message}`);
    }
    const clientToken = (0, tokenUtils_1.generateClientToken)(clientId, assignedAreas);
    const tokenHash = (0, tokenUtils_1.hashToken)(clientToken);
    const timestamp = Math.floor(Date.now() / 1000);
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
      metadata,
      token_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(clientId, database_security_1.InputSanitizer.sanitizeString(deviceName, 100), deviceType, tokenHash, tokenHash, timestamp, timestamp, 1, JSON.stringify(assignedAreas), JSON.stringify({
        deviceName: deviceName,
        sessionId: session.id,
        pairingMethod: 'pin',
        pairedAt: new Date().toISOString()
    }), tokenHash);
    db.prepare(`
    UPDATE pairing_sessions
    SET status = 'completed',
        device_name = ?,
        device_type = ?,
        client_id = ?,
        client_token_hash = ?
    WHERE id = ?
  `).run(database_security_1.InputSanitizer.sanitizeString(deviceName, 100), deviceType, clientId, tokenHash, session.id);
    logger.info(`[Pairing] Session completed immediately: ${session.id} → Client: ${clientId} (${deviceName})`);
    db.prepare(`
    INSERT INTO activity_log (client_id, action, details, ip_address)
    VALUES (?, ?, ?, ?)
  `).run(clientId, 'pairing_completed', JSON.stringify({ sessionId: session.id, clientName: deviceName, deviceName: deviceName }), req.ip || req.connection?.remoteAddress);
    io.emit('pairing_completed', {
        sessionId: session.id,
        clientId,
        deviceName,
        deviceType,
        timestamp: new Date().toISOString()
    });
    res.json({
        success: true,
        message: 'PIN verified and paired successfully.',
        sessionId: session.id,
        status: 'completed',
        clientId: clientId,
        clientToken: clientToken
    });
}));
app.post('/api/pairing/:sessionId/complete', authLimiter, authenticate, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    if (req.user.role !== 'admin') {
        logger.warn(`[Pairing] Non-admin user ${req.user.username} tried to complete pairing`);
        throw new AppError_1.ValidationError('Only admin users can complete pairing');
    }
    const { sessionId } = req.params;
    const { clientName, assignedAreas = [] } = req.body;
    logger.info(`[Pairing] Complete pairing for session: ${sessionId} by admin: ${req.user.username}`);
    if (typeof clientName !== 'string' || clientName.length < 1 || clientName.length > 100) {
        throw new AppError_1.ValidationError('Client name must be 1-100 characters');
    }
    if (!Array.isArray(assignedAreas)) {
        throw new AppError_1.ValidationError('Assigned areas must be an array');
    }
    const session = db.prepare('SELECT * FROM pairing_sessions WHERE id = ?').get(sessionId);
    if (!session) {
        logger.warn(`[Pairing] Session not found: ${sessionId}`);
        throw new AppError_1.NotFoundError('Pairing session');
    }
    if (session.status !== 'verified') {
        logger.warn(`[Pairing] Session not verified: ${sessionId} (status: ${session.status})`);
        throw new AppError_1.ValidationError('Pairing session must be verified before completion');
    }
    const clientId = `client_${Date.now()}`;
    const clientToken = (0, tokenUtils_1.generateClientToken)(clientId, assignedAreas);
    const tokenHash = (0, tokenUtils_1.hashToken)(clientToken);
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
      metadata,
      token_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(clientId, database_security_1.InputSanitizer.sanitizeString(clientName, 100), session.device_type, tokenHash, tokenHash, now, now, 1, JSON.stringify(assignedAreas), JSON.stringify({
        deviceName: session.device_name,
        sessionId: sessionId,
        approvedBy: req.user.username,
        approvedAt: new Date().toISOString()
    }), tokenHash);
    db.prepare(`
    UPDATE pairing_sessions
    SET status = 'completed',
        client_id = ?,
        client_token_hash = ?
    WHERE id = ?
  `).run(clientId, tokenHash, sessionId);
    logger.info(`[Pairing] Pairing completed: ${sessionId} → Client: ${clientId} (${clientName})`);
    db.prepare(`
    INSERT INTO activity_log (client_id, action, details, ip_address)
    VALUES (?, ?, ?, ?)
  `).run(clientId, 'pairing_completed', JSON.stringify({ sessionId, clientName, deviceName: session.device_name }), req.ip || req.connection?.remoteAddress);
    io.emit('pairing_completed', {
        sessionId,
        clientId,
        clientToken,
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
app.get('/api/pairing/:sessionId', readLimiter, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { sessionId } = req.params;
    logger.info(`[Pairing] Get status for session: ${sessionId}`);
    const session = db.prepare('SELECT * FROM pairing_sessions WHERE id = ?').get(sessionId);
    if (!session) {
        logger.warn(`[Pairing] Session not found: ${sessionId}`);
        throw new AppError_1.NotFoundError('Pairing session');
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
app.delete('/api/pairing/:sessionId', writeLimiter, authenticate, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    if (req.user.role !== 'admin') {
        logger.warn(`[Pairing] Non-admin user ${req.user.username} tried to delete pairing session`);
        throw new AppError_1.ValidationError('Only admin users can delete pairing sessions');
    }
    const { sessionId } = req.params;
    logger.info(`[Pairing] Delete session: ${sessionId} by admin: ${req.user.username}`);
    const session = db.prepare('SELECT * FROM pairing_sessions WHERE id = ?').get(sessionId);
    if (!session) {
        logger.warn(`[Pairing] Session not found: ${sessionId}`);
        throw new AppError_1.NotFoundError('Pairing session');
    }
    db.prepare('DELETE FROM pairing_sessions WHERE id = ?').run(sessionId);
    logger.info(`[Pairing] Session deleted: ${sessionId}`);
    res.json({
        success: true,
        message: 'Pairing session deleted'
    });
}));
const getHAConfig = () => {
    try {
        if (db) {
            const config = db.prepare('SELECT value FROM configuration WHERE key = ?').get('ha_config');
            if (config && config.value) {
                const parsed = JSON.parse(config.value);
                console.log('✓ HA config loaded from database:', { url: parsed.url, hasToken: !!parsed.token });
                return parsed;
            }
        }
    }
    catch (error) {
        console.error('✗ Error reading HA config from database:', error.message);
    }
    const fallback = {
        url: process.env.HOMEASSISTANT_URL,
        token: process.env.HOMEASSISTANT_TOKEN
    };
    if (fallback.url && fallback.token) {
        console.log('→ Using env fallback config');
    }
    else {
        console.warn('⚠ No HA config found in database or environment');
    }
    return fallback;
};
let haService = null;
const initializeHAService = () => {
    const haConfig = getHAConfig();
    if (haConfig.url && haConfig.token) {
        haService = new homeassistant_1.HomeAssistantService({
            url: haConfig.url,
            token: haConfig.token,
            supervisorToken: process.env.SUPERVISOR_TOKEN,
            mode: process.env.SUPERVISOR_TOKEN ? 'addon' : 'standalone'
        });
        logger.info('✓ Home Assistant Service initialized');
    }
    else {
        logger.warn('⚠ Home Assistant not configured - areas won\'t be auto-assigned during pairing');
    }
};
app.get('/api/entities', readLimiter, authenticate, (0, errorHandler_1.asyncHandler)(async (_req, res) => {
    const haConfig = getHAConfig();
    const haUrl = haConfig.url;
    const haToken = haConfig.token;
    if (!haUrl || !haToken) {
        throw new AppError_1.ServiceUnavailableError('Home Assistant', 'Please configure Home Assistant URL and token in Settings');
    }
    logger.info(`Fetching entities from ${haUrl}/api/states`);
    const response = await fetch(`${haUrl}/api/states`, {
        headers: {
            'Authorization': `Bearer ${haToken}`,
            'Content-Type': 'application/json'
        }
    });
    if (!response.ok) {
        throw new AppError_1.ServiceUnavailableError('Home Assistant API', `${response.status} ${response.statusText}`);
    }
    const entities = await response.json();
    logger.info(`✓ Fetched ${entities.length} entities from Home Assistant`);
    res.json(entities);
}));
app.get('/api/areas', readLimiter, authenticate, (req, res) => {
    try {
        const { enabled } = req.query;
        let areas;
        if (enabled !== undefined) {
            const enabledValue = enabled === 'true' ? 1 : 0;
            areas = db.prepare('SELECT * FROM areas WHERE is_enabled = ?').all(enabledValue);
        }
        else {
            areas = db.prepare('SELECT * FROM areas').all();
        }
        const result = areas.map((area) => ({
            id: area.id,
            name: area.name,
            entityIds: area.entity_ids ? JSON.parse(area.entity_ids) : [],
            isEnabled: area.is_enabled === 1
        }));
        res.json(result);
    }
    catch (error) {
        console.error('Error fetching areas:', error);
        res.json([]);
    }
});
app.post('/api/areas', writeLimiter, csrfProtection, authenticate, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({
            error: 'Forbidden',
            message: 'Only admin users can create areas'
        });
    }
    try {
        const { name, entityIds, isEnabled = true } = req.body;
        if (!name || !database_security_1.InputSanitizer.validateAreaName(name)) {
            return res.status(400).json({
                error: 'Invalid area name',
                message: 'Name must be 1-100 characters, alphanumeric with spaces and common punctuation'
            });
        }
        if (entityIds && !database_security_1.InputSanitizer.validateEntityIdArray(entityIds)) {
            return res.status(400).json({
                error: 'Invalid entity IDs',
                message: 'Entity IDs must match format: domain.name'
            });
        }
        if (!database_security_1.InputSanitizer.validateBoolean(isEnabled)) {
            return res.status(400).json({
                error: 'Invalid isEnabled value',
                message: 'isEnabled must be a boolean'
            });
        }
        const id = `area_${Date.now()}`;
        const sanitizedName = database_security_1.InputSanitizer.sanitizeString(name, 100);
        const entity_ids_json = JSON.stringify(entityIds || []);
        const is_enabled = isEnabled ? 1 : 0;
        db.prepare('INSERT INTO areas (id, name, entity_ids, is_enabled) VALUES (?, ?, ?, ?)')
            .run(id, sanitizedName, entity_ids_json, is_enabled);
        res.json({
            id,
            name: sanitizedName,
            entityIds: entityIds || [],
            isEnabled: isEnabled
        });
    }
    catch (error) {
        console.error('Error creating area:', error);
        res.status(500).json({ error: 'Failed to create area' });
    }
});
app.put('/api/areas/:id', writeLimiter, csrfProtection, authenticate, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    if (req.user.role !== 'admin') {
        throw new Error('Forbidden: Only admin users can update areas');
    }
    const { id } = req.params;
    const { name, entityIds, isEnabled } = req.body;
    if (!database_security_1.InputSanitizer.validateAreaId(id)) {
        throw new AppError_1.ValidationError('Area ID must match format: area_timestamp');
    }
    const existing = db.prepare('SELECT * FROM areas WHERE id = ?').get(id);
    if (!existing) {
        throw new AppError_1.NotFoundError('Area');
    }
    if (name && !database_security_1.InputSanitizer.validateAreaName(name)) {
        throw new AppError_1.ValidationError('Name must be 1-100 characters, alphanumeric with spaces and common punctuation');
    }
    if (entityIds && !database_security_1.InputSanitizer.validateEntityIdArray(entityIds)) {
        throw new AppError_1.ValidationError('Entity IDs must match format: domain.name');
    }
    const sanitizedName = name ? database_security_1.InputSanitizer.sanitizeString(name, 100) : existing.name;
    const entity_ids_json = JSON.stringify(entityIds || []);
    const is_enabled = isEnabled !== undefined ? (isEnabled ? 1 : 0) : existing.is_enabled;
    db.prepare('UPDATE areas SET name = ?, entity_ids = ?, is_enabled = ? WHERE id = ?')
        .run(sanitizedName, entity_ids_json, is_enabled, id);
    (0, websocket_events_1.notifyClientsWithArea)(db, id, websocket_events_1.EVENT_TYPES.AREA_UPDATED, {
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
app.patch('/api/areas/:id', writeLimiter, csrfProtection, authenticate, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({
            error: 'Forbidden',
            message: 'Only admin users can update areas'
        });
    }
    try {
        const { id } = req.params;
        const updates = req.body;
        if (!database_security_1.InputSanitizer.validateAreaId(id)) {
            return res.status(400).json({
                error: 'Invalid area ID format',
                message: 'Area ID must match format: area_timestamp'
            });
        }
        const existing = db.prepare('SELECT * FROM areas WHERE id = ?').get(id);
        if (!existing) {
            return res.status(404).json({ error: 'Area not found' });
        }
        const updateFields = [];
        const updateValues = [];
        if (updates.name !== undefined) {
            if (!database_security_1.InputSanitizer.validateAreaName(updates.name)) {
                return res.status(400).json({
                    error: 'Invalid area name',
                    message: 'Name must be 1-100 characters, alphanumeric with spaces and common punctuation'
                });
            }
            updateFields.push('name = ?');
            updateValues.push(database_security_1.InputSanitizer.sanitizeString(updates.name, 100));
        }
        if (updates.entityIds !== undefined) {
            if (!database_security_1.InputSanitizer.validateEntityIdArray(updates.entityIds)) {
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
        if (updateFields.length === 0) {
            return res.json({
                id: existing.id,
                name: existing.name,
                entityIds: existing.entity_ids ? JSON.parse(existing.entity_ids) : [],
                isEnabled: existing.is_enabled === 1
            });
        }
        updateValues.push(id);
        const query = `UPDATE areas SET ${updateFields.join(', ')} WHERE id = ?`;
        db.prepare(query).run(...updateValues);
        const updated = db.prepare('SELECT * FROM areas WHERE id = ?').get(id);
        console.log(`✓ Area ${id} updated:`, updates);
        (0, websocket_events_1.notifyClientsWithArea)(db, id, websocket_events_1.EVENT_TYPES.AREA_UPDATED, {
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
    }
    catch (error) {
        console.error('Error patching area:', error);
        res.status(500).json({ error: 'Failed to update area' });
    }
});
app.patch('/api/areas/:id/toggle', writeLimiter, csrfProtection, authenticate, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({
            error: 'Forbidden',
            message: 'Only admin users can toggle areas'
        });
    }
    try {
        const { id } = req.params;
        const { enabled } = req.body;
        if (typeof enabled !== 'boolean') {
            return res.status(400).json({ error: 'enabled must be a boolean' });
        }
        const existing = db.prepare('SELECT * FROM areas WHERE id = ?').get(id);
        if (!existing) {
            return res.status(404).json({ error: 'Area not found' });
        }
        const is_enabled = enabled ? 1 : 0;
        db.prepare('UPDATE areas SET is_enabled = ? WHERE id = ?').run(is_enabled, id);
        const updated = db.prepare('SELECT * FROM areas WHERE id = ?').get(id);
        const eventName = is_enabled === 1 ? websocket_events_1.EVENT_TYPES.AREA_ENABLED : websocket_events_1.EVENT_TYPES.AREA_DISABLED;
        (0, websocket_events_1.notifyClientsWithArea)(db, id, eventName, {
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
    }
    catch (error) {
        console.error('Error toggling area:', error);
        res.status(500).json({ error: 'Failed to toggle area' });
    }
});
app.patch('/api/areas/:id/reorder', writeLimiter, csrfProtection, authenticate, async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({
            error: 'Forbidden',
            message: 'Only admin users can reorder area entities'
        });
    }
    try {
        const { id } = req.params;
        const { entityIds } = req.body;
        if (!Array.isArray(entityIds)) {
            return res.status(400).json({
                error: 'Invalid request',
                message: 'entityIds must be an array'
            });
        }
        const area = db.prepare('SELECT * FROM areas WHERE id = ?').get(id);
        if (!area) {
            return res.status(404).json({
                error: 'Area not found',
                message: `Area with id '${id}' does not exist`
            });
        }
        const currentEntityIds = area.entity_ids ? JSON.parse(area.entity_ids) : [];
        const invalidEntityIds = entityIds.filter((entityId) => !currentEntityIds.includes(entityId));
        if (invalidEntityIds.length > 0) {
            return res.status(400).json({
                error: 'Invalid entity IDs',
                message: `The following entity IDs are not in this area: ${invalidEntityIds.join(', ')}`
            });
        }
        const missingEntityIds = currentEntityIds.filter((entityId) => !entityIds.includes(entityId));
        if (missingEntityIds.length > 0) {
            return res.status(400).json({
                error: 'Missing entity IDs',
                message: `The following entity IDs are missing from the new order: ${missingEntityIds.join(', ')}`
            });
        }
        const entity_ids_json = JSON.stringify(entityIds);
        db.prepare('UPDATE areas SET entity_ids = ? WHERE id = ?')
            .run(entity_ids_json, id);
        const updatedArea = db.prepare('SELECT * FROM areas WHERE id = ?').get(id);
        res.setHeader('Content-Type', 'application/json');
        res.json({
            id: updatedArea.id,
            name: updatedArea.name,
            entityIds: JSON.parse(updatedArea.entity_ids),
            isEnabled: updatedArea.is_enabled === 1
        });
    }
    catch (error) {
        console.error('Error reordering entities:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error?.message || 'Failed to reorder entities'
        });
    }
});
app.get('/api/areas/:id/entities', readLimiter, authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const area = db.prepare('SELECT * FROM areas WHERE id = ?').get(id);
        if (!area) {
            return res.status(404).json({
                error: 'Area not found',
                message: `Area with id '${id}' does not exist`
            });
        }
        const entityIds = area.entity_ids ? JSON.parse(area.entity_ids) : [];
        if (entityIds.length === 0) {
            res.setHeader('Content-Type', 'application/json');
            return res.json([]);
        }
        const haConfig = getHAConfig();
        const haUrl = haConfig.url;
        const haToken = haConfig.token;
        if (!haUrl || !haToken) {
            return res.status(503).json({
                error: 'Home Assistant not configured',
                message: 'Please configure Home Assistant URL and token in Settings'
            });
        }
        const response = await fetch(`${haUrl}/api/states`, {
            headers: {
                'Authorization': `Bearer ${haToken}`,
                'Content-Type': 'application/json'
            }
        });
        if (!response.ok) {
            throw new Error(`HA API error: ${response.status} ${response.statusText}`);
        }
        const allEntities = await response.json();
        const orderedEntities = entityIds
            .map((entityId) => allEntities.find((entity) => entity.entity_id === entityId))
            .filter((entity) => entity !== undefined);
        res.setHeader('Content-Type', 'application/json');
        res.json(orderedEntities);
    }
    catch (error) {
        console.error('Error fetching area entities:', error);
        res.status(503).json({
            error: 'Failed to fetch entities',
            message: error?.message || 'Unknown error'
        });
    }
});
app.delete('/api/areas/:id', writeLimiter, csrfProtection, authenticate, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({
            error: 'Forbidden',
            message: 'Only admin users can delete areas'
        });
    }
    try {
        const { id } = req.params;
        const existing = db.prepare('SELECT * FROM areas WHERE id = ?').get(id);
        if (!existing) {
            return res.status(404).json({ error: 'Area not found' });
        }
        const deletedAreaName = existing.name;
        (0, websocket_events_1.notifyClientsWithArea)(db, id, websocket_events_1.EVENT_TYPES.AREA_REMOVED, {
            areaId: id,
            name: deletedAreaName,
            message: 'Area has been removed by admin'
        });
        db.prepare('DELETE FROM areas WHERE id = ?').run(id);
        res.json({ success: true });
    }
    catch (error) {
        console.error('Error deleting area:', error);
        res.status(500).json({ error: 'Failed to delete area' });
    }
});
app.get('/api/dashboards', readLimiter, authenticate, (_req, res) => {
    res.json([
        { dashboard_id: 'default', name: 'Default Dashboard' },
        { dashboard_id: 'mobile', name: 'Mobile Dashboard' }
    ]);
});
app.post('/api/admin/login', authLimiter, (req, res) => {
    const { username, password } = req.body;
    const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'test123';
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        const payload = {
            username,
            role: 'admin',
            iat: Math.floor(Date.now() / 1000)
        };
        const token = jsonwebtoken_1.default.sign(payload, JWT_SECRET, {
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
    }
    else {
        logger.warn(`Failed login attempt for user: ${username}`);
        res.status(401).json({ error: 'Invalid credentials. Only admin user is allowed.' });
    }
});
app.post('/api/config/ha', writeLimiter, csrfProtection, authenticate, (req, res) => {
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
    }
    catch (error) {
        console.error('Error saving HA config:', error);
        res.status(500).json({ error: 'Failed to save configuration' });
    }
});
app.get('/api/config/ha', readLimiter, authenticate, (_req, res) => {
    if (_req.user.role !== 'admin') {
        return res.status(403).json({
            error: 'Forbidden',
            message: 'Only admin users can view Home Assistant configuration'
        });
    }
    try {
        const haConfig = getHAConfig();
        res.json(haConfig);
    }
    catch (error) {
        console.error('Error reading HA config:', error);
        res.status(500).json({ error: 'Failed to read configuration' });
    }
});
app.get('/api/auth/verify', authLimiter, (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
        return res.status(401).json({
            valid: false,
            error: 'No token provided'
        });
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET, {
            issuer: 'hasync-backend',
            audience: 'hasync-client'
        });
        logger.info(`Token verified for user: ${decoded.username}`);
        res.json({
            valid: true,
            user: {
                username: decoded.username,
                role: decoded.role
            },
            expiresAt: new Date(decoded.exp * 1000).toISOString()
        });
    }
    catch (error) {
        logger.warn(`Token verification failed: ${error.message}`);
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                valid: false,
                error: 'Token expired',
                expiredAt: error.expiredAt
            });
        }
        else if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                valid: false,
                error: 'Invalid token signature'
            });
        }
        else {
            return res.status(401).json({
                valid: false,
                error: 'Token validation failed'
            });
        }
    }
});
app.get('/api/clients', readLimiter, authenticate, (_req, res) => {
    if (_req.user.role !== 'admin') {
        return res.status(403).json({
            error: 'Forbidden',
            message: 'Only admin users can view all clients'
        });
    }
    try {
        if (db) {
            const clients = db.prepare(`
        SELECT
          c.id,
          c.name,
          c.device_type,
          c.created_at,
          c.last_seen,
          c.assigned_areas
        FROM clients c
        WHERE c.is_active = ?
      `).all(1);
            const clientsWithAreas = clients.map((client) => {
                const assignedAreaIds = client.assigned_areas ? JSON.parse(client.assigned_areas) : [];
                const assignedAreas = assignedAreaIds.map((areaId) => {
                    const area = db.prepare('SELECT id, name, entity_ids, is_enabled FROM areas WHERE id = ?').get(areaId);
                    if (area) {
                        return {
                            id: area.id,
                            name: area.name,
                            entityIds: area.entity_ids ? JSON.parse(area.entity_ids) : [],
                            isEnabled: area.is_enabled === 1
                        };
                    }
                    return null;
                }).filter((area) => area !== null);
                return {
                    id: client.id,
                    name: client.name,
                    deviceType: client.device_type,
                    assignedAreas,
                    createdAt: client.created_at,
                    lastSeenAt: client.last_seen
                };
            });
            res.json(clientsWithAreas || []);
        }
        else {
            res.json([]);
        }
    }
    catch (error) {
        console.error('Error fetching clients:', error);
        res.status(500).json({ error: 'Failed to fetch clients' });
    }
});
app.get('/api/clients/me', readLimiter, authenticate, (req, res) => {
    try {
        const clientId = req.user.clientId || req.user.id;
        if (!clientId) {
            return res.status(401).json({
                error: 'Invalid token',
                message: 'Client ID not found in token'
            });
        }
        const client = db.prepare(`
      SELECT
        id,
        name,
        device_type,
        assigned_areas,
        created_at,
        last_seen
      FROM clients
      WHERE id = ? AND is_active = ?
    `).get(clientId, 1);
        if (!client) {
            return res.status(404).json({
                error: 'Client not found',
                message: 'Your client registration could not be found'
            });
        }
        const assignedAreaIds = client.assigned_areas ? JSON.parse(client.assigned_areas) : [];
        const assignedAreas = assignedAreaIds.map((areaId) => {
            const area = db.prepare('SELECT id, name, entity_ids, is_enabled FROM areas WHERE id = ?').get(areaId);
            if (area) {
                return {
                    id: area.id,
                    name: area.name,
                    entityIds: area.entity_ids ? JSON.parse(area.entity_ids) : [],
                    isEnabled: area.is_enabled === 1
                };
            }
            return null;
        }).filter((area) => area !== null);
        logger.info(`Client ${clientId} fetched own information`);
        res.json({
            id: client.id,
            name: client.name,
            deviceType: client.device_type,
            assignedAreas,
            createdAt: client.created_at,
            lastSeenAt: client.last_seen
        });
    }
    catch (error) {
        logger.error('Error fetching client info:', error);
        res.status(500).json({
            error: 'Failed to fetch client information',
            message: error.message
        });
    }
});
app.get('/api/clients/:id', readLimiter, authenticate, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({
            error: 'Forbidden',
            message: 'Only admin users can view client details'
        });
    }
    try {
        const { id } = req.params;
        const client = db.prepare(`
      SELECT
        id,
        name,
        device_type,
        assigned_areas,
        created_at,
        last_seen
      FROM clients
      WHERE id = ? AND is_active = ?
    `).get(id, 1);
        if (!client) {
            return res.status(404).json({
                error: 'Client not found',
                message: `Client with id '${id}' does not exist`
            });
        }
        const assignedAreaIds = client.assigned_areas ? JSON.parse(client.assigned_areas) : [];
        const assignedAreas = assignedAreaIds.map((areaId) => {
            const area = db.prepare('SELECT id, name, entity_ids, is_enabled FROM areas WHERE id = ?').get(areaId);
            if (area) {
                return {
                    id: area.id,
                    name: area.name,
                    entityIds: area.entity_ids ? JSON.parse(area.entity_ids) : [],
                    isEnabled: area.is_enabled === 1
                };
            }
            return null;
        }).filter((area) => area !== null);
        res.json({
            id: client.id,
            name: client.name,
            deviceType: client.device_type,
            assignedAreas,
            createdAt: client.created_at,
            lastSeenAt: client.last_seen
        });
    }
    catch (error) {
        logger.error('Error fetching client:', error);
        res.status(500).json({
            error: 'Failed to fetch client',
            message: error.message
        });
    }
});
app.put('/api/clients/:id', writeLimiter, csrfProtection, authenticate, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({
            error: 'Forbidden',
            message: 'Only admin users can update clients'
        });
    }
    try {
        const { id } = req.params;
        const { name, assignedAreas } = req.body;
        const existing = db.prepare('SELECT * FROM clients WHERE id = ? AND is_active = ?').get(id, 1);
        if (!existing) {
            return res.status(404).json({
                error: 'Client not found',
                message: `Client with id '${id}' does not exist`
            });
        }
        if (name && !database_security_1.InputSanitizer.validateAreaName(name)) {
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
        const oldAssignedAreas = existing.assigned_areas ? JSON.parse(existing.assigned_areas) : [];
        const newAssignedAreas = assignedAreas || oldAssignedAreas;
        const addedAreas = newAssignedAreas.filter((areaId) => !oldAssignedAreas.includes(areaId));
        const removedAreas = oldAssignedAreas.filter((areaId) => !newAssignedAreas.includes(areaId));
        const sanitizedName = name ? database_security_1.InputSanitizer.sanitizeString(name, 100) : existing.name;
        const assigned_areas_json = JSON.stringify(newAssignedAreas);
        db.prepare('UPDATE clients SET name = ?, assigned_areas = ? WHERE id = ?')
            .run(sanitizedName, assigned_areas_json, id);
        if (addedAreas.length > 0 || removedAreas.length > 0) {
            addedAreas.forEach((areaId) => {
                const area = db.prepare('SELECT id, name FROM areas WHERE id = ?').get(areaId);
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
            removedAreas.forEach((areaId) => {
                const area = db.prepare('SELECT id, name FROM areas WHERE id = ?').get(areaId);
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
        const updated = db.prepare(`
      SELECT id, name, device_type, assigned_areas, created_at, last_seen
      FROM clients
      WHERE id = ?
    `).get(id);
        const assignedAreaIds = updated.assigned_areas ? JSON.parse(updated.assigned_areas) : [];
        const assignedAreasDetails = assignedAreaIds.map((areaId) => {
            const area = db.prepare('SELECT id, name, entity_ids, is_enabled FROM areas WHERE id = ?').get(areaId);
            if (area) {
                return {
                    id: area.id,
                    name: area.name,
                    entityIds: area.entity_ids ? JSON.parse(area.entity_ids) : [],
                    isEnabled: area.is_enabled === 1
                };
            }
            return null;
        }).filter((area) => area !== null);
        logger.info(`Client ${id} updated by admin ${req.user.username}`);
        res.json({
            id: updated.id,
            name: updated.name,
            deviceType: updated.device_type,
            assignedAreas: assignedAreasDetails,
            createdAt: updated.created_at,
            lastSeenAt: updated.last_seen
        });
    }
    catch (error) {
        logger.error('Error updating client:', error);
        res.status(500).json({
            error: 'Failed to update client',
            message: error.message
        });
    }
});
app.delete('/api/clients/:id', writeLimiter, csrfProtection, authenticate, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({
            error: 'Forbidden',
            message: 'Only admin users can delete clients'
        });
    }
    try {
        const { id } = req.params;
        const existing = db.prepare('SELECT * FROM clients WHERE id = ? AND is_active = ?').get(id, 1);
        if (!existing) {
            return res.status(404).json({
                error: 'Client not found',
                message: `Client with id '${id}' does not exist`
            });
        }
        db.prepare('UPDATE clients SET is_active = ? WHERE id = ?').run(0, id);
        io.emit('client_deleted', {
            clientId: id,
            timestamp: new Date().toISOString()
        });
        const sockets = io.sockets.sockets;
        sockets.forEach((socket) => {
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
    }
    catch (error) {
        logger.error('Error deleting client:', error);
        res.status(500).json({
            error: 'Failed to delete client',
            message: error.message
        });
    }
});
app.post('/api/clients/:id/revoke', writeLimiter, csrfProtection, authenticate, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({
            error: 'Forbidden',
            message: 'Only admin users can revoke client tokens'
        });
    }
    try {
        const { id } = req.params;
        const existing = db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
        if (!existing) {
            return res.status(404).json({
                error: 'Client not found',
                message: `Client with id '${id}' does not exist`
            });
        }
        db.prepare('UPDATE clients SET token_hash = NULL WHERE id = ?').run(id);
        io.emit('token_revoked', {
            clientId: id,
            reason: 'Token revoked by administrator',
            timestamp: new Date().toISOString()
        });
        const sockets = io.sockets.sockets;
        sockets.forEach((socket) => {
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
    }
    catch (error) {
        logger.error('Error revoking client token:', error);
        res.status(500).json({
            error: 'Failed to revoke client token',
            message: error.message
        });
    }
});
app.use('/api/admin', (0, admin_1.createAdminRouter)(db));
app.use('/api/auth', (0, auth_1.createAuthRouter)(null));
app.use(errorHandler_1.notFoundHandler);
app.use(errorHandler_1.errorHandler);
io.use(socketAuth_1.socketAuthMiddleware);
io.on('connection', (socket) => {
    const user = socket.user;
    app.get('/api/user/data-export', readLimiter, authenticate, (req, res) => {
        try {
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
        }
        catch (error) {
            console.error('[GDPR] Data export error:', error);
            res.status(500).json({ error: 'Failed to export user data', message: error.message });
        }
    });
    app.delete('/api/user/data-delete', writeLimiter, csrfProtection, authenticate, (req, res) => {
        try {
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
        }
        catch (error) {
            console.error('[GDPR] Data deletion error:', error);
            res.status(500).json({ error: 'Failed to delete user data', message: error.message });
        }
    });
    app.get('/api/user/consent', readLimiter, authenticate, (req, res) => {
        try {
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
        }
        catch (error) {
            console.error('[GDPR] Get consent error:', error);
            res.status(500).json({ error: 'Failed to retrieve consent', message: error.message });
        }
    });
    app.post('/api/user/consent', writeLimiter, csrfProtection, authenticate, (req, res) => {
        try {
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
    `).run(userId, data_processing ? 1 : 0, analytics ? 1 : 0, marketing ? 1 : 0, consentDate, ipAddress);
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
        }
        catch (error) {
            console.error('[GDPR] Update consent error:', error);
            res.status(500).json({ error: 'Failed to update consent', message: error.message });
        }
    });
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
    const connectionInfo = {
        socketId: socket.id,
        username: user?.username,
        ip: socket.handshake.address,
        connectedAt: new Date().toISOString(),
    };
    const clientId = socket.clientId;
    if (clientId) {
        (0, websocket_events_1.registerClientSocket)(clientId, socket);
        logger.info(`[WebSocket] Client ${clientId} registered for real-time notifications`);
    }
    socket.on('subscribe', (data) => {
        try {
            const validated = (0, socketValidation_1.validateSubscribe)(data);
            const roomName = (0, socketValidation_1.validateRoomName)(validated.type);
            socket.join(roomName);
            console.log(`[WebSocket] ${user?.username} subscribed to: ${roomName}`);
            socket.emit('subscribed', {
                type: validated.type,
                status: 'ok',
                timestamp: new Date().toISOString(),
            });
        }
        catch (error) {
            console.error('[WebSocket] Subscribe validation error:', error.message);
            socket.emit('error', {
                type: 'VALIDATION_ERROR',
                message: 'Invalid subscription data',
                details: error.message,
            });
        }
    });
    socket.on('unsubscribe', (data) => {
        try {
            const validated = (0, socketValidation_1.validateSubscribe)(data);
            const roomName = (0, socketValidation_1.validateRoomName)(validated.type);
            socket.leave(roomName);
            console.log(`[WebSocket] ${user?.username} unsubscribed from: ${roomName}`);
            socket.emit('unsubscribed', {
                type: validated.type,
                status: 'ok',
                timestamp: new Date().toISOString(),
            });
        }
        catch (error) {
            console.error('[WebSocket] Unsubscribe validation error:', error.message);
            socket.emit('error', {
                type: 'VALIDATION_ERROR',
                message: 'Invalid unsubscribe data',
                details: error.message,
            });
        }
    });
    socket.on('entity_update', (data) => {
        try {
            const validated = (0, socketValidation_1.validateEntityUpdate)(data);
            io.to('entities').emit('entity_update', {
                ...validated,
                updatedBy: user?.username,
                timestamp: new Date().toISOString(),
            });
            console.log(`[WebSocket] Entity update from ${user?.username}:`, validated.entityId);
        }
        catch (error) {
            console.error('[WebSocket] Entity update validation error:', error.message);
            socket.emit('error', {
                type: 'VALIDATION_ERROR',
                message: 'Invalid entity update data',
                details: error.message,
            });
        }
    });
    socket.on('pairing_request', (data) => {
        try {
            const validated = (0, socketValidation_1.validatePairing)(data);
            if (user?.role !== 'admin') {
                socket.emit('error', {
                    type: 'UNAUTHORIZED',
                    message: 'Only admin users can approve pairing requests',
                });
                return;
            }
            io.emit('pairing_request', {
                ...validated,
                requestedBy: user?.username,
                timestamp: new Date().toISOString(),
            });
            console.log(`[WebSocket] Pairing request from ${user?.username}`);
        }
        catch (error) {
            console.error('[WebSocket] Pairing validation error:', error.message);
            socket.emit('error', {
                type: 'VALIDATION_ERROR',
                message: 'Invalid pairing data',
                details: error.message,
            });
        }
    });
    socket.on('config_update', (data) => {
        try {
            const validated = (0, socketValidation_1.validateConfigUpdate)(data);
            if (user?.role !== 'admin') {
                socket.emit('error', {
                    type: 'UNAUTHORIZED',
                    message: 'Only admin users can update configuration',
                });
                return;
            }
            io.emit('config_update', {
                ...validated,
                updatedBy: user?.username,
                timestamp: new Date().toISOString(),
            });
            console.log(`[WebSocket] Config update from ${user?.username}:`, validated.key);
        }
        catch (error) {
            console.error('[WebSocket] Config update validation error:', error.message);
            socket.emit('error', {
                type: 'VALIDATION_ERROR',
                message: 'Invalid config update data',
                details: error.message,
            });
        }
    });
    socket.on('ping', () => {
        socket.emit('pong', { timestamp: new Date().toISOString() });
    });
    socket.on('disconnect', (reason) => {
        console.log(`[WebSocket] User disconnected: ${user?.username} (${socket.id}), reason: ${reason}`);
        const clientId = socket.clientId;
        if (clientId) {
            (0, websocket_events_1.unregisterClientSocket)(clientId);
            logger.info(`[WebSocket] Client ${clientId} unregistered on disconnect`);
        }
        const disconnectInfo = {
            ...connectionInfo,
            disconnectedAt: new Date().toISOString(),
            reason,
        };
        console.log('[WebSocket] Connection info:', disconnectInfo);
    });
    socket.on('error', (error) => {
        console.error(`[WebSocket] Socket error for ${user?.username}:`, error);
    });
});
initializeHAService();
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
    }
    else {
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
if (httpRedirectServer && tlsOptions.redirectHttp) {
    httpRedirectServer.listen(tlsOptions.httpPort, () => {
        console.log(`✓ HTTP redirect server listening on port ${tlsOptions.httpPort}`);
        console.log(`  HTTP requests will be redirected to HTTPS port ${tlsOptions.port}`);
        console.log('');
    });
}
process.on('SIGTERM', () => {
    console.log('SIGTERM received, closing servers...');
    mainServer.close(() => {
        if (httpRedirectServer) {
            httpRedirectServer.close(() => {
                if (db)
                    db.close();
                process.exit(0);
            });
        }
        else {
            if (db)
                db.close();
            process.exit(0);
        }
    });
});
//# sourceMappingURL=index-simple.js.map