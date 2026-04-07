import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_for_dev_only';

/**
 * protect — verifies the short-lived access token sent as a Bearer token.
 *
 * Token sources (in priority order):
 *   1. Authorization: Bearer <accessToken>   ← primary (in-memory on client)
 *   2. jwt cookie                            ← legacy fallback for older sessions
 */
export const protect = async (req, res, next) => {
    let token;

    if (req.headers.authorization?.startsWith('Bearer ')) {
        token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies?.jwt) {
        // Legacy: old sessions still carry the jwt cookie (30d token).
        // Accept it so existing users aren't immediately logged out.
        token = req.cookies.jwt;
    }

    if (!token || token === 'none') {
        return res.status(401).json({ success: false, message: 'Not authorized' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = await User.findById(decoded.userId).select('-password');
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'User not found' });
        }
        next();
    } catch (err) {
        // Expired access token → client should call /api/auth/refresh
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, message: 'Access token expired', code: 'TOKEN_EXPIRED' });
        }
        return res.status(401).json({ success: false, message: 'Token invalid' });
    }
};

export const authorize = (...roles) => (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    next();
};
