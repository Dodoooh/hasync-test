/**
 * Token Utilities Test Suite
 * Tests for token generation, verification, and authentication
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import {
  generateClientToken,
  hashToken,
  verifyClientToken,
  revokeClientToken,
  cleanupExpiredTokens
} from './tokenUtils';
import { tmpdir } from 'os';
import { join } from 'path';
import { unlinkSync } from 'fs';

describe('Token Utils', () => {
  let db: Database.Database;
  let dbPath: string;

  beforeEach(() => {
    // Create temporary database
    dbPath = join(tmpdir(), `test-db-${Date.now()}.db`);
    db = new Database(dbPath);

    // Create client_tokens table
    db.exec(`
      CREATE TABLE client_tokens (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        assigned_areas TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        expires_at INTEGER NOT NULL,
        last_used INTEGER,
        is_revoked INTEGER NOT NULL DEFAULT 0,
        revoked_at INTEGER,
        revoked_reason TEXT
      );
    `);
  });

  afterEach(() => {
    db.close();
    try {
      unlinkSync(dbPath);
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('generateClientToken', () => {
    it('should generate a valid JWT token', () => {
      const clientId = 'client_123';
      const assignedAreas = ['area_1', 'area_2'];

      const token = generateClientToken(clientId, assignedAreas);

      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3); // JWT has 3 parts
    });

    it('should include correct payload', () => {
      const clientId = 'client_456';
      const assignedAreas = ['area_3'];

      const token = generateClientToken(clientId, assignedAreas);
      const decoded = verifyClientToken(token);

      expect(decoded).toBeTruthy();
      expect(decoded?.clientId).toBe(clientId);
      expect(decoded?.assignedAreas).toEqual(assignedAreas);
    });

    it('should handle empty assigned areas', () => {
      const clientId = 'client_789';
      const assignedAreas: string[] = [];

      const token = generateClientToken(clientId, assignedAreas);
      const decoded = verifyClientToken(token);

      expect(decoded).toBeTruthy();
      expect(decoded?.assignedAreas).toEqual([]);
    });
  });

  describe('hashToken', () => {
    it('should generate consistent SHA256 hash', () => {
      const token = 'test-token-123';
      const hash1 = hashToken(token);
      const hash2 = hashToken(token);

      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(64); // SHA256 hex is 64 chars
    });

    it('should generate different hashes for different tokens', () => {
      const token1 = 'token-1';
      const token2 = 'token-2';

      const hash1 = hashToken(token1);
      const hash2 = hashToken(token2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('verifyClientToken', () => {
    it('should verify valid client token', () => {
      const clientId = 'client_valid';
      const assignedAreas = ['area_1', 'area_2'];
      const token = generateClientToken(clientId, assignedAreas);

      const decoded = verifyClientToken(token);

      expect(decoded).toBeTruthy();
      expect(decoded?.clientId).toBe(clientId);
      expect(decoded?.assignedAreas).toEqual(assignedAreas);
    });

    it('should reject invalid token', () => {
      const invalidToken = 'invalid.jwt.token';
      const decoded = verifyClientToken(invalidToken);

      expect(decoded).toBeNull();
    });

    it('should reject tampered token', () => {
      const clientId = 'client_tamper';
      const token = generateClientToken(clientId, ['area_1']);

      // Tamper with token
      const parts = token.split('.');
      parts[1] = Buffer.from('{"clientId":"hacker"}').toString('base64');
      const tamperedToken = parts.join('.');

      const decoded = verifyClientToken(tamperedToken);
      expect(decoded).toBeNull();
    });
  });

  describe('revokeClientToken', () => {
    it('should revoke a valid token', () => {
      const clientId = 'client_revoke';
      const token = generateClientToken(clientId, ['area_1']);
      const tokenHash = hashToken(token);

      // Insert token into database
      const tokenId = 'token_123';
      const expiresAt = Math.floor(Date.now() / 1000) + 3600;
      db.prepare(`
        INSERT INTO client_tokens (id, client_id, token_hash, assigned_areas, expires_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(tokenId, clientId, tokenHash, JSON.stringify(['area_1']), expiresAt);

      // Revoke token
      const revoked = revokeClientToken(db, tokenHash, 'Test revocation');

      expect(revoked).toBe(true);

      // Verify token is revoked
      const tokenRecord = db.prepare('SELECT is_revoked FROM client_tokens WHERE token_hash = ?').get(tokenHash) as any;
      expect(tokenRecord.is_revoked).toBe(1);
    });

    it('should return false for non-existent token', () => {
      const fakeHash = 'abc123';
      const revoked = revokeClientToken(db, fakeHash, 'Test');

      expect(revoked).toBe(false);
    });
  });

  describe('cleanupExpiredTokens', () => {
    it('should delete expired tokens', () => {
      const pastTimestamp = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago

      // Insert expired token
      db.prepare(`
        INSERT INTO client_tokens (id, client_id, token_hash, assigned_areas, expires_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('token_1', 'client_1', 'hash_1', '[]', pastTimestamp);

      // Insert valid token
      const futureTimestamp = Math.floor(Date.now() / 1000) + 3600;
      db.prepare(`
        INSERT INTO client_tokens (id, client_id, token_hash, assigned_areas, expires_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('token_2', 'client_2', 'hash_2', '[]', futureTimestamp);

      // Cleanup
      const cleaned = cleanupExpiredTokens(db);

      expect(cleaned).toBe(1);

      // Verify only valid token remains
      const remaining = db.prepare('SELECT COUNT(*) as count FROM client_tokens').get() as any;
      expect(remaining.count).toBe(1);
    });

    it('should not delete non-expired tokens', () => {
      const futureTimestamp = Math.floor(Date.now() / 1000) + 3600;

      db.prepare(`
        INSERT INTO client_tokens (id, client_id, token_hash, assigned_areas, expires_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('token_1', 'client_1', 'hash_1', '[]', futureTimestamp);

      const cleaned = cleanupExpiredTokens(db);

      expect(cleaned).toBe(0);

      const remaining = db.prepare('SELECT COUNT(*) as count FROM client_tokens').get() as any;
      expect(remaining.count).toBe(1);
    });
  });
});
