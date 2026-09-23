const crypto = require('crypto');
const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  appointmentId: { type: String, required: true, unique: true },
  doctorId: { type: String, required: true },
  patientId: { type: String, required: true },
  // Meeting room identifier. Random and unguessable, so knowing an
  // appointment id does not let anyone work out the room (V-D05).
  roomName: { type: String, required: true, unique: true },
  // Set from deployment configuration only, never from a request (V-D15).
  signalingUrl: { type: String },
  status: { type: String, enum: ['active', 'ended'], default: 'active' },
  createdAt: { type: Date, default: Date.now },
  endedAt: { type: Date }
});

sessionSchema.statics.generateRoomName = function generateRoomName() {
  return `medsync-${crypto.randomBytes(18).toString('hex')}`;
};

module.exports = mongoose.model('Session', sessionSchema);
