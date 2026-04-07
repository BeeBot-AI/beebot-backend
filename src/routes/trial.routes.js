import express from 'express';
import { protect } from '../middleware/auth.middleware.js';
import Business from '../models/Business.js';

const router = express.Router();

// GET /api/trial/status
router.get('/status', protect, async (req, res) => {
    try {
        const business = await Business.findOne({ userId: req.user._id });
        if (!business)
            return res.status(404).json({ success: false, message: 'Business not found' });

        const now           = new Date();
        const trialEndDate  = business.trialEndDate ? new Date(business.trialEndDate) : null;
        const isTrialActive = business.isTrialActive && trialEndDate && trialEndDate > now;

        // Auto-expire trial if past end date
        if (business.isTrialActive && trialEndDate && trialEndDate <= now) {
            await Business.findByIdAndUpdate(business._id, {
                isTrialActive:      false,
                subscriptionStatus: 'requires_payment',
            });
        }

        const daysLeft = isTrialActive
            ? Math.ceil((trialEndDate - now) / (1000 * 60 * 60 * 24))
            : 0;

        res.json({
            success: true,
            isTrialActive,
            daysLeft,
            trialEndDate:       trialEndDate?.toISOString() || null,
            subscriptionStatus: business.subscriptionStatus,
        });
    } catch (err) {
        console.error('Trial status error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

export default router;
