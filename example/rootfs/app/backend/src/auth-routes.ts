/**
 * Authentication Routes
 * JWT-based authentication endpoints with bcrypt password hashing
 */

import { Request, Response } from 'express';
import Database from 'better-sqlite3';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken
} from './middleware/auth';
import { hashPassword, verifyPassword } from './utils/password';

/**
 * Initialize admin user with hashed password
 */
export async function initializeAdminUser(db: any): Promise<void> {
  try {
    const existingAdmin = db.prepare('SELECT * FROM users WHERE username = ?').get('admin');

    if (!existingAdmin) {
      const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
      const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'test123';

      const passwordHash = await hashPassword(ADMIN_PASSWORD);
      const userId = `user_${Date.now()}`;

      db.prepare('INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)')
        .run(userId, ADMIN_USERNAME, passwordHash, 'admin');

      console.log(`✓ Admin user created: ${ADMIN_USERNAME}`);
    } else {
      console.log('✓ Admin user already exists');
    }
  } catch (error) {
    console.error('✗ Error initializing admin user:', error);
  }
}

/**
 * Login endpoint handler
 */
export async function handleLogin(req: Request, res: Response, db: any): Promise<void> {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Username and password are required'
      });
      return;
    }

    const user: any = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

    if (!user) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid credentials'
      });
      return;
    }

    const isValidPassword = await verifyPassword(password, user.password_hash);

    if (!isValidPassword) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid credentials'
      });
      return;
    }

    const accessToken = generateAccessToken(user.username, user.role);
    const refreshToken = generateRefreshToken(user.username, user.role);

    const refreshTokenId = `rt_${Date.now()}`;
    const tokenHash = await hashPassword(refreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    db.prepare('INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)')
      .run(refreshTokenId, user.id, tokenHash, expiresAt);

    console.log(`✓ User logged in: ${username}`);

    res.json({
      token: accessToken,
      refreshToken,
      user: {
        username: user.username,
        role: user.role
      }
    });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred during login'
    });
  }
}

/**
 * Refresh token endpoint handler
 */
export async function handleRefreshToken(req: Request, res: Response): Promise<void> {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Refresh token is required'
      });
      return;
    }

    const decoded = verifyRefreshToken(refreshToken);

    if (!decoded) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired refresh token'
      });
      return;
    }

    const accessToken = generateAccessToken(decoded.username, decoded.role);

    res.json({
      token: accessToken
    });
  } catch (error: any) {
    console.error('Token refresh error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred during token refresh'
    });
  }
}

/**
 * Verify token endpoint handler
 */
export function handleVerifyToken(req: Request, res: Response): void {
  res.json({
    valid: true,
    user: req.user
  });
}
