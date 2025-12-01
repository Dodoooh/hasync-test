/**
 * HAsync Backend Server with Comprehensive Logging
 * Production-ready version with Winston and Morgan integration
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import { createServer } from 'http';
import { createServer as createHttpsServer } from 'https';
import { Server as SocketIOServer } from 'socket.io';
import Database from 'better-sqlite3';
import { join } from 'path';
import { readFileSync, existsSync } from 'fs';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yaml';
import winston from 'winston';
import {
  getTLSOptionsFromEnv,
  loadTLSCertificates,
  createHTTPSOptions,
  validateTLSConfig
} from './config/tls';
import { httpsRedirect, securityHeaders } from './middleware/https-redirect';

// Winston Logger Configuration
const LOGS_DIR = process.env.LOGS_DIR || join(__dirname, '../logs');
const logLevel = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          return `${timestamp} [${level}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
        })
      )
    }),
    new winston.transports.File({ filename: join(LOGS_DIR, 'error.log'), level: 'error', maxsize: 5242880, maxFiles: 5 }),
    new winston.transports.File({ filename: join(LOGS_DIR, 'combined.log'), maxsize: 5242880, maxFiles: 5 }),
    new winston.transports.File({ filename: join(LOGS_DIR, 'http.log'), level: 'http', maxsize: 5242880, maxFiles: 5 }),
  ],
});

// Load TLS configuration
const tlsOptions = getTLSOptionsFromEnv();
validateTLSConfig(tlsOptions);

const DATABASE_PATH = process.env.DATABASE_PATH || '/data/app01.db';

// CORS configuration
const httpOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];
const allowedOrigins = httpOrigins.flatMap(origin => [origin, origin.replace('http://', 'https://')]);

const app = express();

// Morgan HTTP logging
app.use(morgan('combined', {
  stream: { write: (message) => logger.http(message.trim()) },
  skip: (req) => process.env.NODE_ENV === 'production' && req.url === '/api/health'
}));

// Request ID middleware
app.use((req: any, res, next) => {
  req.id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  res.setHeader('X-Request-ID', req.id);
  next();
});

// Request timing middleware
app.use((req: any, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (duration > 1000) {
      logger.warn('Slow request', { method: req.method, url: req.url, duration: `${duration}ms`, statusCode: res.statusCode });
    }
  });
  next();
});

// Security monitoring middleware
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

// Create servers
let mainServer: any;
let httpRedirectServer: any;

if (tlsOptions.enabled) {
  const tlsConfig = loadTLSCertificates(tlsOptions);
  const httpsOptions = createHTTPSOptions(tlsConfig!);
  mainServer = createHttpsServer(httpsOptions, app);

  if (tlsOptions.redirectHttp) {
    const redirectApp = express();
    redirectApp.use(httpsRedirect({ enabled: true, httpsPort: tlsOptions.port, excludePaths: ['/api/health'] }));
    httpRedirectServer = createServer(redirectApp);
  }
} else {
  mainServer = createServer(app);
}

const io = new SocketIOServer(mainServer, {
  cors: {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400
  }
});

// Rate limiters
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many authentication attempts', retryAfter: '15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

const readLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

// Security headers
app.use(helmet({
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

// CORS
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400
}));

app.use(express.json());

if (tlsOptions.enabled) {
  app.use(securityHeaders());
}

// Initialize database
let db: any;
try {
  db = new Database(DATABASE_PATH);
  logger.info('Database connected', { path: DATABASE_PATH });
  console.log(`✓ Database connected: ${DATABASE_PATH}`);

  const schemaPath = join(__dirname, 'database', 'schema.sql');
  if (existsSync(schemaPath)) {
    const schema = readFileSync(schemaPath, 'utf8');
    db.exec(schema);
    logger.info('Database schema initialized');
    console.log('✓ Database schema initialized');
  }

  const areasMigrationPath = join(__dirname, 'database', 'schema-migration-areas.sql');
  if (existsSync(areasMigrationPath)) {
    const areasMigration = readFileSync(areasMigrationPath, 'utf8');
    db.exec(areasMigration);
    logger.info('Areas migration applied');
    console.log('✓ Areas migration applied');
  }
} catch (error: any) {
  logger.error('Database initialization failed', { error: error.message, stack: error.stack });
  console.error('✗ Database error:', error);
}

// Swagger
try {
  const swaggerPath = join(__dirname, 'swagger.yaml');
  if (existsSync(swaggerPath)) {
    const swaggerDocument = YAML.parse(readFileSync(swaggerPath, 'utf8'));
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'HAsync API Documentation'
    }));
    logger.info('Swagger UI initialized');
    console.log('✓ Swagger UI available at /api-docs');
  }
} catch (error: any) {
  logger.warn('Failed to load Swagger documentation', { error: error.message });
  console.warn('⚠ Failed to load Swagger documentation:', error);
}

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: { api: 'running', database: db ? 'connected' : 'disconnected', websocket: 'initializing' },
    version: '1.0.0'
  });
});

// Pairing
app.post('/api/pairing/create', authLimiter, (req, res) => {
  const pin = Math.floor(100000 + Math.random() * 900000).toString();
  const sessionId = `pairing_${Date.now()}`;
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  logger.info('Pairing session created', { sessionId, pin, ip: req.ip });

  res.json({ id: sessionId, pin, expiresAt, status: 'pending' });
});

// Get HA config
const getHAConfig = (): { url?: string; token?: string } => {
  try {
    if (db) {
      const config: any = db.prepare('SELECT value FROM configuration WHERE key = ?').get('ha_config');
      if (config && config.value) {
        const parsed = JSON.parse(config.value);
        logger.debug('HA config loaded from database', { url: parsed.url });
        return parsed;
      }
    }
  } catch (error: any) {
    logger.error('Error reading HA config', { error: error.message });
  }

  return {
    url: process.env.HOMEASSISTANT_URL,
    token: process.env.HOMEASSISTANT_TOKEN
  };
};

// Entities
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
  } catch (error: any) {
    logger.error('Failed to fetch entities', { error: error.message, ip: req.ip });
    res.status(503).json({ error: 'Failed to fetch entities from Home Assistant' });
  }
});

// Areas endpoints (simplified for brevity - include logging in all)
app.get('/api/areas', readLimiter, (req, res) => {
  try {
    const { enabled } = req.query;
    let query = 'SELECT * FROM areas';
    let params: any[] = [];

    if (enabled !== undefined) {
      query += ' WHERE is_enabled = ?';
      params.push(enabled === 'true' ? 1 : 0);
    }

    const areas = db.prepare(query).all(...params);
    const result = areas.map((area: any) => ({
      id: area.id,
      name: area.name,
      entityIds: area.entity_ids ? JSON.parse(area.entity_ids) : [],
      isEnabled: area.is_enabled === 1
    }));

    logger.debug('Areas fetched', { count: result.length, enabled });
    res.json(result);
  } catch (error: any) {
    logger.error('Error fetching areas', { error: error.message });
    res.json([]);
  }
});

// Login
app.post('/api/auth/login', authLimiter, (req, res) => {
  const { username, password } = req.body;
  const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'test123';

  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    const token = Buffer.from(`${username}:${Date.now()}`).toString('base64');
    logger.info('Login successful', { username, ip: req.ip });
    res.json({ token, user: { username, role: 'admin' } });
  } else {
    logger.warn('Login failed', { username, ip: req.ip, reason: 'Invalid credentials' });
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// Save HA config
app.post('/api/config/ha', writeLimiter, (req, res) => {
  try {
    const { url, token } = req.body;
    const config = JSON.stringify({ url, token });

    db.prepare('INSERT OR REPLACE INTO configuration (key, value) VALUES (?, ?)').run('ha_config', config);

    logger.info('HA config saved', { url, ip: req.ip });
    res.json({ success: true });
  } catch (error: any) {
    logger.error('Failed to save HA config', { error: error.message, ip: req.ip });
    res.status(500).json({ error: 'Failed to save configuration' });
  }
});

// Get HA config
app.get('/api/config/ha', readLimiter, (_req, res) => {
  try {
    const haConfig = getHAConfig();
    res.json(haConfig);
  } catch (error: any) {
    logger.error('Failed to read HA config', { error: error.message });
    res.status(500).json({ error: 'Failed to read configuration' });
  }
});

// Verify token
app.get('/api/auth/verify', authLimiter, (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  res.json({ valid: !!token });
});

// Get clients
app.get('/api/clients', readLimiter, (_req, res) => {
  try {
    const clients = db ? db.prepare('SELECT * FROM clients WHERE is_active = ?').all(1) : [];
    res.json(clients || []);
  } catch (error: any) {
    logger.error('Error fetching clients', { error: error.message });
    res.json([]);
  }
});

// 404 handler
app.use((req, res) => {
  logger.warn('Route not found', { method: req.method, path: req.path, ip: req.ip });
  res.status(404).json({ error: 'Not found', path: req.path });
});

// Error handler
app.use((err: any, req: any, res: any, _next: any) => {
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

// WebSocket
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

// Start server
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

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, initiating shutdown');
  mainServer.close(() => {
    if (httpRedirectServer) {
      httpRedirectServer.close(() => {
        if (db) db.close();
        logger.info('Shutdown complete');
        process.exit(0);
      });
    } else {
      if (db) db.close();
      logger.info('Shutdown complete');
      process.exit(0);
    }
  });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: error.message, stack: error.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason: any) => {
  logger.error('Unhandled rejection', { reason });
});
