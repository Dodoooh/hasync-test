/**
 * Structured Logger Utility
 */

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

export class Logger {
  private level: LogLevel;
  private name: string;

  constructor(name: string, level: LogLevel = LogLevel.INFO) {
    this.name = name;
    this.level = level;
  }

  error(message: string, meta?: any): void {
    if (this.level >= LogLevel.ERROR) {
      this.log('ERROR', message, meta);
    }
  }

  warn(message: string, meta?: any): void {
    if (this.level >= LogLevel.WARN) {
      this.log('WARN', message, meta);
    }
  }

  info(message: string, meta?: any): void {
    if (this.level >= LogLevel.INFO) {
      this.log('INFO', message, meta);
    }
  }

  debug(message: string, meta?: any): void {
    if (this.level >= LogLevel.DEBUG) {
      this.log('DEBUG', message, meta);
    }
  }

  private log(level: string, message: string, meta?: any): void {
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

export const createLogger = (name: string): Logger => {
  const level = process.env.LOG_LEVEL as keyof typeof LogLevel || 'INFO';
  return new Logger(name, LogLevel[level]);
};
