import { Router } from 'express';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import Business from '../models/Business.js';
import { protect } from '../middleware/auth.middleware.js';

const router = Router();

// @desc    Get all conversations for this business
// @route   GET /api/conversations
// @access  Private
router.get('/', protect, async (req, res) => {
    try {
        const business = await Business.findOne({ userId: req.user._id });
        if (!business) return res.status(404).json({ success: false, message: 'Business not found' });

        const conversations = await Conversation.find({ businessId: business._id })
            .sort({ human_takeover: -1, status: 1, started_at: -1 })
            .limit(50);

        // Fetch last message for preview
        const convIds = conversations.map(c => c._id);
        const lastMessages = await Message.aggregate([
            { $match: { conversationId: { $in: convIds } } },
            { $sort: { timestamp: -1 } },
            { $group: { _id: "$conversationId", content: { $first: "$content" }, timestamp: { $first: "$timestamp" } } }
        ]);

        const formatted = conversations.map(c => {
            const lastMsg = lastMessages.find(m => m._id.toString() === c._id.toString());
            return {
                ...c.toObject(),
                last_message: lastMsg ? lastMsg.content : null,
                last_message_time: lastMsg ? lastMsg.timestamp : c.started_at
            };
        });

        res.status(200).json({ success: true, data: formatted });
    } catch (error) {
        console.error('Conversation fetch error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @desc    Get messages for a specific conversation
// @route   GET /api/conversations/:id/messages
// @access  Private
router.get('/:id/messages', protect, async (req, res) => {
    try {
        const messages = await Message.find({ conversationId: req.params.id }).sort({ timestamp: 1 });
        res.status(200).json({ success: true, messages });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});
// @desc    Toggle Human Takeover
// @route   PUT /api/conversations/:id/takeover
// @access  Private
router.put('/:id/takeover', protect, async (req, res) => {
    try {
        const conv = await Conversation.findById(req.params.id);
        if (!conv) return res.status(404).json({ success: false, message: 'Not found' });

        conv.human_takeover = !conv.human_takeover;
        if (conv.human_takeover) conv.status = 'needs_human';
        else conv.status = 'active';

        await conv.save();
        res.status(200).json({ success: true, conversation: conv });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @desc    Update Status
// @route   PUT /api/conversations/:id/status
// @access  Private
router.put('/:id/status', protect, async (req, res) => {
    try {
        const conv = await Conversation.findById(req.params.id);
        if (!conv) return res.status(404).json({ success: false, message: 'Not found' });

        conv.status = req.body.status || conv.status;
        if (conv.status === 'resolved') conv.human_takeover = false;

        await conv.save();
        res.status(200).json({ success: true, conversation: conv });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @desc    Human Agent Reply
// @route   POST /api/conversations/:id/reply
// @access  Private
router.post('/:id/reply', protect, async (req, res) => {
    try {
        const { content } = req.body;
        if (!content) return res.status(400).json({ success: false, message: 'Content required' });

        const message = await Message.create({
            conversationId: req.params.id,
            role: 'agent',
            content
        });

        res.status(201).json({ success: true, message });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});
// @desc    Get dashboard stats
// @route   GET /api/conversations/stats
// @access  Private
router.get('/stats', protect, async (req, res) => {
    try {
        const business = await Business.findOne({ userId: req.user._id });
        if (!business) return res.status(404).json({ success: false, message: 'Business not found' });

        const totalConversations = await Conversation.countDocuments({ businessId: business._id });
        const conversationIds = await Conversation.find({ businessId: business._id }).select('_id');
        const ids = conversationIds.map(c => c._id);
        const totalMessages = await Message.countDocuments({ conversationId: { $in: ids } });

        res.status(200).json({ success: true, stats: { totalConversations, totalMessages } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

export default router;
