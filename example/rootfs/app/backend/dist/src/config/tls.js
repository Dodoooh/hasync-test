"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadTLSCertificates = loadTLSCertificates;
exports.getTLSOptionsFromEnv = getTLSOptionsFromEnv;
exports.createHTTPSOptions = createHTTPSOptions;
exports.validateTLSConfig = validateTLSConfig;
const fs_1 = require("fs");
const path_1 = require("path");
function loadTLSCertificates(options) {
    if (!options.enabled) {
        console.log('⚠ TLS disabled - running in HTTP mode (insecure)');
        return null;
    }
    try {
        if (!(0, fs_1.existsSync)(options.keyPath)) {
            throw new Error(`TLS key file not found: ${options.keyPath}`);
        }
        if (!(0, fs_1.existsSync)(options.certPath)) {
            throw new Error(`TLS certificate file not found: ${options.certPath}`);
        }
        const tlsConfig = {
            key: (0, fs_1.readFileSync)(options.keyPath, 'utf8'),
            cert: (0, fs_1.readFileSync)(options.certPath, 'utf8'),
        };
        if (options.caPath && (0, fs_1.existsSync)(options.caPath)) {
            tlsConfig.ca = (0, fs_1.readFileSync)(options.caPath, 'utf8');
            console.log('✓ CA certificate loaded');
        }
        console.log('✓ TLS certificates loaded successfully');
        console.log(`  Key:  ${options.keyPath}`);
        console.log(`  Cert: ${options.certPath}`);
        return tlsConfig;
    }
    catch (error) {
        console.error('✗ Failed to load TLS certificates:', error.message);
        throw error;
    }
}
function getTLSOptionsFromEnv() {
    const enabled = process.env.TLS_ENABLED === 'true';
    const port = parseInt(process.env.HTTPS_PORT || '8099', 10);
    const httpPort = parseInt(process.env.HTTP_PORT || '8098', 10);
    const defaultKeyPath = (0, path_1.join)(process.cwd(), 'certs', 'server.key');
    const defaultCertPath = (0, path_1.join)(process.cwd(), 'certs', 'server.crt');
    const defaultCAPath = (0, path_1.join)(process.cwd(), 'certs', 'ca.crt');
    return {
        enabled,
        keyPath: process.env.TLS_KEY_PATH || defaultKeyPath,
        certPath: process.env.TLS_CERT_PATH || defaultCertPath,
        caPath: (0, fs_1.existsSync)(process.env.TLS_CA_PATH || defaultCAPath)
            ? (process.env.TLS_CA_PATH || defaultCAPath)
            : undefined,
        port,
        httpPort,
        redirectHttp: process.env.TLS_REDIRECT_HTTP !== 'false',
    };
}
function createHTTPSOptions(tlsConfig) {
    return {
        key: tlsConfig.key,
        cert: tlsConfig.cert,
        ca: tlsConfig.ca,
        honorCipherOrder: true,
        minVersion: 'TLSv1.2',
        maxVersion: 'TLSv1.3',
        ciphers: [
            'ECDHE-ECDSA-AES128-GCM-SHA256',
            'ECDHE-RSA-AES128-GCM-SHA256',
            'ECDHE-ECDSA-AES256-GCM-SHA384',
            'ECDHE-RSA-AES256-GCM-SHA384',
            'ECDHE-ECDSA-CHACHA20-POLY1305',
            'ECDHE-RSA-CHACHA20-POLY1305',
        ].join(':'),
    };
}
function validateTLSConfig(options) {
    if (!options.enabled) {
        console.warn('═══════════════════════════════════════════════');
        console.warn('⚠  WARNING: TLS/HTTPS is DISABLED');
        console.warn('   All traffic including tokens will be sent in plaintext!');
        console.warn('   This is a CRITICAL SECURITY RISK in production.');
        console.warn('   Enable TLS by setting TLS_ENABLED=true');
        console.warn('═══════════════════════════════════════════════');
        return;
    }
    const errors = [];
    if (!(0, fs_1.existsSync)(options.keyPath)) {
        errors.push(`TLS key file not found: ${options.keyPath}`);
    }
    if (!(0, fs_1.existsSync)(options.certPath)) {
        errors.push(`TLS certificate file not found: ${options.certPath}`);
    }
    if (errors.length > 0) {
        console.error('✗ TLS Configuration Errors:');
        errors.forEach(err => console.error(`  - ${err}`));
        throw new Error('TLS configuration is invalid. See errors above.');
    }
}
//# sourceMappingURL=tls.js.map