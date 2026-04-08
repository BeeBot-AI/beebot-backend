import { Router }   from 'express';
import axios         from 'axios';
import jwt           from 'jsonwebtoken';
import multer        from 'multer';
import path          from 'path';
import fs            from 'fs';
import { fileURLToPath } from 'url';
import User          from '../models/User.js';
import ApiKey        from '../models/ApiKey.js';
import Chatbot       from '../models/Chatbot.js';
import Conversation  from '../models/Conversation.js';
import Message       from '../models/Message.js';
import Business      from '../models/Business.js';
import config        from '../config.js';
import { getIO }     from '../socket.js';

// ── Image upload storage setup ────────────────────────────────────────────────
const __filename  = fileURLToPath(import.meta.url);
const __dirname   = path.dirname(__filename);
const uploadsDir  = path.join(__dirname, '../../../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const imageStorage = multer.diskStorage({
    destination: uploadsDir,
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);
    },
});
const imageUpload = multer({
    storage: imageStorage,
    limits: { fileSize: 5 * 1024 * 1024 },          // 5 MB cap
    fileFilter: (_req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Only image files are allowed'));
    },
});

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
            business_id:           business._id.toString(),
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
// POST /api/chat/request-human
// Widget calls this when visitor clicks "Start Chat" in the handoff modal.
// Flags the conversation as needs_human and notifies all connected dashboard
// agents for this business in real-time via Socket.io.
// Auth: x-api-key header.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/request-human', async (req, res) => {
    try {
        const apiKey = req.headers['x-api-key'];
        const { conversation_id, visitor_id } = req.body;

        if (!apiKey)           return res.status(400).json({ error: 'Missing x-api-key header' });
        if (!conversation_id)  return res.status(400).json({ error: 'Missing conversation_id' });

        const apiKeyRecord = await ApiKey.findOne({ api_key: apiKey }).populate('businessId');
        if (!apiKeyRecord || !apiKeyRecord.businessId) {
            return res.status(401).json({ error: 'Invalid API key' });
        }

        const conv = await Conversation.findById(conversation_id);
        if (!conv) return res.status(404).json({ error: 'Conversation not found' });

        // Only flag if not already taken over or resolved
        if (conv.status === 'active' || conv.status === 'needs_human') {
            conv.status = 'needs_human';
            await conv.save();
        }

        // Emit to all dashboard agents for this business
        const io = getIO();
        if (io) {
            const bizId = apiKeyRecord.businessId._id.toString();
            io.to(`business_${bizId}`).emit('visitor:request_human', {
                conversationId: conversation_id,
                visitorId: visitor_id || conv.visitor_id,
                timestamp: Date.now(),
            });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('[REQUEST-HUMAN] Error:', error.message);
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

        // Try Bearer token auth (Playground / dashboard — access token sent via Authorization header)
        const authHeader = req.headers.authorization;
        if (authHeader?.startsWith('Bearer ')) {
            try {
                const jwtSecret = process.env.JWT_SECRET || 'fallback_secret_for_dev_only';
                const decoded = jwt.verify(authHeader.split(' ')[1], jwtSecret);
                business = await Business.findOne({ userId: decoded.userId });
            } catch (err) {
                if (err.name === 'TokenExpiredError') {
                    return res.status(401).json({ code: 'TOKEN_EXPIRED', error: 'Access token expired' });
                }
                console.error('[CHAT] Bearer token verification failed:', err.message);
            }
        }

        // Fallback: API key auth (widget embed)
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

        const io        = getIO();
        const convIdStr = conversation._id.toString();
        const isImageMsg = query.startsWith('__img__:');

        // ── Save user message (always) ────────────────────────────────────
        const userMsg = await Message.create({
            conversationId: conversation._id,
            role: 'user',
            content: query,
        });

        // Push to dashboard in real-time regardless of AI / human mode
        if (io) {
            io.to(`business_${businessId}`).emit('visitor:message', {
                message: {
                    _id: userMsg._id,
                    role: 'user',
                    content: query,
                    timestamp: userMsg.timestamp,
                    conversationId: convIdStr,
                },
            });
        }

        // ── Human takeover: skip AI, route to agent ────────────────────
        if (conversation.human_takeover) {
            if (io) {
                io.to(`conv_${convIdStr}`).emit('visitor:message', {
                    message: {
                        _id: userMsg._id,
                        role: 'user',
                        content: query,
                        timestamp: userMsg.timestamp,
                        conversationId: convIdStr,
                    },
                });
                io.to(`business_${businessId}`).emit('conversation:activity', { conversationId: convIdStr });
            }
            return res.json({ response: null, conversation_id: conversation._id, human_mode: true });
        }

        // ── Image message: acknowledge without calling AI ──────────────
        if (isImageMsg) {
            const ackMsg = await Message.create({
                conversationId: conversation._id,
                role: 'assistant',
                content: 'Image received! How can I help you?',
            });
            if (io) {
                io.to(`business_${businessId}`).emit('assistant:message', {
                    conversationId: convIdStr,
                    message: { _id: ackMsg._id, role: 'assistant', content: ackMsg.content, timestamp: ackMsg.timestamp },
                });
                io.to(`business_${businessId}`).emit('conversation:activity', { conversationId: convIdStr });
            }
            return res.json({ response: ackMsg.content, conversation_id: conversation._id });
        }

        // ── AI response ────────────────────────────────────────────────
        const chatbot = await Chatbot.findOne({ businessId: business._id });
        const botConfig = chatbot ? {
            bot_name:         chatbot.bot_name,
            company_name:     business.business_name,
            tone:             chatbot.bot_tone,
            welcome_message:  chatbot.welcome_message,
            fallback_message: chatbot.fallback_message
        } : { company_name: business.business_name };

        let aiResponse;
        try {
            aiResponse = await axios.post(`${config.PYTHON_SERVICE_URL}/api/chat`, {
                query,
                business_id: businessId,
                bot_settings: botConfig
            }, { timeout: 45000 });
        } catch (aiError) {
            console.error(`[CHAT] AI service failed:`, aiError.response?.data?.detail || aiError.message);
            return res.status(502).json({
                error: 'AI service is temporarily unavailable',
                detail: aiError.response?.data?.detail || aiError.message
            });
        }

        const answer = aiResponse.data.answer;

        const assistantMsg = await Message.create({
            conversationId: conversation._id,
            role: 'assistant',
            content: answer
        });

        await Business.findByIdAndUpdate(business._id, { $inc: { message_count: 1 } });

        // Push AI response to dashboard in real-time
        if (io) {
            io.to(`business_${businessId}`).emit('assistant:message', {
                conversationId: convIdStr,
                message: {
                    _id: assistantMsg._id,
                    role: 'assistant',
                    content: answer,
                    timestamp: assistantMsg.timestamp,
                },
            });
            io.to(`business_${businessId}`).emit('conversation:activity', { conversationId: convIdStr });
        }

        res.json({ response: answer, conversation_id: conversation._id });
    } catch (error) {
        console.error('[CHAT] Unhandled error:', error.message, error.stack);
        res.status(500).json({ error: 'Internal Server Error', detail: error.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/chat/upload-image
// Widget image upload. Returns a publicly accessible URL.
// Auth: x-api-key header.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/upload-image', imageUpload.single('image'), async (req, res) => {
    try {
        const apiKey = req.headers['x-api-key'];
        if (!apiKey) return res.status(400).json({ error: 'Missing x-api-key header' });

        const apiKeyRecord = await ApiKey.findOne({ api_key: apiKey });
        if (!apiKeyRecord) return res.status(401).json({ error: 'Invalid API key' });

        if (!req.file) return res.status(400).json({ error: 'No image provided' });

        const imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
        res.json({ success: true, url: imageUrl });
    } catch (error) {
        console.error('[UPLOAD-IMAGE] Error:', error.message);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
