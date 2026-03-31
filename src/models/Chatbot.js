import mongoose from 'mongoose';

const chatbotSchema = new mongoose.Schema({
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, unique: true },
    bot_name: { type: String, default: 'BeeBot Support' },
    bot_tone: { type: String, enum: ['professional', 'friendly', 'concise', 'persuasive', 'empathetic'], default: 'professional' },
    welcome_message: { type: String, default: "Hi! I'm BeeBot. How can I help you today?" },
    fallback_message: { type: String, default: "I'm sorry, I don't have that information. Please contact support." },
    primary_color: { type: String, default: '#000000', match: /^#[0-9A-Fa-f]{6}$/ },
    conversation_starters: { type: [String], default: [] },
    created_at: { type: Date, default: Date.now }
});

export default mongoose.model('Chatbot', chatbotSchema);
