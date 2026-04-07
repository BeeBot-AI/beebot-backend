import mongoose from 'mongoose';

const resolutionSchema = new mongoose.Schema({
    clientId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    conversationId: { type: String, required: true, unique: true }, // one resolution per conversation
    resolutionType: { type: String, enum: ['confirmed', 'assumed'], required: true },
    resolvedAt:     { type: Date, default: Date.now },
    billingPeriod:  { type: String, required: true }, // "YYYY-MM" format
    isBilled:       { type: Boolean, default: false },
    isTrial:        { type: Boolean, default: false },
    polarEventIngested: { type: Boolean, default: false },
});

resolutionSchema.index({ clientId: 1, billingPeriod: 1 });
resolutionSchema.index({ conversationId: 1 }, { unique: true });

export default mongoose.model('Resolution', resolutionSchema);
