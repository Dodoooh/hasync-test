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
export declare function loadTLSCertificates(options: TLSOptions): TLSConfig | null;
export declare function getTLSOptionsFromEnv(): TLSOptions;
export declare function createHTTPSOptions(tlsConfig: TLSConfig): https.ServerOptions;
export declare function validateTLSConfig(options: TLSOptions): void;
//# sourceMappingURL=tls.d.ts.map