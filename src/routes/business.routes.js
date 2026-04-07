import { Router } from 'express';
import Business from '../models/Business.js';
import Chatbot from '../models/Chatbot.js';
import ApiKey from '../models/ApiKey.js';
import { protect } from '../middleware/auth.middleware.js';

const router = Router();

// @desc    Create business profile during onboarding
// @route   POST /api/business
// @access  Private
router.post('/', protect, async (req, res) => {
    try {
        const { business_name, website_url, business_type, support_email, timezone, primary_language } = req.body;

        if (!business_name) {
            return res.status(400).json({ success: false, message: 'Business name is required' });
        }

        // Prevent creating duplicate business
        const existing = await Business.findOne({ userId: req.user._id });
        if (existing) {
            return res.status(400).json({ success: false, message: 'Business profile already exists', business: existing });
        }

        const trialStartDate = new Date();
        const trialEndDate   = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

        const business = await Business.create({
            userId: req.user._id,
            business_name,
            website_url,
            business_type,
            support_email,
            timezone,
            primary_language,
            trialStartDate,
            trialEndDate,
            isTrialActive:      true,
            subscriptionStatus: 'trial',
        });

        // Auto-generate API key for this business
        const apiKeyRecord = await ApiKey.generate(business._id);

        res.status(201).json({ success: true, business, api_key: apiKeyRecord.api_key });
    } catch (error) {
        console.error('Create business error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @desc    Get current user's business profile
// @route   GET /api/business/me
// @access  Private
router.get('/me', protect, async (req, res) => {
    try {
        const business = await Business.findOne({ userId: req.user._id });

        if (!business) {
            return res.status(200).json({ success: true, hasBusinessProfile: false, business: null });
        }

        const chatbot = await Chatbot.findOne({ businessId: business._id });
        const apiKeyRecord = await ApiKey.findOne({ businessId: business._id });

        res.status(200).json({
            success: true,
            hasBusinessProfile: true,
            business,
            chatbot,
            api_key: apiKeyRecord?.api_key || null
        });
    } catch (error) {
        console.error('Get business error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @desc    Get business profile for dashboard
// @route   GET /api/business
// @access  Private
router.get('/', protect, async (req, res) => {
    try {
        const business = await Business.findOne({ userId: req.user._id });
        res.status(200).json({ success: true, data: business });
    } catch (error) {
        console.error('Get business error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

export default router;
