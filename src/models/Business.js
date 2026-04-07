import mongoose from 'mongoose';

const businessSchema = new mongoose.Schema({
    userId:           { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    business_name:    { type: String, required: true },
    website_url:      { type: String, default: '' },
    business_type:    { type: String, enum: ['course', 'saas', 'agency', 'ecommerce', 'other'], default: 'other' },
    support_email:    { type: String, default: '' },
    timezone:         { type: String, default: 'UTC' },
    primary_language: { type: String, default: 'English' },
    message_count:    { type: Number, default: 0 },
    created_at:       { type: Date, default: Date.now },

    // Trial
    trialStartDate:   { type: Date, default: null },
    trialEndDate:     { type: Date, default: null },
    isTrialActive:    { type: Boolean, default: false },

    // Subscription
    subscriptionStatus: {
        type: String,
        enum: ['trial', 'active', 'requires_payment', 'payment_failed', 'cancelled'],
        default: 'trial'
    },
    paymentMethod:      { type: String, enum: ['card', 'upi', null], default: null },
    polarCustomerId:    { type: String, default: null },
    polarSubscriptionId:{ type: String, default: null },
});

export default mongoose.model('Business', businessSchema);
