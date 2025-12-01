"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeAdminUser = initializeAdminUser;
exports.handleLogin = handleLogin;
exports.handleRefreshToken = handleRefreshToken;
exports.handleVerifyToken = handleVerifyToken;
const auth_1 = require("./middleware/auth");
const password_1 = require("./utils/password");
async function initializeAdminUser(db) {
    try {
        const existingAdmin = db.prepare('SELECT * FROM users WHERE username = ?').get('admin');
        if (!existingAdmin) {
            const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
            const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'test123';
            const passwordHash = await (0, password_1.hashPassword)(ADMIN_PASSWORD);
            const userId = `user_${Date.now()}`;
            db.prepare('INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)')
                .run(userId, ADMIN_USERNAME, passwordHash, 'admin');
            console.log(`✓ Admin user created: ${ADMIN_USERNAME}`);
        }
        else {
            console.log('✓ Admin user already exists');
        }
    }
    catch (error) {
        console.error('✗ Error initializing admin user:', error);
    }
}
async function handleLogin(req, res, db) {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'Username and password are required'
            });
            return;
        }
        const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
        if (!user) {
            res.status(401).json({
                error: 'Unauthorized',
                message: 'Invalid credentials'
            });
            return;
        }
        const isValidPassword = await (0, password_1.verifyPassword)(password, user.password_hash);
        if (!isValidPassword) {
            res.status(401).json({
                error: 'Unauthorized',
                message: 'Invalid credentials'
            });
            return;
        }
        const accessToken = (0, auth_1.generateAccessToken)(user.username, user.role);
        const refreshToken = (0, auth_1.generateRefreshToken)(user.username, user.role);
        const refreshTokenId = `rt_${Date.now()}`;
        const tokenHash = await (0, password_1.hashPassword)(refreshToken);
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
    }
    catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'An error occurred during login'
        });
    }
}
async function handleRefreshToken(req, res) {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'Refresh token is required'
            });
            return;
        }
        const decoded = (0, auth_1.verifyRefreshToken)(refreshToken);
        if (!decoded) {
            res.status(401).json({
                error: 'Unauthorized',
                message: 'Invalid or expired refresh token'
            });
            return;
        }
        const accessToken = (0, auth_1.generateAccessToken)(decoded.username, decoded.role);
        res.json({
            token: accessToken
        });
    }
    catch (error) {
        console.error('Token refresh error:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'An error occurred during token refresh'
        });
    }
}
function handleVerifyToken(req, res) {
    res.json({
        valid: true,
        user: req.user
    });
}
//# sourceMappingURL=auth-routes.js.map