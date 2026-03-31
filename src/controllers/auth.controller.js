import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Client from '../models/Client.js';
import { OAuth2Client } from 'google-auth-library';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const generateTokenAndSetCookie = (user, res) => {
    const jwtSecret = process.env.JWT_SECRET || 'fallback_secret_for_dev_only';

    // Create JWT containing user ID and role
    const token = jwt.sign(
        { userId: user._id, role: user.role },
        jwtSecret,
        { expiresIn: '30d' }
    );

    // Set token as an HTTP-only cookie
    const options = {
        expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
    };

    res.cookie('jwt', token, options);

    return token;
};

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
export const register = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ success: false, message: 'Please provide all required fields' });
        }

        const userExists = await User.findOne({ email });

        if (userExists) {
            return res.status(400).json({ success: false, message: 'User already exists' });
        }

        const user = await User.create({
            name,
            email,
            password
        });

        // Automatically create a default Client configuration for new users
        await Client.create({
            userId: user._id,
            botName: `${name.split(' ')[0]}'s Bot`
        });

        // Do not return password in response
        const userResponse = await User.findById(user._id).select('-password -googleId');

        generateTokenAndSetCookie(userResponse, res);

        res.status(201).json({
            success: true,
            user: userResponse
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ success: false, message: 'Server error during registration' });
    }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
export const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Please provide email and password' });
        }

        // Include password field which is excluded by default
        const user = await User.findOne({ email }).select('+password');

        if (!user || !(await user.matchPassword(password))) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        generateTokenAndSetCookie(user, res);

        const userResponse = await User.findById(user._id).select('-password -googleId');

        res.status(200).json({
            success: true,
            user: userResponse
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: 'Server error during login' });
    }
};

// @desc    Google OAuth login/signup
// @route   POST /api/auth/google
// @access  Public
export const googleAuth = async (req, res) => {
    const { credential } = req.body;

    try {
        const ticket = await googleClient.verifyIdToken({
            idToken: credential,
            audience: process.env.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        const { sub: googleId, email, name, picture: avatar } = payload;

        let user = await User.findOne({ googleId });
        let isNewUser = false;

        if (!user) {
            user = await User.create({ googleId, email, name, avatar });
            isNewUser = true;

            await Client.create({
                userId: user._id,
                botName: `${name.split(' ')[0]}'s Bot`
            });
        }

        generateTokenAndSetCookie(user, res);

        const userResponse = await User.findById(user._id).select('-password -googleId');

        res.status(200).json({
            success: true,
            message: isNewUser ? 'User created successfully' : 'Login successful',
            user: userResponse
        });

    } catch (error) {
        console.error('Google Auth Error:', error);
        res.status(401).json({ success: false, message: 'Invalid Google token' });
    }
};

// @desc    Log user out / clear cookie
// @route   POST /api/auth/logout
// @access  Public
export const logout = (req, res) => {
    // Use clearCookie to instantly remove the cookie, not set it to 'none'
    res.clearCookie('jwt', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
    });

    res.status(200).json({ success: true, message: 'User logged out' });
};

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
export const getMe = async (req, res) => {
    try {
        // req.user is set in protect middleware
        res.status(200).json({
            success: true,
            user: req.user
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
export const updateProfile = async (req, res) => {
    try {
        const { name, currentPassword, newPassword } = req.body;

        const user = await User.findById(req.user._id).select('+password');
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        if (name && name.trim()) {
            user.name = name.trim();
        }

        if (newPassword) {
            if (!currentPassword) {
                return res.status(400).json({ success: false, message: 'Current password is required to set a new password' });
            }
            // Google-auth users may not have a password
            if (!user.password) {
                return res.status(400).json({ success: false, message: 'Password update not available for Google sign-in accounts' });
            }
            const isMatch = await user.matchPassword(currentPassword);
            if (!isMatch) {
                return res.status(400).json({ success: false, message: 'Current password is incorrect' });
            }
            if (newPassword.length < 6) {
                return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
            }
            user.password = newPassword;
        }

        await user.save();

        const userResponse = await User.findById(user._id).select('-password -googleId');
        res.status(200).json({ success: true, user: userResponse, message: 'Profile updated successfully' });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
