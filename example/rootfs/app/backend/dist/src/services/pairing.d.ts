import { DatabaseService } from '../database';
import { PairingRequest, PairingSession, Client } from '../types';
export declare class PairingService {
    private db;
    private static readonly PIN_LENGTH;
    private static readonly PIN_EXPIRY_MS;
    constructor(db: DatabaseService);
    generatePairingPin(): PairingSession;
    completePairing(request: PairingRequest): Promise<Client>;
    verifyClientCertificate(clientId: string, certificate: string): boolean;
    revokeClient(clientId: string): boolean;
    updateClientActivity(clientId: string): void;
    getAllClients(activeOnly?: boolean): Client[];
    getClient(clientId: string): Client | null;
    deleteClient(clientId: string): boolean;
    private generateRandomPin;
    private generateCertificate;
}
//# sourceMappingURL=pairing.d.ts.map