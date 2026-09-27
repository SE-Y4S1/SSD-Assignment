const mongoose = require('mongoose');

const availabilitySlotSchema = new mongoose.Schema(
  {
    day: {
      type: String,
      enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      required: true,
    },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    maxPatients: { type: Number, default: 1, min: 1 },
    isBooked: { type: Boolean, default: false },
  },
  { _id: true, timestamps: true }
);

const doctorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    specialty: { type: String, required: true },
    qualifications: [String],
    contact: {
      // Without lowercase and trim, the unique index treats Doc@x.com and
      // doc@x.com as two mailboxes, so one address can hold two accounts.
      // Patient.js already normalises; this did not (V-A16).
      email: { type: String, required: true, unique: true, lowercase: true, trim: true },
      phone: String,
    },
    password: { type: String, required: true },
    isVerified: { type: Boolean, default: false },
    consultationFee: { type: Number, default: 0, min: 0 },
    bio: String,
    photoUrl: String,
    availability: { type: [availabilitySlotSchema], default: [] },
    analytics: {
      averageConsultationDuration: { type: Number, default: 0 },
      patientSatisfactionScore: { type: Number, default: 0 },
      appointmentCompletionRate: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

doctorSchema.methods.toJSON = function () {
  const doctor = this.toObject();
  delete doctor.password;
  return doctor;
};

module.exports = mongoose.model('Doctor', doctorSchema);
