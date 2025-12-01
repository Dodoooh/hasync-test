export declare enum LogLevel {
    ERROR = 0,
    WARN = 1,
    INFO = 2,
    DEBUG = 3
}
export declare class Logger {
    private level;
    private name;
    constructor(name: string, level?: LogLevel);
    error(message: string, meta?: any): void;
    warn(message: string, meta?: any): void;
    info(message: string, meta?: any): void;
    debug(message: string, meta?: any): void;
    private log;
}
export declare const createLogger: (name: string) => Logger;
//# sourceMappingURL=logger.d.ts.map