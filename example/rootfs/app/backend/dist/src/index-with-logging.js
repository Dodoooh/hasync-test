"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const morgan_1 = __importDefault(require("morgan"));
const http_1 = require("http");
const https_1 = require("https");
const socket_io_1 = require("socket.io");
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const path_1 = require("path");
const fs_1 = require("fs");
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const yaml_1 = __importDefault(require("yaml"));
const winston_1 = __importDefault(require("winston"));
const tls_1 = require("./config/tls");
const https_redirect_1 = require("./middleware/https-redirect");
const LOGS_DIR = process.env.LOGS_DIR || (0, path_1.join)(__dirname, '../logs');
const logLevel = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');
const logger = winston_1.default.createLogger({
    level: logLevel,
    format: winston_1.default.format.combine(winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston_1.default.format.errors({ stack: true }), winston_1.default.format.json()),
    transports: [
        new winston_1.default.transports.Console({
            format: winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.printf(({ timestamp, level, message, ...meta }) => {
                return `${timestamp} [${level}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
            }))
        }),
        new winston_1.default.transports.File({ filename: (0, path_1.join)(LOGS_DIR, 'error.log'), level: 'error', maxsize: 5242880, maxFiles: 5 }),
        new winston_1.default.transports.File({ filename: (0, path_1.join)(LOGS_DIR, 'combined.log'), maxsize: 5242880, maxFiles: 5 }),
        new winston_1.default.transports.File({ filename: (0, path_1.join)(LOGS_DIR, 'http.log'), level: 'http', maxsize: 5242880, maxFiles: 5 }),
    ],
});
const tlsOptions = (0, tls_1.getTLSOptionsFromEnv)();
(0, tls_1.validateTLSConfig)(tlsOptions);
const DATABASE_PATH = process.env.DATABASE_PATH || '/data/app01.db';
const httpOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];
const allowedOrigins = httpOrigins.flatMap(origin => [origin, origin.replace('http://', 'https://')]);
const app = (0, express_1.default)();
app.use((0, morgan_1.default)('combined', {
    stream: { write: (message) => logger.http(message.trim()) },
    skip: (req) => process.env.NODE_ENV === 'production' && req.url === '/api/health'
}));
app.use((req, res, next) => {
    req.id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    res.setHeader('X-Request-ID', req.id);
    next();
});
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        if (duration > 1000) {
            logger.warn('Slow request', { method: req.method, url: req.url, duration: `${duration}ms`, statusCode: res.statusCode });
        }
    });
    next();
});
app.use((req, res, next) => {
    const suspiciousPatterns = [/\.\./, /<script>/i, /union.*select/i, /eval\(/i];
    const url = req.url;
    const body = JSON.stringify(req.body);
    for (const pattern of suspiciousPatterns) {
        if (pattern.test(url) || pattern.test(body)) {
            logger.error('Suspicious request detected', {
                pattern: pattern.toString(),
                method: req.method,
                url,
                ip: req.ip,
                userAgent: req.get('user-agent')
            });
            break;
        }
    }
    res.on('finish', () => {
        if (res.statusCode === 429) {
            logger.warn('Rate limit exceeded', { method: req.method, url, ip: req.ip });
        }
    });
    next();
});
let mainServer;
let httpRedirectServer;
if (tlsOptions.enabled) {
    const tlsConfig = (0, tls_1.loadTLSCertificates)(tlsOptions);
    const httpsOptions = (0, tls_1.createHTTPSOptions)(tlsConfig);
    mainServer = (0, https_1.createServer)(httpsOptions, app);
    if (tlsOptions.redirectHttp) {
        const redirectApp = (0, express_1.default)();
        redirectApp.use((0, https_redirect_1.httpsRedirect)({ enabled: true, httpsPort: tlsOptions.port, excludePaths: ['/api/health'] }));
        httpRedirectServer = (0, http_1.createServer)(redirectApp);
    }
}
else {
    mainServer = (0, http_1.createServer)(app);
}
const io = new socket_io_1.Server(mainServer, {
    cors: {
        origin: (origin, callback) => {
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true);
            }
            else {
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
    max: 5,
    message: { error: 'Too many authentication attempts', retryAfter: '15 minutes' },
    standardHeaders: true,
    legacyHeaders: false,
});
const writeLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
});
const readLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
});
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
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    frameguard: { action: 'deny' },
    noSniff: true,
    referrerPolicy: { policy: 'no-referrer' },
}));
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        }
        else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400
}));
app.use(express_1.default.json());
if (tlsOptions.enabled) {
    app.use((0, https_redirect_1.securityHeaders)());
}
let db;
try {
    db = new better_sqlite3_1.default(DATABASE_PATH);
    logger.info('Database connected', { path: DATABASE_PATH });
    console.log(`✓ Database connected: ${DATABASE_PATH}`);
    const schemaPath = (0, path_1.join)(__dirname, 'database', 'schema.sql');
    if ((0, fs_1.existsSync)(schemaPath)) {
        const schema = (0, fs_1.readFileSync)(schemaPath, 'utf8');
        db.exec(schema);
        logger.info('Database schema initialized');
        console.log('✓ Database schema initialized');
    }
    const areasMigrationPath = (0, path_1.join)(__dirname, 'database', 'schema-migration-areas.sql');
    if ((0, fs_1.existsSync)(areasMigrationPath)) {
        const areasMigration = (0, fs_1.readFileSync)(areasMigrationPath, 'utf8');
        db.exec(areasMigration);
        logger.info('Areas migration applied');
        console.log('✓ Areas migration applied');
    }
}
catch (error) {
    logger.error('Database initialization failed', { error: error.message, stack: error.stack });
    console.error('✗ Database error:', error);
}
try {
    const swaggerPath = (0, path_1.join)(__dirname, 'swagger.yaml');
    if ((0, fs_1.existsSync)(swaggerPath)) {
        const swaggerDocument = yaml_1.default.parse((0, fs_1.readFileSync)(swaggerPath, 'utf8'));
        app.use('/api-docs', swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(swaggerDocument, {
            customCss: '.swagger-ui .topbar { display: none }',
            customSiteTitle: 'HAsync API Documentation'
        }));
        logger.info('Swagger UI initialized');
        console.log('✓ Swagger UI available at /api-docs');
    }
}
catch (error) {
    logger.warn('Failed to load Swagger documentation', { error: error.message });
    console.warn('⚠ Failed to load Swagger documentation:', error);
}
app.get('/api/health', (_req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: { api: 'running', database: db ? 'connected' : 'disconnected', websocket: 'initializing' },
        version: '1.0.0'
    });
});
app.post('/api/pairing/create', authLimiter, (req, res) => {
    const pin = Math.floor(100000 + Math.random() * 900000).toString();
    const sessionId = `pairing_${Date.now()}`;
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    logger.info('Pairing session created', { sessionId, pin, ip: req.ip });
    res.json({ id: sessionId, pin, expiresAt, status: 'pending' });
});
const getHAConfig = () => {
    try {
        if (db) {
            const config = db.prepare('SELECT value FROM configuration WHERE key = ?').get('ha_config');
            if (config && config.value) {
                const parsed = JSON.parse(config.value);
                logger.debug('HA config loaded from database', { url: parsed.url });
                return parsed;
            }
        }
    }
    catch (error) {
        logger.error('Error reading HA config', { error: error.message });
    }
    return {
        url: process.env.HOMEASSISTANT_URL,
        token: process.env.HOMEASSISTANT_TOKEN
    };
};
app.get('/api/entities', readLimiter, async (req, res) => {
    try {
        const haConfig = getHAConfig();
        if (!haConfig.url || !haConfig.token) {
            logger.warn('HA not configured', { ip: req.ip });
            return res.status(503).json({ error: 'Home Assistant not configured' });
        }
        const response = await fetch(`${haConfig.url}/api/states`, {
            headers: {
                'Authorization': `Bearer ${haConfig.token}`,
                'Content-Type': 'application/json'
            }
        });
        if (!response.ok) {
            throw new Error(`HA API error: ${response.status}`);
        }
        const entities = await response.json();
        logger.debug('Fetched entities from HA', { count: entities.length });
        res.json(entities);
    }
    catch (error) {
        logger.error('Failed to fetch entities', { error: error.message, ip: req.ip });
        res.status(503).json({ error: 'Failed to fetch entities from Home Assistant' });
    }
});
app.get('/api/areas', readLimiter, (req, res) => {
    try {
        const { enabled } = req.query;
        let query = 'SELECT * FROM areas';
        let params = [];
        if (enabled !== undefined) {
            query += ' WHERE is_enabled = ?';
            params.push(enabled === 'true' ? 1 : 0);
        }
        const areas = db.prepare(query).all(...params);
        const result = areas.map((area) => ({
            id: area.id,
            name: area.name,
            entityIds: area.entity_ids ? JSON.parse(area.entity_ids) : [],
            isEnabled: area.is_enabled === 1
        }));
        logger.debug('Areas fetched', { count: result.length, enabled });
        res.json(result);
    }
    catch (error) {
        logger.error('Error fetching areas', { error: error.message });
        res.json([]);
    }
});
app.post('/api/auth/login', authLimiter, (req, res) => {
    const { username, password } = req.body;
    const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'test123';
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        const token = Buffer.from(`${username}:${Date.now()}`).toString('base64');
        logger.info('Login successful', { username, ip: req.ip });
        res.json({ token, user: { username, role: 'admin' } });
    }
    else {
        logger.warn('Login failed', { username, ip: req.ip, reason: 'Invalid credentials' });
        res.status(401).json({ error: 'Invalid credentials' });
    }
});
app.post('/api/config/ha', writeLimiter, (req, res) => {
    try {
        const { url, token } = req.body;
        const config = JSON.stringify({ url, token });
        db.prepare('INSERT OR REPLACE INTO configuration (key, value) VALUES (?, ?)').run('ha_config', config);
        logger.info('HA config saved', { url, ip: req.ip });
        res.json({ success: true });
    }
    catch (error) {
        logger.error('Failed to save HA config', { error: error.message, ip: req.ip });
        res.status(500).json({ error: 'Failed to save configuration' });
    }
});
app.get('/api/config/ha', readLimiter, (_req, res) => {
    try {
        const haConfig = getHAConfig();
        res.json(haConfig);
    }
    catch (error) {
        logger.error('Failed to read HA config', { error: error.message });
        res.status(500).json({ error: 'Failed to read configuration' });
    }
});
app.get('/api/auth/verify', authLimiter, (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    res.json({ valid: !!token });
});
app.get('/api/clients', readLimiter, (_req, res) => {
    try {
        const clients = db ? db.prepare('SELECT * FROM clients WHERE is_active = ?').all(1) : [];
        res.json(clients || []);
    }
    catch (error) {
        logger.error('Error fetching clients', { error: error.message });
        res.json([]);
    }
});
app.use((req, res) => {
    logger.warn('Route not found', { method: req.method, path: req.path, ip: req.ip });
    res.status(404).json({ error: 'Not found', path: req.path });
});
app.use((err, req, res, _next) => {
    logger.error('Application error', {
        error: err.message,
        stack: err.stack,
        method: req.method,
        url: req.url,
        ip: req.ip
    });
    const message = process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message;
    res.status(500).json({ error: 'Internal server error', message });
});
io.on('connection', (socket) => {
    logger.info('WebSocket client connected', { socketId: socket.id, ip: socket.handshake.address });
    socket.on('subscribe', (data) => {
        logger.debug('Client subscribed', { socketId: socket.id, data });
        socket.emit('connected', { status: 'ok' });
    });
    socket.on('disconnect', () => {
        logger.info('WebSocket client disconnected', { socketId: socket.id });
    });
    socket.on('error', (error) => {
        logger.error('WebSocket error', { socketId: socket.id, error: error.message });
    });
});
mainServer.listen(tlsOptions.port, () => {
    logger.info('Server started', {
        port: tlsOptions.port,
        protocol: tlsOptions.enabled ? 'HTTPS' : 'HTTP',
        environment: process.env.NODE_ENV || 'development',
        logLevel: logger.level,
    });
    console.log('');
    console.log('═══════════════════════════════════════════════');
    console.log('  HAsync Backend Server Started');
    console.log('═══════════════════════════════════════════════');
    console.log(`  Protocol:  ${tlsOptions.enabled ? 'HTTPS' : 'HTTP'}`);
    console.log(`  Port:      ${tlsOptions.port}`);
    console.log(`  Log Level: ${logger.level}`);
    console.log('═══════════════════════════════════════════════');
    console.log('');
});
process.on('SIGTERM', () => {
    logger.info('SIGTERM received, initiating shutdown');
    mainServer.close(() => {
        if (httpRedirectServer) {
            httpRedirectServer.close(() => {
                if (db)
                    db.close();
                logger.info('Shutdown complete');
                process.exit(0);
            });
        }
        else {
            if (db)
                db.close();
            logger.info('Shutdown complete');
            process.exit(0);
        }
    });
});
process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', { error: error.message, stack: error.stack });
    process.exit(1);
});
process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', { reason });
});
//# sourceMappingURL=index-with-logging.js.map