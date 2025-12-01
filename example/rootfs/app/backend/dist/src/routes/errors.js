"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const zod_1 = require("zod");
const router = express_1.default.Router();
const errorLogSchema = zod_1.z.object({
    message: zod_1.z.string(),
    stack: zod_1.z.string().optional(),
    componentStack: zod_1.z.string().optional(),
    level: zod_1.z.enum(['app', 'section', 'component']),
    timestamp: zod_1.z.string(),
    userAgent: zod_1.z.string().optional(),
    url: zod_1.z.string().optional(),
});
const errorLogs = [];
const MAX_LOGS = 1000;
router.post('/', async (req, res) => {
    try {
        const errorData = errorLogSchema.parse(req.body);
        errorLogs.push({
            ...errorData,
            id: Date.now().toString(),
            receivedAt: new Date().toISOString(),
        });
        if (errorLogs.length > MAX_LOGS) {
            errorLogs.splice(0, errorLogs.length - MAX_LOGS);
        }
        if (process.env.NODE_ENV === 'development') {
            console.error('[Frontend Error]', {
                level: errorData.level,
                message: errorData.message,
                url: errorData.url,
                timestamp: errorData.timestamp,
            });
        }
        res.status(201).json({ success: true, logged: true });
    }
    catch (error) {
        console.error('Failed to log error:', error);
        res.status(400).json({ error: 'Invalid error data' });
    }
});
router.get('/', (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    const level = req.query.level;
    let logs = [...errorLogs].reverse();
    if (level) {
        logs = logs.filter((log) => log.level === level);
    }
    res.json({
        errors: logs.slice(0, limit),
        total: errorLogs.length,
    });
});
router.delete('/', (req, res) => {
    const cleared = errorLogs.length;
    errorLogs.length = 0;
    res.json({ success: true, cleared });
});
exports.default = router;
//# sourceMappingURL=errors.js.map