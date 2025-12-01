/**
 * Client Pairing Service
 */

import crypto from 'crypto';
import { DatabaseService } from '../database';
import { PairingRequest, PairingSession, Client, ValidationError } from '../types';

export class PairingService {
  private static readonly PIN_LENGTH = 6;
  private static readonly PIN_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

  constructor(private db: DatabaseService) {
    // Clean expired sessions periodically
    setInterval(() => {
      const cleaned = this.db.cleanExpiredPairingSessions();
      if (cleaned > 0) {
        console.log(`Cleaned ${cleaned} expired pairing sessions`);
      }
    }, 60000); // Every minute
  }

  /**
   * Generate a new pairing PIN
   */
  generatePairingPin(): PairingSession {
    const pin = this.generateRandomPin();
    const expiresAt = Date.now() + PairingService.PIN_EXPIRY_MS;

    return this.db.createPairingSession(pin, expiresAt);
  }

  /**
   * Verify PIN and complete pairing
   */
  async completePairing(request: PairingRequest): Promise<Client> {
    // Validate PIN
    const session = this.db.getPairingSession(request.pin);
    if (!session) {
      throw new ValidationError('Invalid or expired PIN');
    }

    if (Date.now() > session.expires_at) {
      throw new ValidationError('PIN has expired');
    }

    // Check if public key already exists
    const existingClient = this.db.getClientByPublicKey(request.public_key);
    if (existingClient) {
      throw new ValidationError('Client already paired');
    }

    // Generate server certificate for client
    const certificate = this.generateCertificate(request.public_key);

    // Create client record
    const client = this.db.createClient({
      name: request.device_name,
      device_type: request.device_type,
      public_key: request.public_key,
      certificate,
      paired_at: Date.now(),
      last_seen: Date.now(),
      is_active: true,
      metadata: {}
    });

    // Mark PIN as used
    this.db.markPairingSessionUsed(request.pin);

    // Log activity
    this.db.logActivity(client.id, 'pairing_completed', `Device: ${request.device_name}`);

    return client;
  }

  /**
   * Verify client certificate for authentication
   */
  verifyClientCertificate(clientId: string, certificate: string): boolean {
    const client = this.db.getClient(clientId);
    if (!client || !client.is_active) {
      return false;
    }

    // Constant-time comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(client.certificate),
      Buffer.from(certificate)
    );
  }

  /**
   * Revoke client access
   */
  revokeClient(clientId: string): boolean {
    const success = this.db.updateClient(clientId, { is_active: false });
    if (success) {
      this.db.logActivity(clientId, 'client_revoked', 'Access revoked by admin');
    }
    return success;
  }

  /**
   * Update client last seen timestamp
   */
  updateClientActivity(clientId: string): void {
    this.db.updateClient(clientId, { last_seen: Date.now() });
  }

  /**
   * Get all paired clients
   */
  getAllClients(activeOnly = true): Client[] {
    return this.db.getAllClients(activeOnly);
  }

  /**
   * Get client by ID
   */
  getClient(clientId: string): Client | null {
    return this.db.getClient(clientId);
  }

  /**
   * Delete client
   */
  deleteClient(clientId: string): boolean {
    const client = this.db.getClient(clientId);
    if (!client) {
      return false;
    }

    const success = this.db.deleteClient(clientId);
    if (success) {
      this.db.logActivity(clientId, 'client_deleted', `Client: ${client.name}`);
    }
    return success;
  }

  // Private helper methods

  private generateRandomPin(): string {
    let pin = '';
    for (let i = 0; i < PairingService.PIN_LENGTH; i++) {
      pin += Math.floor(Math.random() * 10);
    }
    return pin;
  }

  private generateCertificate(publicKey: string): string {
    // Generate a certificate by signing the public key with server's private key
    // In production, this should use proper X.509 certificates
    const hash = crypto.createHash('sha256');
    hash.update(publicKey);
    hash.update(Date.now().toString());
    hash.update(crypto.randomBytes(32));
    return hash.digest('hex');
  }
}
