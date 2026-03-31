import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
    role: { type: String, enum: ['user', 'assistant', 'agent'], required: true },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});

export default mongoose.model('Message', messageSchema);
