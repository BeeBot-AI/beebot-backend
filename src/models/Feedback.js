import mongoose from 'mongoose';

const feedbackSchema = new mongoose.Schema({
    businessId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    conversationId: { type: String, required: true },
    visitorId:      { type: String, default: 'anonymous' },
    feedback:       { type: String, required: true, maxlength: 1000 },
    submittedAt:    { type: Date, default: Date.now },
});

feedbackSchema.index({ businessId: 1, submittedAt: -1 });

export default mongoose.model('Feedback', feedbackSchema);
