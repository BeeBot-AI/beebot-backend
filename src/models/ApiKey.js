import mongoose from 'mongoose';
import crypto from 'crypto';

const apiKeySchema = new mongoose.Schema({
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, unique: true },
    api_key: { type: String, required: true, unique: true },
    created_at: { type: Date, default: Date.now }
});

// Static method to generate a new unique API key
apiKeySchema.statics.generate = function (businessId) {
    const randomPart = crypto.randomBytes(20).toString('hex');
    const api_key = `beebot_live_${randomPart}`;
    return this.create({ businessId, api_key });
};

export default mongoose.model('ApiKey', apiKeySchema);
