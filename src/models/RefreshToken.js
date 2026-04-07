import mongoose from 'mongoose';

const refreshTokenSchema = new mongoose.Schema({
    userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true }, // SHA-256 hash of the raw token
    expiresAt: { type: Date, required: true, index: true },
    isRevoked: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
});

// Auto-delete expired tokens after 25 days (TTL index, slightly longer than 20d expiry)
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 25 });

// Revoke all tokens for a user (call on logout-all or password change)
refreshTokenSchema.statics.revokeAllForUser = function (userId) {
    return this.updateMany({ userId, isRevoked: false }, { isRevoked: true });
};

export default mongoose.model('RefreshToken', refreshTokenSchema);
