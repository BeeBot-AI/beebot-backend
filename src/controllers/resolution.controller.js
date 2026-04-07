import ApiKey      from '../models/ApiKey.js';
import Business    from '../models/Business.js';
import Conversation from '../models/Conversation.js';
import Resolution  from '../models/Resolution.js';

/* ── helper: current billing period ─────────────────────────────────── */
const billingPeriod = () => new Date().toISOString().slice(0, 7); // "YYYY-MM"

/* ── keywords that signal an "assumed" resolution ────────────────────── */
const ASSUMED_KEYWORDS = [
    'thanks', 'thank you', 'thank you!', 'got it', 'ok', 'okay',
    'great', 'perfect', 'that helped', 'understood', 'makes sense',
    'appreciate it', 'that works', 'solved', 'cheers',
];

const looksLikeAssumedResolution = (text = '') =>
    ASSUMED_KEYWORDS.some(kw => text.toLowerCase().trim().startsWith(kw));

/* ── ingest to Polar (no-op if SDK not configured) ───────────────────── */
const ingestToPolar = async (clientId, conversationId) => {
    if (!process.env.POLAR_ACCESS_TOKEN) return;
    try {
        const { Polar } = await import('@polar-sh/sdk');
        const polar = new Polar({ accessToken: process.env.POLAR_ACCESS_TOKEN });
        await polar.events.ingest({
            events: [{
                name: 'resolution',
                externalCustomerId: String(clientId),
                metadata: { conversationId, platform: 'beebot' },
            }],
        });
        await Resolution.findOneAndUpdate(
            { conversationId },
            { polarEventIngested: true }
        );
    } catch (err) {
        console.error('[Polar] Event ingest failed:', err.message);
    }
};

/* ── POST /api/resolutions/mark ─────────────────────────────────────── */
/**
 * Called by the widget. Two scenarios:
 *  (a) confirmed — user clicked "Yes, resolved ✓"
 *  (b) assumed   — internal call when user sends a closing message
 *
 * Body: { conversationId, resolutionType, apiKey?, lastUserMessage? }
 */
export const markResolution = async (req, res) => {
    try {
        const { conversationId, resolutionType, lastUserMessage } = req.body;
        const apiKeyHeader = req.headers['x-api-key'] || req.body.apiKey;

        if (!conversationId)
            return res.status(400).json({ success: false, message: 'conversationId required' });

        // Resolve the business via API key or JWT
        let business;
        if (apiKeyHeader) {
            const keyDoc = await ApiKey.findOne({ api_key: apiKeyHeader }).populate('businessId');
            if (!keyDoc) return res.status(401).json({ success: false, message: 'Invalid API key' });
            business = keyDoc.businessId;
        } else if (req.user) {
            business = await Business.findOne({ userId: req.user._id });
        }

        if (!business)
            return res.status(401).json({ success: false, message: 'Unauthorized' });

        // Determine resolution type
        let type = resolutionType || 'confirmed';
        if (!['confirmed', 'assumed'].includes(type)) {
            // Auto-detect from last user message
            type = looksLikeAssumedResolution(lastUserMessage) ? 'assumed' : 'confirmed';
        }

        // Guard: one resolution per conversation
        const existing = await Resolution.findOne({ conversationId });
        if (existing) {
            return res.status(200).json({ success: true, message: 'Already resolved', resolution: existing });
        }

        // Guard: don't count if conversation has escalated
        const conv = await Conversation.findById(conversationId).catch(() => null);
        if (conv?.status === 'needs_human') {
            return res.status(200).json({ success: false, message: 'Conversation escalated — not counted' });
        }

        const isTrialActive = business.isTrialActive && business.trialEndDate > new Date();

        const resolution = await Resolution.create({
            clientId:       business._id,
            conversationId,
            resolutionType: type,
            billingPeriod:  billingPeriod(),
            isBilled:       false,
            isTrial:        isTrialActive,
            polarEventIngested: false,
        });

        // Mark conversation resolved
        if (conv) {
            conv.status = 'resolved';
            conv.resolutionType = type;
            await conv.save();
        }

        // Ingest to Polar only for paying customers
        if (!isTrialActive && business.subscriptionStatus === 'active') {
            ingestToPolar(business._id, conversationId); // fire-and-forget
        }

        res.status(201).json({ success: true, resolution });
    } catch (err) {
        console.error('markResolution error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

/* ── GET /api/resolutions/count ─────────────────────────────────────── */
export const getResolutionCount = async (req, res) => {
    try {
        const period   = req.query.period || billingPeriod();
        const business = await Business.findOne({ userId: req.user._id });
        if (!business)
            return res.status(404).json({ success: false, message: 'Business not found' });

        const count = await Resolution.countDocuments({
            clientId:      business._id,
            billingPeriod: period,
        });
        res.json({ success: true, count, period });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

/* ── GET /api/resolutions/stats  (dashboard) ─────────────────────────── */
export const getDashboardStats = async (req, res) => {
    try {
        const business = await Business.findOne({ userId: req.user._id });
        if (!business)
            return res.status(404).json({ success: false, message: 'Business not found' });

        const period = billingPeriod();

        const [resolvedThisMonth, totalResolutions, openConversations] = await Promise.all([
            Resolution.countDocuments({ clientId: business._id, billingPeriod: period }),
            Resolution.countDocuments({ clientId: business._id }),
            Conversation.countDocuments({ businessId: business._id, status: 'active' }),
        ]);

        res.json({
            success: true,
            stats: {
                resolvedThisMonth,
                totalResolutions,
                openConversations,
                billingPeriod: period,
            },
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
