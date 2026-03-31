import mongoose from 'mongoose';

const businessSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    business_name: { type: String, required: true },
    website_url: { type: String, default: '' },
    business_type: { type: String, enum: ['course', 'saas', 'agency', 'ecommerce', 'other'], default: 'other' },
    support_email: { type: String, default: '' },
    timezone: { type: String, default: 'UTC' },
    primary_language: { type: String, default: 'English' },
    message_count: { type: Number, default: 0 },
    created_at: { type: Date, default: Date.now }
});

export default mongoose.model('Business', businessSchema);
