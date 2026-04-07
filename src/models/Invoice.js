import mongoose from 'mongoose';

const invoiceSchema = new mongoose.Schema({
    clientId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    billingPeriod:   { type: String, required: true }, // "YYYY-MM"
    resolutionCount: { type: Number, default: 0 },
    amountINR:       { type: Number, default: 0 },     // resolutionCount × 0.99
    polarOrderId:    { type: String, default: null },
    cashfreeOrderId: { type: String, default: null },
    paymentMethod:   { type: String, enum: ['card', 'upi', null], default: null },
    status:          { type: String, enum: ['pending', 'paid', 'failed'], default: 'pending' },
    createdAt:       { type: Date, default: Date.now },
});

invoiceSchema.index({ clientId: 1, billingPeriod: 1 }, { unique: true });

export default mongoose.model('Invoice', invoiceSchema);
