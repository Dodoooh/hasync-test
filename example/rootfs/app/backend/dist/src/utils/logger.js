"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLogger = exports.Logger = exports.LogLevel = void 0;
var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["ERROR"] = 0] = "ERROR";
    LogLevel[LogLevel["WARN"] = 1] = "WARN";
    LogLevel[LogLevel["INFO"] = 2] = "INFO";
    LogLevel[LogLevel["DEBUG"] = 3] = "DEBUG";
})(LogLevel || (exports.LogLevel = LogLevel = {}));
class Logger {
    level;
    name;
    constructor(name, level = LogLevel.INFO) {
        this.name = name;
        this.level = level;
    }
    error(message, meta) {
        if (this.level >= LogLevel.ERROR) {
            this.log('ERROR', message, meta);
        }
    }
    warn(message, meta) {
        if (this.level >= LogLevel.WARN) {
            this.log('WARN', message, meta);
        }
    }
    info(message, meta) {
        if (this.level >= LogLevel.INFO) {
            this.log('INFO', message, meta);
        }
    }
    debug(message, meta) {
        if (this.level >= LogLevel.DEBUG) {
            this.log('DEBUG', message, meta);
        }
    }
    log(level, message, meta) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            level,
            logger: this.name,
            message,
            ...meta
        };
        console.log(JSON.stringify(logEntry));
    }
}
exports.Logger = Logger;
const createLogger = (name) => {
    const level = process.env.LOG_LEVEL || 'INFO';
    return new Logger(name, LogLevel[level]);
};
exports.createLogger = createLogger;
//# sourceMappingURL=logger.js.map