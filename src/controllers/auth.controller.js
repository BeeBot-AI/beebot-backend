import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import User from '../models/User.js';
import Client from '../models/Client.js';
import Business from '../models/Business.js';
import RefreshToken from '../models/RefreshToken.js';
import { OAuth2Client } from 'google-auth-library';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const JWT_SECRET          = process.env.JWT_SECRET || 'fallback_secret_for_dev_only';
const ACCESS_TOKEN_TTL    = '15m';
const REFRESH_TOKEN_DAYS  = 20;

/* ─── helpers ─────────────────────────────────────────────────────────── */

/**
 * Issue a short-lived access token (lives in memory on the client).
 */
const makeAccessToken = (user) =>
    jwt.sign({ userId: user._id, email: user.email, role: user.role }, JWT_SECRET, {
        expiresIn: ACCESS_TOKEN_TTL,
    });

/**
 * Issue a 20-day refresh token, persist its hash in DB, set HTTP-only cookie.
 */
const issueRefreshToken = async (user, res) => {
    // Generate a cryptographically-random opaque token
    const rawToken = crypto.randomBytes(40).toString('hex');
    const hash     = crypto.createHash('sha256').update(rawToken).digest('hex');

    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);

    await RefreshToken.create({ userId: user._id, tokenHash: hash, expiresAt });

    const cookieOpts = {
        httpOnly: true,
        secure:   process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        expires:  expiresAt,
        path:     '/',
    };
    res.cookie('refresh_token', rawToken, cookieOpts);
};

/**
 * Start a 14-day trial for a newly created business.
 */
const startTrial = async (businessId) => {
    const trialStartDate = new Date();
    const trialEndDate   = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    await Business.findByIdAndUpdate(businessId, {
        trialStartDate,
        trialEndDate,
        isTrialActive: true,
        subscriptionStatus: 'trial',
    });
};

/* ─── register ────────────────────────────────────────────────────────── */

export const register = async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password)
            return res.status(400).json({ success: false, message: 'Please provide all required fields' });

        if (await User.findOne({ email }))
            return res.status(400).json({ success: false, message: 'User already exists' });

        const user = await User.create({ name, email, password });

        // Legacy Client record
        await Client.create({ userId: user._id, botName: `${name.split(' ')[0]}'s Bot` });

        const userResponse = await User.findById(user._id).select('-password -googleId');

        const accessToken = makeAccessToken(userResponse);
        await issueRefreshToken(userResponse, res);

        res.status(201).json({ success: true, user: userResponse, accessToken });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ success: false, message: 'Server error during registration' });
    }
};

/* ─── login ───────────────────────────────────────────────────────────── */

export const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password)
            return res.status(400).json({ success: false, message: 'Please provide email and password' });

        const user = await User.findOne({ email }).select('+password');
        if (!user || !(await user.matchPassword(password)))
            return res.status(401).json({ success: false, message: 'Invalid credentials' });

        const userResponse = await User.findById(user._id).select('-password -googleId');

        const accessToken = makeAccessToken(userResponse);
        await issueRefreshToken(userResponse, res);

        res.status(200).json({ success: true, user: userResponse, accessToken });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: 'Server error during login' });
    }
};

/* ─── googleAuth ──────────────────────────────────────────────────────── */

export const googleAuth = async (req, res) => {
    try {
        const { credential } = req.body;
        const ticket  = await googleClient.verifyIdToken({
            idToken: credential,
            audience: process.env.GOOGLE_CLIENT_ID,
        });
        const { sub: googleId, email, name, picture: avatar } = ticket.getPayload();

        let user      = await User.findOne({ googleId });
        let isNewUser = false;

        if (!user) {
            user      = await User.create({ googleId, email, name, avatar });
            isNewUser = true;
            await Client.create({ userId: user._id, botName: `${name.split(' ')[0]}'s Bot` });
        }

        const userResponse = await User.findById(user._id).select('-password -googleId');

        const accessToken = makeAccessToken(userResponse);
        await issueRefreshToken(userResponse, res);

        res.status(200).json({
            success: true,
            message: isNewUser ? 'User created successfully' : 'Login successful',
            user: userResponse,
            accessToken,
        });
    } catch (error) {
        console.error('Google Auth Error:', error);
        res.status(401).json({ success: false, message: 'Invalid Google token' });
    }
};

/* ─── refresh ─────────────────────────────────────────────────────────── */

export const refresh = async (req, res) => {
    try {
        const rawToken = req.cookies?.refresh_token;
        if (!rawToken)
            return res.status(401).json({ success: false, message: 'No refresh token' });

        const hash    = crypto.createHash('sha256').update(rawToken).digest('hex');
        const stored  = await RefreshToken.findOne({ tokenHash: hash });

        if (!stored || stored.isRevoked || stored.expiresAt < new Date())
            return res.status(401).json({ success: false, message: 'Refresh token invalid or expired' });

        const user = await User.findById(stored.userId).select('-password -googleId');
        if (!user)
            return res.status(401).json({ success: false, message: 'User not found' });

        // Rotate: revoke old token, issue new pair
        stored.isRevoked = true;
        await stored.save();

        const accessToken = makeAccessToken(user);
        await issueRefreshToken(user, res);

        res.status(200).json({ success: true, user, accessToken });
    } catch (error) {
        console.error('Refresh error:', error);
        res.status(500).json({ success: false, message: 'Server error during token refresh' });
    }
};

/* ─── logout ──────────────────────────────────────────────────────────── */

export const logout = async (req, res) => {
    try {
        const rawToken = req.cookies?.refresh_token;
        if (rawToken) {
            const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
            await RefreshToken.findOneAndUpdate({ tokenHash: hash }, { isRevoked: true });
        }

        const cookieOpts = {
            httpOnly: true,
            secure:   process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
            path:     '/',
        };
        res.clearCookie('refresh_token', cookieOpts);
        // Also clear legacy jwt cookie if present
        res.clearCookie('jwt', cookieOpts);

        res.status(200).json({ success: true, message: 'Logged out' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ success: false, message: 'Server error during logout' });
    }
};

/* ─── getMe ───────────────────────────────────────────────────────────── */

export const getMe = async (req, res) => {
    try {
        res.status(200).json({ success: true, user: req.user });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

/* ─── updateProfile ───────────────────────────────────────────────────── */

export const updateProfile = async (req, res) => {
    try {
        const { name, currentPassword, newPassword } = req.body;
        const user = await User.findById(req.user._id).select('+password');
        if (!user)
            return res.status(404).json({ success: false, message: 'User not found' });

        if (name?.trim()) user.name = name.trim();

        if (newPassword) {
            if (!currentPassword)
                return res.status(400).json({ success: false, message: 'Current password required' });
            if (!user.password)
                return res.status(400).json({ success: false, message: 'Password update unavailable for Google accounts' });
            if (!(await user.matchPassword(currentPassword)))
                return res.status(400).json({ success: false, message: 'Current password is incorrect' });
            if (newPassword.length < 6)
                return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
            user.password = newPassword;
        }

        await user.save();
        const userResponse = await User.findById(user._id).select('-password -googleId');
        res.status(200).json({ success: true, user: userResponse, message: 'Profile updated' });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
