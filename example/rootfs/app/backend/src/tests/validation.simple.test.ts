/**
 * Simplified Validation Tests
 */

import {
  createAreaSchema,
  loginSchema,
  haConfigSchema
} from '../validation/schemas';

describe('Input Validation Tests', () => {
  describe('Area Validation', () => {
    it('accepts valid area data', () => {
      const validData = {
        name: 'Living Room',
        entityIds: ['light.living_room', 'switch.fan'],
        isEnabled: true
      };

      const result = createAreaSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('rejects SQL injection in name', () => {
      const sqlInjection = {
        name: "'; DROP TABLE areas; --",
        entityIds: []
      };

      const result = createAreaSchema.safeParse(sqlInjection);
      expect(result.success).toBe(false);
    });

    it('rejects XSS in name', () => {
      const xssAttempt = {
        name: '<script>alert("XSS")</script>',
        entityIds: []
      };

      const result = createAreaSchema.safeParse(xssAttempt);
      expect(result.success).toBe(false);
    });
  });

  describe('Authentication Validation', () => {
    it('accepts valid credentials', () => {
      const validLogin = {
        username: 'admin',
        password: 'SecureP@ssw0rd!'
      };

      const result = loginSchema.safeParse(validLogin);
      expect(result.success).toBe(true);
    });

    it('rejects SQL injection in username', () => {
      const sqlInjection = {
        username: "admin' OR '1'='1",
        password: 'password'
      };

      const result = loginSchema.safeParse(sqlInjection);
      expect(result.success).toBe(false);
    });
  });

  describe('HA Config Validation', () => {
    it('accepts valid HA config', () => {
      const validConfig = {
        url: 'https://homeassistant.local:8123',
        token: 'valid_token_123'
      };

      const result = haConfigSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });

    it('rejects invalid URL', () => {
      const invalidUrl = {
        url: 'javascript:alert("XSS")',
        token: 'token123'
      };

      const result = haConfigSchema.safeParse(invalidUrl);
      expect(result.success).toBe(false);
    });
  });
});
