"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupUncaughtExceptionHandler = exports.setupUnhandledRejectionHandler = exports.errorHandler = exports.notFoundHandler = exports.asyncHandler = void 0;
const AppError_1 = require("../errors/AppError");
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('ErrorHandler');
const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};
exports.asyncHandler = asyncHandler;
const notFoundHandler = (req, res) => {
    logger.warn('Endpoint not found', {
        path: req.path,
        method: req.method,
        ip: req.ip
    });
    res.status(404).json({
        error: 'Endpoint not found',
        statusCode: 404,
        path: req.path,
        timestamp: new Date().toISOString()
    });
};
exports.notFoundHandler = notFoundHandler;
const errorHandler = (err, req, res, _next) => {
    const errorInfo = {
        error: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('user-agent'),
        body: req.body,
        timestamp: new Date().toISOString()
    };
    if (err instanceof AppError_1.AppError && err.isOperational) {
        logger.warn('Operational error occurred', errorInfo);
        res.status(err.statusCode).json({
            error: err.message,
            statusCode: err.statusCode,
            timestamp: errorInfo.timestamp,
            ...(process.env.NODE_ENV === 'development' && {
                stack: err.stack,
                path: req.path
            })
        });
        return;
    }
    logger.error('Unexpected error occurred', errorInfo);
    const message = process.env.NODE_ENV === 'development'
        ? err.message
        : 'Internal server error';
    res.status(500).json({
        error: message,
        statusCode: 500,
        timestamp: errorInfo.timestamp,
        ...(process.env.NODE_ENV === 'development' && {
            stack: err.stack,
            path: req.path,
            details: err.message
        })
    });
};
exports.errorHandler = errorHandler;
const setupUnhandledRejectionHandler = () => {
    process.on('unhandledRejection', (reason, promise) => {
        logger.error('Unhandled Promise Rejection', {
            reason: reason?.message || reason,
            stack: reason?.stack,
            promise: promise.toString()
        });
        if (process.env.NODE_ENV === 'production') {
            logger.error('Exiting due to unhandled rejection');
            process.exit(1);
        }
    });
};
exports.setupUnhandledRejectionHandler = setupUnhandledRejectionHandler;
const setupUncaughtExceptionHandler = () => {
    process.on('uncaughtException', (error) => {
        logger.error('Uncaught Exception', {
            error: error.message,
            stack: error.stack
        });
        logger.error('Exiting due to uncaught exception');
        process.exit(1);
    });
};
exports.setupUncaughtExceptionHandler = setupUncaughtExceptionHandler;
//# sourceMappingURL=errorHandler.js.map