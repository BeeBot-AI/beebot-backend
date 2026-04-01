import { Router } from 'express';
import Chatbot from '../models/Chatbot.js';
import Business from '../models/Business.js';
import { protect } from '../middleware/auth.middleware.js';

const router = Router();

// @desc    Create or update chatbot config
// @route   POST /api/chatbot
// @access  Private
router.post('/', protect, async (req, res) => {
    try {
        const business = await Business.findOne({ userId: req.user._id });
        if (!business) {
            return res.status(404).json({ success: false, message: 'Business profile not found. Complete onboarding first.' });
        }

        const { bot_name, bot_tone, welcome_message, fallback_message, primary_color, conversation_starters } = req.body;

        const updateFields = { bot_name, bot_tone, welcome_message, fallback_message };
        if (primary_color !== undefined) updateFields.primary_color = primary_color;
        if (conversation_starters !== undefined) updateFields.conversation_starters = conversation_starters;

        const chatbot = await Chatbot.findOneAndUpdate(
            { businessId: business._id },
            updateFields,
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );

        res.status(200).json({ success: true, chatbot });
    } catch (error) {
        console.error('Chatbot config error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @desc    Update chatbot config (partial update, e.g. color)
// @route   PUT /api/chatbot
// @access  Private
router.put('/', protect, async (req, res) => {
    try {
        const business = await Business.findOne({ userId: req.user._id });
        if (!business) {
            return res.status(404).json({ success: false, message: 'Business profile not found.' });
        }

        const { bot_name, bot_tone, welcome_message, fallback_message, primary_color, conversation_starters } = req.body;
        const updateFields = {};
        if (bot_name !== undefined) updateFields.bot_name = bot_name;
        if (bot_tone !== undefined) updateFields.bot_tone = bot_tone;
        if (welcome_message !== undefined) updateFields.welcome_message = welcome_message;
        if (fallback_message !== undefined) updateFields.fallback_message = fallback_message;
        if (primary_color !== undefined) updateFields.primary_color = primary_color;
        if (conversation_starters !== undefined) updateFields.conversation_starters = conversation_starters;

        const chatbot = await Chatbot.findOneAndUpdate(
            { businessId: business._id },
            updateFields,
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );

        res.status(200).json({ success: true, chatbot });
    } catch (error) {
        console.error('Chatbot update error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @desc    Get chatbot config
// @route   GET /api/chatbot/me
// @access  Private
router.get('/me', protect, async (req, res) => {
    try {
        const business = await Business.findOne({ userId: req.user._id });
        if (!business) {
            return res.status(404).json({ success: false, message: 'Business not found' });
        }

        const chatbot = await Chatbot.findOne({ businessId: business._id });
        res.status(200).json({ success: true, chatbot });
    } catch (error) {
        console.error('Get chatbot error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @desc    Get chatbot config for dashboard
// @route   GET /api/chatbot
// @access  Private
router.get('/', protect, async (req, res) => {
    try {
        const business = await Business.findOne({ userId: req.user._id });
        if (!business) {
            return res.status(200).json({ success: true, data: null });
        }
        const chatbot = await Chatbot.findOne({ businessId: business._id });
        res.status(200).json({ success: true, data: chatbot });
    } catch (error) {
        console.error('Get chatbot error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

export default router;
