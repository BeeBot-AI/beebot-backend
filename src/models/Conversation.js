import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema({
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true },
    visitor_id: { type: String, default: 'anonymous' },
    started_at: { type: Date, default: Date.now },
    status: { type: String, enum: ['active', 'resolved', 'needs_human'], default: 'active' },
    sentiment: { type: String, enum: ['positive', 'neutral', 'negative'], default: 'neutral' },
    human_takeover: { type: Boolean, default: false },
    visitor_context: {
        current_url: { type: String, default: '' },
        email: { type: String, default: null },
        name: { type: String, default: null }
    }
});

export default mongoose.model('Conversation', conversationSchema);
