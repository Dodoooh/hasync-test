/**
 * Password Hashing Utilities
 * Uses bcrypt with minimum 12 rounds for secure password storage
 */

import bcrypt from 'bcrypt';

// Minimum 12 rounds for bcrypt (as per security requirements)
const SALT_ROUNDS = 12;

/**
 * Hash a password using bcrypt
 * @param password - Plain text password
 * @returns Hashed password
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verify a password against a hash
 * @param password - Plain text password
 * @param hash - Hashed password to compare against
 * @returns True if password matches, false otherwise
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Check if a password needs rehashing (e.g., if salt rounds changed)
 * @param hash - Current password hash
 * @returns True if password should be rehashed
 */
export function needsRehash(hash: string): boolean {
  try {
    const rounds = bcrypt.getRounds(hash);
    return rounds < SALT_ROUNDS;
  } catch {
    return true;
  }
}
