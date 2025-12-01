"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const path_1 = require("path");
const fs_1 = require("fs");
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const yaml_1 = __importDefault(require("yaml"));
const middleware_1 = require("./validation/middleware");
const schemas_1 = require("./validation/schemas");
const PORT = process.env.PORT || 8099;
const DATABASE_PATH = process.env.DATABASE_PATH || '/data/app01.db';
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];
const app = (0, express_1.default)();
const server = (0, http_1.createServer)(app);
const io = new socket_io_1.Server(server, {
    cors: {
        origin: (origin, callback) => {
            if (!origin) {
                callback(null, true);
                return;
            }
            if (allowedOrigins.includes(origin)) {
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
const authLimiter = (0, middleware_1.rateLimit)({
    windowMs: 15 * 60 * 1000,
    maxRequests: 5
});
const writeLimiter = (0, middleware_1.rateLimit)({
    windowMs: 15 * 60 * 1000,
    maxRequests: 30
});
const readLimiter = (0, middleware_1.rateLimit)({
    windowMs: 15 * 60 * 1000,
    maxRequests: 100
});
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin) {
            callback(null, true);
            return;
        }
        if (allowedOrigins.includes(origin)) {
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
app.use(express_1.default.json({ limit: '1mb' }));
app.use(middleware_1.securityHeaders);
app.use(middleware_1.sanitizeRequest);
let db;
try {
    db = new better_sqlite3_1.default(DATABASE_PATH);
    console.log(`✓ Database connected: ${DATABASE_PATH}`);
    const schemaPath = (0, path_1.join)(__dirname, 'database', 'schema.sql');
    if ((0, fs_1.existsSync)(schemaPath)) {
        const schema = (0, fs_1.readFileSync)(schemaPath, 'utf8');
        db.exec(schema);
        console.log('✓ Database schema initialized');
    }
    const areasMigrationPath = (0, path_1.join)(__dirname, 'database', 'schema-migration-areas.sql');
    if ((0, fs_1.existsSync)(areasMigrationPath)) {
        const areasMigration = (0, fs_1.readFileSync)(areasMigrationPath, 'utf8');
        db.exec(areasMigration);
        console.log('✓ Areas migration applied');
    }
}
catch (error) {
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
        console.log('✓ Swagger UI available at /api-docs');
    }
}
catch (error) {
    console.warn('⚠ Failed to load Swagger documentation:', error);
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
        version: '1.0.0'
    };
    res.json(health);
});
app.post('/api/pairing/create', authLimiter, (_req, res) => {
    const pin = Math.floor(100000 + Math.random() * 900000).toString();
    const sessionId = `pairing_${Date.now()}`;
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    console.log(`Generated pairing session: ${sessionId}, PIN: ${pin}`);
    res.json({
        id: sessionId,
        pin,
        expiresAt,
        status: 'pending'
    });
});
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
app.get('/api/entities', readLimiter, async (_req, res) => {
    try {
        const haConfig = getHAConfig();
        const haUrl = haConfig.url;
        const haToken = haConfig.token;
        if (!haUrl || !haToken) {
            console.error('HA not configured - no URL or token');
            return res.status(503).json({
                error: 'Home Assistant not configured',
                message: 'Please configure Home Assistant URL and token in Settings'
            });
        }
        console.log(`Fetching entities from ${haUrl}/api/states`);
        const response = await fetch(`${haUrl}/api/states`, {
            headers: {
                'Authorization': `Bearer ${haToken}`,
                'Content-Type': 'application/json'
            }
        });
        if (!response.ok) {
            throw new Error(`HA API error: ${response.status} ${response.statusText}`);
        }
        const entities = await response.json();
        console.log(`✓ Fetched ${entities.length} entities from Home Assistant`);
        res.json(entities);
    }
    catch (error) {
        console.error('Error fetching entities:', error);
        res.status(503).json({
            error: 'Failed to fetch entities from Home Assistant',
            message: error?.message || 'Unknown error'
        });
    }
});
app.get('/api/areas', readLimiter, (0, middleware_1.validateQuery)(schemas_1.areasQuerySchema), (req, res) => {
    try {
        const { enabled } = req.query;
        let query = 'SELECT * FROM areas';
        let params = [];
        if (enabled !== undefined) {
            const enabledValue = enabled === 'true' ? 1 : 0;
            query += ' WHERE is_enabled = ?';
            params.push(enabledValue);
        }
        const areas = db.prepare(query).all(...params);
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
app.post('/api/areas', writeLimiter, (0, middleware_1.validateBody)(schemas_1.createAreaSchema), (req, res) => {
    try {
        const { name, entityIds, isEnabled = true } = req.body;
        const id = `area_${Date.now()}`;
        const entity_ids_json = JSON.stringify(entityIds || []);
        const is_enabled = isEnabled ? 1 : 0;
        db.prepare('INSERT INTO areas (id, name, entity_ids, is_enabled) VALUES (?, ?, ?, ?)')
            .run(id, name, entity_ids_json, is_enabled);
        res.json({
            id,
            name,
            entityIds: entityIds || [],
            isEnabled: isEnabled
        });
    }
    catch (error) {
        console.error('Error creating area:', error);
        res.status(500).json({ error: 'Failed to create area' });
    }
});
app.put('/api/areas/:id', writeLimiter, (0, middleware_1.validateBody)(schemas_1.updateAreaSchema), (req, res) => {
    try {
        const { id } = req.params;
        const { name, entityIds, isEnabled } = req.body;
        const existing = db.prepare('SELECT * FROM areas WHERE id = ?').get(id);
        if (!existing) {
            return res.status(404).json({ error: 'Area not found' });
        }
        const entity_ids_json = JSON.stringify(entityIds || []);
        const is_enabled = isEnabled !== undefined ? (isEnabled ? 1 : 0) : existing.is_enabled;
        db.prepare('UPDATE areas SET name = ?, entity_ids = ?, is_enabled = ? WHERE id = ?')
            .run(name, entity_ids_json, is_enabled, id);
        res.json({
            id,
            name,
            entityIds: entityIds || [],
            isEnabled: is_enabled === 1
        });
    }
    catch (error) {
        console.error('Error updating area:', error);
        res.status(500).json({ error: 'Failed to update area' });
    }
});
app.patch('/api/areas/:id', writeLimiter, (0, middleware_1.validateBody)(schemas_1.patchAreaSchema), (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        const existing = db.prepare('SELECT * FROM areas WHERE id = ?').get(id);
        if (!existing) {
            return res.status(404).json({ error: 'Area not found' });
        }
        const updateFields = [];
        const updateValues = [];
        if (updates.name !== undefined) {
            updateFields.push('name = ?');
            updateValues.push(updates.name);
        }
        if (updates.entityIds !== undefined) {
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
app.patch('/api/areas/:id/toggle', writeLimiter, (0, middleware_1.validateBody)(schemas_1.toggleAreaSchema), (req, res) => {
    try {
        const { id } = req.params;
        const { enabled } = req.body;
        const existing = db.prepare('SELECT * FROM areas WHERE id = ?').get(id);
        if (!existing) {
            return res.status(404).json({ error: 'Area not found' });
        }
        const is_enabled = enabled ? 1 : 0;
        db.prepare('UPDATE areas SET is_enabled = ? WHERE id = ?').run(is_enabled, id);
        const updated = db.prepare('SELECT * FROM areas WHERE id = ?').get(id);
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
app.patch('/api/areas/:id/reorder', writeLimiter, (0, middleware_1.validateBody)(schemas_1.reorderEntitiesSchema), async (req, res) => {
    try {
        const { id } = req.params;
        const { entityIds } = req.body;
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
app.get('/api/areas/:id/entities', readLimiter, async (req, res) => {
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
app.delete('/api/areas/:id', writeLimiter, (req, res) => {
    try {
        const { id } = req.params;
        const existing = db.prepare('SELECT * FROM areas WHERE id = ?').get(id);
        if (!existing) {
            return res.status(404).json({ error: 'Area not found' });
        }
        db.prepare('DELETE FROM areas WHERE id = ?').run(id);
        res.json({ success: true });
    }
    catch (error) {
        console.error('Error deleting area:', error);
        res.status(500).json({ error: 'Failed to delete area' });
    }
});
app.get('/api/dashboards', readLimiter, (_req, res) => {
    res.json([
        { dashboard_id: 'default', name: 'Default Dashboard' },
        { dashboard_id: 'mobile', name: 'Mobile Dashboard' }
    ]);
});
app.post('/api/auth/login', authLimiter, (0, middleware_1.validateBody)(schemas_1.loginSchema), (req, res) => {
    const { username, password } = req.body;
    const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'test123';
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        const token = Buffer.from(`${username}:${Date.now()}`).toString('base64');
        res.json({
            token,
            user: {
                username,
                role: 'admin'
            }
        });
    }
    else {
        res.status(401).json({ error: 'Invalid credentials. Only admin user is allowed.' });
    }
});
app.post('/api/config/ha', writeLimiter, (0, middleware_1.validateBody)(schemas_1.haConfigSchema), (req, res) => {
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
app.get('/api/config/ha', readLimiter, (_req, res) => {
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
    if (token) {
        res.json({ valid: true });
    }
    else {
        res.status(401).json({ valid: false });
    }
});
app.get('/api/clients', readLimiter, (_req, res) => {
    try {
        if (db) {
            const clients = db.prepare('SELECT * FROM clients WHERE is_active = ?').all(1);
            res.json(clients || []);
        }
        else {
            res.json([]);
        }
    }
    catch (error) {
        console.error('Error fetching clients:', error);
        res.json([]);
    }
});
app.use((req, res) => {
    res.status(404).json({ error: 'Not found', path: req.path });
});
app.use((err, _req, res, _next) => {
    console.error('Error:', err);
    res.status(500).json({ error: 'Internal server error', message: err.message });
});
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    socket.on('subscribe', (data) => {
        console.log('Client subscribed:', data);
        socket.emit('connected', { status: 'ok' });
    });
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});
server.listen(PORT, () => {
    console.log('');
    console.log('═══════════════════════════════════════════════');
    console.log('  HAsync Backend Server Started (VALIDATED)');
    console.log('═══════════════════════════════════════════════');
    console.log(`  API:      http://localhost:${PORT}/api`);
    console.log(`  Health:   http://localhost:${PORT}/api/health`);
    console.log(`  WebSocket: ws://localhost:${PORT}`);
    console.log(`  Database: ${DATABASE_PATH}`);
    console.log('  Security: Input validation ENABLED');
    console.log('  Rate limiting: ACTIVE');
    console.log('═══════════════════════════════════════════════');
    console.log('');
});
process.on('SIGTERM', () => {
    console.log('SIGTERM received, closing server...');
    server.close(() => {
        if (db)
            db.close();
        process.exit(0);
    });
});
//# sourceMappingURL=index-simple-validated.js.map