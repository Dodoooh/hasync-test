/**
 * TLS Configuration Module
 * Handles HTTPS/TLS certificate loading and configuration
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import https from 'https';

export interface TLSConfig {
  key: string;
  cert: string;
  ca?: string;
  requestCert?: boolean;
  rejectUnauthorized?: boolean;
}

export interface TLSOptions {
  enabled: boolean;
  keyPath: string;
  certPath: string;
  caPath?: string;
  port: number;
  httpPort?: number;
  redirectHttp?: boolean;
}

/**
 * Load TLS certificates from file system
 */
export function loadTLSCertificates(options: TLSOptions): TLSConfig | null {
  if (!options.enabled) {
    console.log('⚠ TLS disabled - running in HTTP mode (insecure)');
    return null;
  }

  try {
    // Check if certificate files exist
    if (!existsSync(options.keyPath)) {
      throw new Error(`TLS key file not found: ${options.keyPath}`);
    }
    if (!existsSync(options.certPath)) {
      throw new Error(`TLS certificate file not found: ${options.certPath}`);
    }

    const tlsConfig: TLSConfig = {
      key: readFileSync(options.keyPath, 'utf8'),
      cert: readFileSync(options.certPath, 'utf8'),
    };

    // Load CA certificate if provided
    if (options.caPath && existsSync(options.caPath)) {
      tlsConfig.ca = readFileSync(options.caPath, 'utf8');
      console.log('✓ CA certificate loaded');
    }

    console.log('✓ TLS certificates loaded successfully');
    console.log(`  Key:  ${options.keyPath}`);
    console.log(`  Cert: ${options.certPath}`);

    return tlsConfig;
  } catch (error: any) {
    console.error('✗ Failed to load TLS certificates:', error.message);
    throw error;
  }
}

/**
 * Get TLS options from environment variables
 */
export function getTLSOptionsFromEnv(): TLSOptions {
  const enabled = process.env.TLS_ENABLED === 'true';
  const port = parseInt(process.env.HTTPS_PORT || '8099', 10);
  const httpPort = parseInt(process.env.HTTP_PORT || '8098', 10);

  // Default certificate paths
  const defaultKeyPath = join(process.cwd(), 'certs', 'server.key');
  const defaultCertPath = join(process.cwd(), 'certs', 'server.crt');
  const defaultCAPath = join(process.cwd(), 'certs', 'ca.crt');

  return {
    enabled,
    keyPath: process.env.TLS_KEY_PATH || defaultKeyPath,
    certPath: process.env.TLS_CERT_PATH || defaultCertPath,
    caPath: existsSync(process.env.TLS_CA_PATH || defaultCAPath)
      ? (process.env.TLS_CA_PATH || defaultCAPath)
      : undefined,
    port,
    httpPort,
    redirectHttp: process.env.TLS_REDIRECT_HTTP !== 'false', // Default true
  };
}

/**
 * Create HTTPS server options with security best practices
 */
export function createHTTPSOptions(tlsConfig: TLSConfig): https.ServerOptions {
  return {
    key: tlsConfig.key,
    cert: tlsConfig.cert,
    ca: tlsConfig.ca,
    // Security best practices
    honorCipherOrder: true,
    minVersion: 'TLSv1.2' as const, // Minimum TLS 1.2
    maxVersion: 'TLSv1.3' as const, // Maximum TLS 1.3
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

/**
 * Validate TLS configuration
 */
export function validateTLSConfig(options: TLSOptions): void {
  if (!options.enabled) {
    console.warn('═══════════════════════════════════════════════');
    console.warn('⚠  WARNING: TLS/HTTPS is DISABLED');
    console.warn('   All traffic including tokens will be sent in plaintext!');
    console.warn('   This is a CRITICAL SECURITY RISK in production.');
    console.warn('   Enable TLS by setting TLS_ENABLED=true');
    console.warn('═══════════════════════════════════════════════');
    return;
  }

  const errors: string[] = [];

  if (!existsSync(options.keyPath)) {
    errors.push(`TLS key file not found: ${options.keyPath}`);
  }
  if (!existsSync(options.certPath)) {
    errors.push(`TLS certificate file not found: ${options.certPath}`);
  }

  if (errors.length > 0) {
    console.error('✗ TLS Configuration Errors:');
    errors.forEach(err => console.error(`  - ${err}`));
    throw new Error('TLS configuration is invalid. See errors above.');
  }
}
