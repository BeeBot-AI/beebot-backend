import { Router } from 'express';
import jwt from 'jsonwebtoken';
import Client from '../models/Client.js';

const router = Router();

// Middleware to verify JWT
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Access denied' });

    const jwtSecret = process.env.JWT_SECRET || 'fallback_secret_for_dev_only';
    jwt.verify(token, jwtSecret, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
};

// Get current user's Client config and usage stats
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        let client = await Client.findOne({ userId });

        if (!client) {
            return res.status(404).json({ error: 'Client configuration not found' });
        }

        res.json({ client });
    } catch (error) {
        console.error('Error fetching client:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Update current user's Client config
router.put('/me', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const updates = req.body;

        // Prevent updating sensitive fields
        delete updates.currentMonthUsage;
        delete updates.billingTier;
        delete updates.isActive;
        delete updates._id;
        delete updates.userId;

        const updatedClient = await Client.findOneAndUpdate(
            { userId },
            { $set: updates },
            { new: true }
        );

        if (!updatedClient) {
            return res.status(404).json({ error: 'Client configuration not found' });
        }

        res.json({ client: updatedClient });
    } catch (error) {
        console.error('Error updating client:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
