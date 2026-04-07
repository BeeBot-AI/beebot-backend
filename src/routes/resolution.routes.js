import express from 'express';
import { protect } from '../middleware/auth.middleware.js';
import {
    markResolution,
    getResolutionCount,
    getDashboardStats,
} from '../controllers/resolution.controller.js';
import ApiKey    from '../models/ApiKey.js';
import Feedback  from '../models/Feedback.js';

const router = express.Router();

// Called by the widget after user clicks "Yes, resolved"
// Auth: x-api-key (public widget) OR JWT (internal)
router.post('/mark', markResolution);

// Called by the widget when user clicks "No" on the resolution prompt
// and submits written feedback.
router.post('/feedback', async (req, res) => {
    try {
        const { conversationId, visitorId, feedback } = req.body;
        const apiKey = req.headers['x-api-key'] || req.body.apiKey;

        if (!conversationId || !feedback)
            return res.status(400).json({ success: false, message: 'conversationId and feedback required' });

        let businessId;
        if (apiKey) {
            const keyDoc = await ApiKey.findOne({ api_key: apiKey }).populate('businessId');
            if (!keyDoc) return res.status(401).json({ success: false, message: 'Invalid API key' });
            businessId = keyDoc.businessId._id;
        } else {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        const doc = await Feedback.create({
            businessId,
            conversationId,
            visitorId: visitorId || 'anonymous',
            feedback: feedback.trim().slice(0, 1000),
        });

        res.status(201).json({ success: true, feedbackId: doc._id });
    } catch (err) {
        console.error('[Feedback] Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Protected — dashboard use
router.get('/count',  protect, getResolutionCount);
router.get('/stats',  protect, getDashboardStats);

export default router;
