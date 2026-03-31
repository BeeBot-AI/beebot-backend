import { Router } from 'express';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import ApiKey from '../models/ApiKey.js';
import Chatbot from '../models/Chatbot.js';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import Business from '../models/Business.js';
import config from '../config.js';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/chat/config
// Called by the BeeBot widget on load to personalise itself.
// Auth: x-api-key header.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/config', async (req, res) => {
    try {
        const apiKey = req.headers['x-api-key'];
        if (!apiKey) return res.status(400).json({ error: 'Missing x-api-key header' });

        const apiKeyRecord = await ApiKey.findOne({ api_key: apiKey }).populate('businessId');
        if (!apiKeyRecord || !apiKeyRecord.businessId) {
            return res.status(401).json({ error: 'Invalid API key' });
        }

        const business = apiKeyRecord.businessId;
        const chatbot  = await Chatbot.findOne({ businessId: business._id });

        res.json({
            bot_name:              chatbot?.bot_name              || 'Support Bot',
            welcome_message:       chatbot?.welcome_message       || 'Hi! How can I help you today?',
            fallback_message:      chatbot?.fallback_message      || "I don't have that information. Please contact support.",
            primary_color:         chatbot?.primary_color         || '#000000',
            conversation_starters: chatbot?.conversation_starters || [],
        });
    } catch (error) {
        console.error('[CONFIG] Error:', error.message);
        res.status(500).json({ error: 'Server error' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/chat/color
// Saves the widget's primary_color to the Chatbot record.
// Auth: x-api-key header (so the widget can call it without a user session).
// ─────────────────────────────────────────────────────────────────────────────
router.put('/color', async (req, res) => {
    try {
        const apiKey = req.headers['x-api-key'];
        const { primary_color } = req.body;

        if (!apiKey)        return res.status(400).json({ error: 'Missing x-api-key header' });
        if (!primary_color) return res.status(400).json({ error: 'Missing primary_color' });
        if (!/^#[0-9A-Fa-f]{6}$/.test(primary_color)) {
            return res.status(400).json({ error: 'Invalid color format — expected #rrggbb' });
        }

        const apiKeyRecord = await ApiKey.findOne({ api_key: apiKey }).populate('businessId');
        if (!apiKeyRecord || !apiKeyRecord.businessId) {
            return res.status(401).json({ error: 'Invalid API key' });
        }

        await Chatbot.findOneAndUpdate(
            { businessId: apiKeyRecord.businessId._id },
            { primary_color },
            { new: true }
        );

        res.json({ success: true, primary_color });
    } catch (error) {
        console.error('[COLOR] Error:', error.message);
        res.status(500).json({ error: 'Server error' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/chat
// Public widget chat — authenticated by API key OR internal JWT session.
// Supports conversation_id to thread messages in a single conversation.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
    try {
        const apiKey = req.headers['x-api-key'] || req.body.api_key;
        const { query, visitor_id, conversation_id } = req.body;

        console.log(`[CHAT] Incoming | origin: ${req.headers.origin} | hasApiKey: ${!!apiKey} | hasCookie: ${!!req.cookies?.jwt} | conversation_id: ${conversation_id || 'none'}`);

        if (!query) return res.status(400).json({ error: 'Missing query' });

        let business;

        // Try internal JWT session (Playground tab)
        if (req.cookies && req.cookies.jwt) {
            try {
                const jwtSecret = process.env.JWT_SECRET || 'fallback_secret_for_dev_only';
                const decoded = jwt.verify(req.cookies.jwt, jwtSecret);
                business = await Business.findOne({ userId: decoded.userId });
            } catch (err) {
                console.error('[CHAT] JWT verification failed:', err.message);
            }
        }

        // Fallback: API key auth
        if (!business) {
            const apiKeyRecord = await ApiKey.findOne({ api_key: apiKey }).populate('businessId');
            if (!apiKey || !apiKeyRecord) {
                return res.status(401).json({ error: 'Invalid or missing credentials' });
            }
            business = apiKeyRecord.businessId;
        }

        const businessId = business._id.toString();

        // Find existing conversation or create new one
        let conversation;
        if (conversation_id) {
            conversation = await Conversation.findById(conversation_id).catch(() => null);
        }
        if (!conversation) {
            conversation = await Conversation.create({
                businessId: business._id,
                visitor_id: visitor_id || 'anonymous'
            });
        }

        // Get chatbot config
        const chatbot = await Chatbot.findOne({ businessId: business._id });
        const botConfig = chatbot ? {
            company_name:     business.business_name,
            tone:             chatbot.bot_tone,
            welcome_message:  chatbot.welcome_message,
            fallback_message: chatbot.fallback_message
        } : { company_name: business.business_name };

        // Save user message
        await Message.create({ conversationId: conversation._id, role: 'user', content: query });

        // Call AI Service
        let aiResponse;
        try {
            aiResponse = await axios.post(`${config.PYTHON_SERVICE_URL}/api/chat`, {
                query,
                business_id: businessId,
                bot_settings: botConfig
            });
        } catch (aiError) {
            console.error(`[CHAT] AI service failed:`, aiError.response?.data?.detail || aiError.message);
            return res.status(502).json({
                error: 'AI service is temporarily unavailable',
                detail: aiError.response?.data?.detail || aiError.message
            });
        }

        const answer = aiResponse.data.answer;

        // Save assistant message
        await Message.create({ conversationId: conversation._id, role: 'assistant', content: answer });

        // Increment business message count
        await Business.findByIdAndUpdate(business._id, { $inc: { message_count: 1 } });

        res.json({ response: answer, conversation_id: conversation._id });
    } catch (error) {
        console.error('[CHAT] Unhandled error:', error.message, error.stack);
        res.status(500).json({ error: 'Internal Server Error', detail: error.message });
    }
});

export default router;
