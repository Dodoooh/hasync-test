/**
 * Validation Utilities
 */

export class Validator {
  static isValidEntityId(entityId: string): boolean {
    return /^[a-z_]+\.[a-z0-9_]+$/.test(entityId);
  }

  static isValidPin(pin: string): boolean {
    return /^\d{6}$/.test(pin);
  }

  static isValidClientId(clientId: string): boolean {
    return /^\d+-[a-z0-9]+$/.test(clientId);
  }

  static sanitizeString(input: string, maxLength = 255): string {
    return input
      .trim()
      .substring(0, maxLength)
      .replace(/[<>]/g, '');
  }

  static isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
}
