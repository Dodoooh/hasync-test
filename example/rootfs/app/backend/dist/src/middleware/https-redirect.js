"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.httpsRedirect = httpsRedirect;
exports.securityHeaders = securityHeaders;
function httpsRedirect(options) {
    return (req, res, next) => {
        if (!options.enabled) {
            return next();
        }
        if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
            return next();
        }
        if (options.excludePaths?.some(path => req.path.startsWith(path))) {
            return next();
        }
        const host = req.hostname;
        const port = options.httpsPort === 443 ? '' : `:${options.httpsPort}`;
        const httpsUrl = `https://${host}${port}${req.url}`;
        console.log(`↻ Redirecting HTTP → HTTPS: ${req.url}`);
        res.redirect(301, httpsUrl);
    };
}
function securityHeaders() {
    return (_req, res, next) => {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'");
        next();
    };
}
//# sourceMappingURL=https-redirect.js.map