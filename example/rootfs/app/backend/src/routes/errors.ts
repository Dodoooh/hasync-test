import express from 'express';
import { z } from 'zod';

const router = express.Router();

// Error log schema
const errorLogSchema = z.object({
  message: z.string(),
  stack: z.string().optional(),
  componentStack: z.string().optional(),
  level: z.enum(['app', 'section', 'component']),
  timestamp: z.string(),
  userAgent: z.string().optional(),
  url: z.string().optional(),
});

// In-memory error store (in production, use a database or logging service)
const errorLogs: any[] = [];
const MAX_LOGS = 1000;

/**
 * POST /api/errors
 * Log frontend errors
 */
router.post('/', async (req, res) => {
  try {
    const errorData = errorLogSchema.parse(req.body);

    // Store error log
    errorLogs.push({
      ...errorData,
      id: Date.now().toString(),
      receivedAt: new Date().toISOString(),
    });

    // Keep only last MAX_LOGS entries
    if (errorLogs.length > MAX_LOGS) {
      errorLogs.splice(0, errorLogs.length - MAX_LOGS);
    }

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('[Frontend Error]', {
        level: errorData.level,
        message: errorData.message,
        url: errorData.url,
        timestamp: errorData.timestamp,
      });
    }

    // In production, send to error tracking service
    // if (process.env.NODE_ENV === 'production') {
    //   await sendToSentry(errorData);
    // }

    res.status(201).json({ success: true, logged: true });
  } catch (error) {
    console.error('Failed to log error:', error);
    res.status(400).json({ error: 'Invalid error data' });
  }
});

/**
 * GET /api/errors
 * Get recent error logs (admin only)
 */
router.get('/', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const level = req.query.level as string;

  let logs = [...errorLogs].reverse();

  if (level) {
    logs = logs.filter((log) => log.level === level);
  }

  res.json({
    errors: logs.slice(0, limit),
    total: errorLogs.length,
  });
});

/**
 * DELETE /api/errors
 * Clear error logs (admin only)
 */
router.delete('/', (req, res) => {
  const cleared = errorLogs.length;
  errorLogs.length = 0;
  res.json({ success: true, cleared });
});

export default router;
