const mongoose = require('mongoose');

/**
 * Links a provider account to a MedSync account.
 *
 * The subject claim, not the email address, is the identifier the link is keyed
 * on: an email address can be reassigned by its domain owner, while the subject
 * is stable for the life of the provider account.
 */
const oauthIdentitySchema = new mongoose.Schema(
  {
    provider: { type: String, required: true, default: 'google' },
    subject: { type: String, required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    localId: { type: String, required: true },
    role: { type: String, required: true, enum: ['patient', 'doctor', 'admin'], default: 'patient' },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

oauthIdentitySchema.index({ provider: 1, subject: 1 }, { unique: true });

module.exports = mongoose.model('OAuthIdentity', oauthIdentitySchema);
