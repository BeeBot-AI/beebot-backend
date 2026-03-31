import { Router } from 'express';
import Client from '../models/Client.js';
import { protect } from '../middleware/auth.middleware.js';

const router = Router();

// Get current user's Client config and usage stats
router.get('/me', protect, async (req, res) => {
    try {
        const userId = req.user._id;
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
router.put('/me', protect, async (req, res) => {
    try {
        const userId = req.user._id;
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
