import mongoose from 'mongoose';

const clientSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    botName: { type: String, default: 'BeeBot Support' },
    primaryColor: { type: String, default: '#FFD700' },
    tone: { type: String, enum: ['Professional', 'Friendly', 'Concise', 'Persuasive'], default: 'Professional' },
    welcomeMessage: { type: String, default: 'Hi! How can I help you today?' },
    isActive: { type: Boolean, default: true },
    currentMonthUsage: { type: Number, default: 0 },
    billingTier: { type: String, enum: ['free', 'pro', 'pay-as-you-go'], default: 'pay-as-you-go' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

clientSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

export default mongoose.model('Client', clientSchema);
