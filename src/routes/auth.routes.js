import express from 'express';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Client from '../models/Client.js';

const router = express.Router();
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

router.post('/google', async (req, res) => {
    const { credential } = req.body;

    try {
        // 1. Verify Google token
        const ticket = await client.verifyIdToken({
            idToken: credential,
            audience: process.env.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        const { sub: googleId, email, name, picture: avatar } = payload;

        // 2. Find or create the user
        let user = await User.findOne({ googleId });
        let isNewUser = false;

        if (!user) {
            user = await User.create({ googleId, email, name, avatar });
            isNewUser = true;

            // 3. Automatically create a default Client configuration for new users
            await Client.create({
                userId: user._id,
                botName: `${name.split(' ')[0]}'s Bot`
            });
        }

        // 4. Generate JWT for our app
        // Note: In production you should have a secure JWT_SECRET in .env
        const jwtSecret = process.env.JWT_SECRET || 'fallback_secret_for_dev_only';
        const token = jwt.sign(
            { userId: user._id, email: user.email },
            jwtSecret,
            { expiresIn: '7d' }
        );

        res.status(200).json({
            success: true,
            message: isNewUser ? 'User created successfully' : 'Login successful',
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                avatar: user.avatar
            }
        });

    } catch (error) {
        console.error('Google Auth Error:', error);
        res.status(401).json({ success: false, message: 'Invalid Google token' });
    }
});

export default router;
