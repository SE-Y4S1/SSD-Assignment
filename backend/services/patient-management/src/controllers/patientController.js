const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
// Signed and checked through one module so the algorithm, issuer and audience
// are pinned in every service (V-A15).
const { signToken } = require('../config/tokens');
const axios = require('axios');
const Patient = require('../models/Patient');
const Prescription = require('../models/Prescription'); // Added for historical recovery
const crypto = require('crypto');
const { sendEvent } = require('../utils/kafka');
const { recordAccess } = require('../utils/audit');

const APPOINTMENT_SERVICE_URL =
  process.env.APPOINTMENT_SERVICE_URL || 'http://localhost:3003';

const DOCTOR_SERVICE_URL =
  process.env.DOCTOR_SERVICE_URL || 'http://localhost:3002';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const isAuthorisedToReadPatient = (reqUser, patientId) => {
  if (!reqUser) return false;
  if (['doctor', 'admin'].includes(reqUser.role)) return true;
  return reqUser.id === patientId || reqUser.patientId === patientId;
};

const ensureSelfOrProvider = (req, res, patientId) => {
  if (!isAuthorisedToReadPatient(req.user, patientId)) {
    res.status(403).json({ message: 'Forbidden: insufficient privileges to access this patient.' });
    return false;
  }
  return true;
};

const hasDoctorPatientRelationship = async (req, doctorId, patientId) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return false;

    const doctorResponse = await axios.get(
      `${DOCTOR_SERVICE_URL}/api/doctors/${doctorId}`,
      {
        headers: { Authorization: authHeader }
      }
    );

    const doctor = doctorResponse.data;

    if (!doctor || doctor.isVerified !== true) {
      return false;
    }

    const appointmentsResponse = await axios.get(
      `${APPOINTMENT_SERVICE_URL}/api/appointments/doctor/${doctorId}`,
      {
        headers: { Authorization: authHeader }
      }
    );

    const appointments = Array.isArray(appointmentsResponse.data)
      ? appointmentsResponse.data
      : [];

    return appointments.some(
      (appointment) =>
        appointment.patientId?.toString() === patientId.toString() &&
        !['cancelled', 'rejected'].includes(appointment.status)
    );
  } catch (error) {
    console.error(
      '[Patient Service] Care relationship check failed:',
      error.message
    );
    return false;
  }
};

const audit = (req, patientId, action, resource) =>
  recordAccess({
    patientId,
    accessedBy: req.user?.id || req.user?.email,
    accessedByRole: req.user?.role || 'system',
    action,
    resource,
    ipAddress: req.ip,
  });

// ─── Authentication ───────────────────────────────────────────────────────────

exports.register = async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone, dateOfBirth, gender, address, nationalId } = req.body;

    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ message: 'Email, password, first name, and last name are required.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters.' });
    }

    const existing = await Patient.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ message: 'A patient with this email already exists.' });

    const hashedPassword = await bcrypt.hash(password, 12);
    const patient = new Patient({
      email: email.toLowerCase(),
      password: hashedPassword,
      firstName,
      lastName,
      phone,
      dateOfBirth,
      gender,
      address,
      nationalId,
    });
    await patient.save();

    const token = signToken({
      userId: patient._id,
      patientId: patient._id,
      email: patient.email,
      role: 'patient',
    });

    await sendEvent('patient-events', {
      type: 'PATIENT_REGISTERED',
      patientId: patient._id,
      email: patient.email,
      name: `${patient.firstName} ${patient.lastName}`,
      timestamp: new Date(),
    });

    res.status(201).json({ token, patient });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password are required.' });

    const patient = await Patient.findOne({ email: email.toLowerCase() });
    if (!patient) return res.status(401).json({ message: 'Invalid email or password.' });
    if (patient.accountStatus !== 'active') {
      return res.status(403).json({ message: `Account is ${patient.accountStatus}.` });
    }

    const isMatch = await bcrypt.compare(password, patient.password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid email or password.' });

    patient.lastLoginAt = new Date();
    await patient.save();

    const token = signToken({
      userId: patient._id,
      patientId: patient._id,
      email: patient.email,
      role: 'patient',
    });

    res.status(200).json({ token, patient });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current and new passwords are required.' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'New password must be at least 8 characters.' });
    }

    const patient = await Patient.findById(req.user.patientId);
    if (!patient) return res.status(404).json({ message: 'Patient not found.' });

    const ok = await bcrypt.compare(currentPassword, patient.password);
    if (!ok) return res.status(401).json({ message: 'Current password is incorrect.' });

    patient.password = await bcrypt.hash(newPassword, 12);
    await patient.save();
    audit(req, patient._id, 'PASSWORD_CHANGED');
    res.status(200).json({ message: 'Password updated.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deactivateAccount = async (req, res) => {
  try {
    const patient = await Patient.findById(req.user.patientId);
    if (!patient) return res.status(404).json({ message: 'Patient not found.' });
    patient.accountStatus = 'deactivated';
    await patient.save();
    audit(req, patient._id, 'ACCOUNT_DEACTIVATED');
    res.status(200).json({ message: 'Account deactivated.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── Doctor / Admin scoped reads ──────────────────────────────────────────────

exports.getPatientForProvider = async (req, res) => {
  try {
    const patientId = req.params.patientId;

    if (!req.user) {
      return res.status(401).json({
        message: 'Authentication required.'
      });
    }

    // Admins can access patient records
    if (req.user.role === 'admin') {
      const patient = await Patient.findById(patientId);

      if (!patient) {
        return res.status(404).json({
          message: 'Patient not found'
        });
      }

      audit(req, patient._id, 'READ_FULL_RECORD', 'patient');

      return res.status(200).json({
        profile: {
          id: patient._id,
          firstName: patient.firstName,
          lastName: patient.lastName,
          email: patient.email,
          phone: patient.phone,
          dateOfBirth: patient.dateOfBirth,
          gender: patient.gender,
          bloodType: patient.bloodType,
          allergies: patient.allergies || [],
          chronicConditions: patient.chronicConditions || [],
          emergencyContact: patient.emergencyContact || {},
        },
        vitalSigns: patient.vitalSigns.slice(-10),
        vaccinations: patient.vaccinations,
        familyHistory: patient.familyHistory,
        medicalHistory: patient.medicalHistory,
        prescriptions: await Prescription.find({
          patientId: patient._id
        }),
        documents: patient.documents,
        healthScore: patient.computeHealthScore(),
      });
    }

    // Only doctors can access another patient's full record
    if (req.user.role !== 'doctor') {
      return res.status(403).json({
        message: 'Only verified doctors with a patient care relationship can access this record.'
      });
    }

    const doctorId = req.user.doctorId || req.user.id;

    // Require verified doctor + appointment/care relationship
    const authorized = await hasDoctorPatientRelationship(
      req,
      doctorId,
      patientId
    );

    if (!authorized) {
      return res.status(403).json({
        message: 'Forbidden: You must be a verified doctor with an appointment with this patient.'
      });
    }

    const patient = await Patient.findById(patientId);

    if (!patient) {
      return res.status(404).json({
        message: 'Patient not found'
      });
    }

    audit(req, patient._id, 'READ_FULL_RECORD', 'patient');

    res.status(200).json({
      profile: {
        id: patient._id,
        firstName: patient.firstName,
        lastName: patient.lastName,
        email: patient.email,
        phone: patient.phone,
        dateOfBirth: patient.dateOfBirth,
        gender: patient.gender,
        bloodType: patient.bloodType,
        allergies: patient.allergies || [],
        chronicConditions: patient.chronicConditions || [],
        emergencyContact: patient.emergencyContact || {},
      },
      vitalSigns: patient.vitalSigns.slice(-10),
      vaccinations: patient.vaccinations,
      familyHistory: patient.familyHistory,
      medicalHistory: patient.medicalHistory,
      prescriptions: await Prescription.find({
        patientId: patient._id
      }),
      documents: patient.documents,
      healthScore: patient.computeHealthScore(),
    });
  } catch (error) {
    console.error(
      '[Patient Service] Get patient for provider error:',
      error.message
    );

    res.status(500).json({
      message: 'Unable to retrieve patient record.'
    });
  }
};


exports.getPatientProfile = async (req, res) => {
  try {
    if (!ensureSelfOrProvider(req, res, req.params.patientId)) return;
    const patient = await Patient.findById(req.params.patientId).select('-password');
    if (!patient) return res.status(404).json({ message: 'Patient not found' });
    audit(req, patient._id, 'READ_PROFILE', 'profile');
    res.status(200).json(patient);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getPatientRecords = async (req, res) => {
  try {
    if (!ensureSelfOrProvider(req, res, req.params.patientId)) return;
    const patient = await Patient.findById(req.params.patientId);
    if (!patient) return res.status(404).json({ message: 'Patient not found' });
    audit(req, patient._id, 'READ_RECORDS', 'medicalHistory+prescriptions');
    res.status(200).json({
      medicalHistory: patient.medicalHistory,
      prescriptions: await Prescription.find({ patientId: req.params.patientId }),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getPatientDocuments = async (req, res) => {
  try {
    if (!ensureSelfOrProvider(req, res, req.params.patientId)) return;
    const patient = await Patient.findById(req.params.patientId);
    if (!patient) return res.status(404).json({ message: 'Patient not found' });
    audit(req, patient._id, 'READ_DOCUMENTS', 'documents');
    res.status(200).json(patient.documents);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Admin-only paginated patient listing with text search
exports.listPatients = async (req, res) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required.' });
    }

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 25);
    const skip = (page - 1) * limit;
    const search = (req.query.search || '').trim();
    const status = req.query.status;

    const filter = {};
    if (status) filter.accountStatus = status;
    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ];
    }

    const [items, total] = await Promise.all([
      Patient.find(filter, 'firstName lastName email phone dateOfBirth gender accountStatus createdAt lastLoginAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Patient.countDocuments(filter),
    ]);

    res.status(200).json({
      items,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Admin: read raw audit log
exports.getAuditLog = async (req, res) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ message: 'Admin access required.' });
    const patient = await Patient.findById(req.params.patientId).select('+auditLog');
    if (!patient) return res.status(404).json({ message: 'Patient not found.' });
    res.status(200).json((patient.auditLog || []).slice(-200).reverse());
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── Self-service profile ─────────────────────────────────────────────────────

exports.getProfile = async (req, res) => {
  try {
    const patient = await Patient.findById(req.user.patientId);
    if (!patient) return res.status(404).json({ message: 'Patient not found' });
    res.status(200).json({ ...patient.toJSON(), healthScore: patient.computeHealthScore() });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const allowed = [
      'firstName', 'lastName', 'phone', 'dateOfBirth', 'gender', 'address', 'nationalId',
      'bloodType', 'emergencyContact',
    ];
    const patient = await Patient.findById(req.user.patientId);
    if (!patient) return res.status(404).json({ message: 'Patient not found' });

    for (const key of allowed) {
      if (req.body[key] !== undefined) patient[key] = req.body[key];
    }
    await patient.save();
    audit(req, patient._id, 'UPDATE_PROFILE');

    await sendEvent('patient-events', {
      type: 'PATIENT_UPDATED',
      patientId: patient._id,
      email: patient.email,
      timestamp: new Date(),
    });

    res.status(200).json(patient);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── Allergies ────────────────────────────────────────────────────────────────

exports.listAllergies = async (req, res) => {
  const p = await Patient.findById(req.user.patientId);
  if (!p) return res.status(404).json({ message: 'Patient not found' });
  res.json(p.allergies);
};

exports.addAllergy = async (req, res) => {
  const { substance, severity, reaction, diagnosedDate } = req.body;
  if (!substance) return res.status(400).json({ message: 'substance is required' });
  const p = await Patient.findById(req.user.patientId);
  if (!p) return res.status(404).json({ message: 'Patient not found' });
  p.allergies.push({ substance, severity, reaction, diagnosedDate });
  await p.save();
  audit(req, p._id, 'ADD_ALLERGY', substance);
  res.status(201).json(p.allergies[p.allergies.length - 1]);
};

exports.deleteAllergy = async (req, res) => {
  const p = await Patient.findById(req.user.patientId);
  if (!p) return res.status(404).json({ message: 'Patient not found' });
  p.allergies.pull(req.params.id);
  await p.save();
  audit(req, p._id, 'DELETE_ALLERGY', req.params.id);
  res.json({ message: 'Removed', allergies: p.allergies });
};

// ─── Vital signs ──────────────────────────────────────────────────────────────

exports.addVitalSign = async (req, res) => {
  const p = await Patient.findById(req.user.patientId);
  if (!p) return res.status(404).json({ message: 'Patient not found' });
  p.vitalSigns.push({ ...req.body, recordedBy: req.user.role });
  await p.save();
  audit(req, p._id, 'ADD_VITAL_SIGN');
  res.status(201).json(p.vitalSigns[p.vitalSigns.length - 1]);
};

exports.getVitalSigns = async (req, res) => {
  const limit = Math.min(200, parseInt(req.query.limit) || 50);
  const p = await Patient.findById(req.user.patientId);
  if (!p) return res.status(404).json({ message: 'Patient not found' });
  res.json(p.vitalSigns.slice(-limit).reverse());
};

exports.deleteVitalSign = async (req, res) => {
  const p = await Patient.findById(req.user.patientId);
  if (!p) return res.status(404).json({ message: 'Patient not found' });
  p.vitalSigns.pull(req.params.id);
  await p.save();
  res.json({ message: 'Removed' });
};

// ─── Vaccinations ─────────────────────────────────────────────────────────────

exports.addVaccination = async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ message: 'name is required' });
  const p = await Patient.findById(req.user.patientId);
  if (!p) return res.status(404).json({ message: 'Patient not found' });
  p.vaccinations.push(req.body);
  await p.save();
  audit(req, p._id, 'ADD_VACCINATION', name);
  res.status(201).json(p.vaccinations[p.vaccinations.length - 1]);
};

exports.getVaccinations = async (req, res) => {
  const p = await Patient.findById(req.user.patientId);
  if (!p) return res.status(404).json({ message: 'Patient not found' });
  res.json(p.vaccinations);
};

exports.deleteVaccination = async (req, res) => {
  const p = await Patient.findById(req.user.patientId);
  if (!p) return res.status(404).json({ message: 'Patient not found' });
  p.vaccinations.pull(req.params.id);
  await p.save();
  res.json({ message: 'Removed' });
};

// ─── Chronic conditions ───────────────────────────────────────────────────────

exports.addChronicCondition = async (req, res) => {
  if (!req.body.name) return res.status(400).json({ message: 'name is required' });
  const p = await Patient.findById(req.user.patientId);
  if (!p) return res.status(404).json({ message: 'Patient not found' });
  p.chronicConditions.push(req.body);
  await p.save();
  audit(req, p._id, 'ADD_CHRONIC_CONDITION', req.body.name);
  res.status(201).json(p.chronicConditions[p.chronicConditions.length - 1]);
};

exports.updateChronicCondition = async (req, res) => {
  const p = await Patient.findById(req.user.patientId);
  if (!p) return res.status(404).json({ message: 'Patient not found' });
  const condition = p.chronicConditions.id(req.params.id);
  if (!condition) return res.status(404).json({ message: 'Condition not found' });
  Object.assign(condition, req.body);
  await p.save();
  audit(req, p._id, 'UPDATE_CHRONIC_CONDITION', req.params.id);
  res.json(condition);
};

exports.deleteChronicCondition = async (req, res) => {
  const p = await Patient.findById(req.user.patientId);
  if (!p) return res.status(404).json({ message: 'Patient not found' });
  p.chronicConditions.pull(req.params.id);
  await p.save();
  res.json({ message: 'Removed' });
};

exports.getChronicConditions = async (req, res) => {
  const p = await Patient.findById(req.user.patientId);
  if (!p) return res.status(404).json({ message: 'Patient not found' });
  res.json(p.chronicConditions);
};

// ─── Family history ───────────────────────────────────────────────────────────

exports.addFamilyHistory = async (req, res) => {
  if (!req.body.relation || !req.body.condition) {
    return res.status(400).json({ message: 'relation and condition are required' });
  }
  const p = await Patient.findById(req.user.patientId);
  if (!p) return res.status(404).json({ message: 'Patient not found' });
  p.familyHistory.push(req.body);
  await p.save();
  res.status(201).json(p.familyHistory[p.familyHistory.length - 1]);
};

exports.getFamilyHistory = async (req, res) => {
  const p = await Patient.findById(req.user.patientId);
  if (!p) return res.status(404).json({ message: 'Patient not found' });
  res.json(p.familyHistory);
};

exports.deleteFamilyHistory = async (req, res) => {
  const p = await Patient.findById(req.user.patientId);
  if (!p) return res.status(404).json({ message: 'Patient not found' });
  p.familyHistory.pull(req.params.id);
  await p.save();
  res.json({ message: 'Removed' });
};

// ─── Insurance ────────────────────────────────────────────────────────────────

exports.updateInsurance = async (req, res) => {
  const p = await Patient.findById(req.user.patientId);
  if (!p) return res.status(404).json({ message: 'Patient not found' });
  p.insurance = { ...(p.insurance?.toObject?.() || {}), ...req.body };
  await p.save();
  audit(req, p._id, 'UPDATE_INSURANCE');
  res.json(p.insurance);
};

exports.getInsurance = async (req, res) => {
  const p = await Patient.findById(req.user.patientId);
  if (!p) return res.status(404).json({ message: 'Patient not found' });
  res.json(p.insurance);
};

// ─── Medical records (history + prescriptions) ────────────────────────────────

exports.getRecords = async (req, res) => {
  try {
    const patientId = req.user.patientId;
    const patient = await Patient.findById(patientId);
    if (!patient) return res.status(404).json({ message: 'Patient not found' });

    // Directly fetch from the shared global collection
    const prescriptions = await Prescription.find({ patientId });

    res.status(200).json({
      medicalHistory: patient.medicalHistory,
      prescriptions: prescriptions,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.addMedicalRecord = async (req, res) => {
  try {
    const { description, diagnosis, doctor, notes, date, icd10Code } = req.body;
    if (!description) return res.status(400).json({ message: 'Description is required.' });
    const patient = await Patient.findById(req.user.patientId);
    if (!patient) return res.status(404).json({ message: 'Patient not found' });
    const record = { description, diagnosis, doctor, notes, icd10Code };
    if (date) record.date = date;
    patient.medicalHistory.push(record);
    await patient.save();
    audit(req, patient._id, 'ADD_MEDICAL_RECORD');
    res.status(201).json(patient.medicalHistory[patient.medicalHistory.length - 1]);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateMedicalRecord = async (req, res) => {
  try {
    const patient = await Patient.findById(req.user.patientId);
    if (!patient) return res.status(404).json({ message: 'Patient not found' });
    const rec = patient.medicalHistory.id(req.params.id);
    if (!rec) return res.status(404).json({ message: 'Record not found' });
    Object.assign(rec, req.body);
    await patient.save();
    audit(req, patient._id, 'UPDATE_MEDICAL_RECORD', req.params.id);
    res.json(rec);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deleteMedicalRecord = async (req, res) => {
  try {
    const patient = await Patient.findById(req.user.patientId);
    if (!patient) return res.status(404).json({ message: 'Patient not found' });
    patient.medicalHistory.pull(req.params.id);
    await patient.save();
    audit(req, patient._id, 'DELETE_MEDICAL_RECORD', req.params.id);
    res.json({ message: 'Removed' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.addPrescription = async (req, res) => {
  try {
    const { medication, dosage, frequency, duration, instructions, prescribedBy, date } = req.body;
    if (!medication || !dosage) return res.status(400).json({ message: 'Medication and dosage are required.' });

    const patient = await Patient.findById(req.user.patientId);
    if (!patient) return res.status(404).json({ message: 'Patient not found' });

    const verificationId = crypto.randomBytes(6).toString('hex').toUpperCase();

    const newPrescription = new Prescription({
      patientId: patient._id.toString(),
      patientName: `${patient.firstName} ${patient.lastName}`,
      doctorId: 'self-recorded',
      doctorName: prescribedBy || 'Self',
      appointmentId: 'manual',
      medications: [{ medication, dosage, frequency, duration }],
      instructions,
      verificationId,
      signatureBase64: 'manual_issuance_sig',
      issuedAt: date || new Date()
    });

    await newPrescription.save();
    audit(req, patient._id, 'ADD_PRESCRIPTION', medication);
    res.status(201).json(newPrescription);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updatePrescription = async (req, res) => {
  try {
    // Only doctors and admins can update prescriptions
    if (!['doctor', 'admin'].includes(req.user?.role)) {
      return res.status(403).json({
        message: 'Forbidden. Only doctors or admins can update prescriptions.'
      });
    }

    // Find the prescription first
    const prescription = await Prescription.findById(req.params.id);

    if (!prescription) {
      return res.status(404).json({
        message: 'Prescription not found'
      });
    }

    // Doctors can only modify their own prescriptions
    if (
      req.user.role === 'doctor' &&
      prescription.doctorId?.toString() !==
      (req.user.doctorId || req.user.id).toString()
    ) {
      return res.status(403).json({
        message: 'Forbidden. You can only modify your own prescriptions.'
      });
    }

    // Only allow safe fields to be changed
    const allowedFields = [
      'medications',
      'instructions'
    ];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        prescription[field] = req.body[field];
      }
    }

    await prescription.save();

    res.json(prescription);

  } catch (error) {
    res.status(500).json({
      message: error.message
    });
  }
};

exports.deletePrescription = async (req, res) => {
  try {
    // Only doctors and admins can delete prescriptions
    if (!['doctor', 'admin'].includes(req.user?.role)) {
      return res.status(403).json({
        message: 'Forbidden. Only doctors or admins can delete prescriptions.'
      });
    }

    // Find the prescription first
    const prescription = await Prescription.findById(req.params.id);

    if (!prescription) {
      return res.status(404).json({
        message: 'Prescription not found'
      });
    }

    // Doctors can only delete their own prescriptions
    if (
      req.user.role === 'doctor' &&
      prescription.doctorId?.toString() !==
      (req.user.doctorId || req.user.id).toString()
    ) {
      return res.status(403).json({
        message: 'Forbidden. You can only delete your own prescriptions.'
      });
    }

    await Prescription.findByIdAndDelete(req.params.id);

    audit(
      req,
      prescription.patientId,
      'DELETE_PRESCRIPTION',
      req.params.id
    );

    res.json({
      message: 'Removed'
    });

  } catch (error) {
    res.status(500).json({
      message: error.message
    });
  }
};

exports.doctorIssuePrescription = async (req, res) => {
  try {
    const { patientId } = req.params;
    const {
      medication,
      dosage,
      frequency,
      duration,
      instructions,
      date
    } = req.body;

    // Only doctors or admins can issue prescriptions
    if (!['doctor', 'admin'].includes(req.user?.role)) {
      return res.status(403).json({
        message: 'Forbidden. Only doctors or admins can issue prescriptions.'
      });
    }

    if (!medication || !dosage) {
      return res.status(400).json({
        message: 'Medication and dosage are required.'
      });
    }

    const patient = await Patient.findById(patientId);

    if (!patient) {
      return res.status(404).json({
        message: 'Patient not found'
      });
    }

    // Doctors must be verified and have a care relationship
    // with the patient. Admins are allowed to issue directly.
    if (req.user.role === 'doctor') {
      const doctorId = req.user.doctorId || req.user.id;

      const authorized = await hasDoctorPatientRelationship(
        req,
        doctorId,
        patientId
      );

      if (!authorized) {
        return res.status(403).json({
          message:
            'Forbidden. You must be a verified doctor with an appointment with this patient.'
        });
      }
    }

    const verificationId = crypto
      .randomBytes(6)
      .toString('hex')
      .toUpperCase();

    const doctorId =
      req.user.role === 'doctor'
        ? (req.user.doctorId || req.user.id)
        : req.user.id;

    const doctorName =
      req.user.role === 'doctor'
        ? (req.user.name || req.user.email || 'Doctor')
        : 'Admin';

    const prescription = new Prescription({
      patientId: patient._id,
      patientName: `${patient.firstName} ${patient.lastName}`,
      doctorId,
      doctorName,
      appointmentId: 'manual',
      medications: [
        {
          medication,
          dosage,
          frequency,
          duration
        }
      ],
      instructions,
      verificationId,
      signatureBase64: 'manual_issuance_sig',
      issuedAt: date || new Date()
    });

    await prescription.save();

    audit(
      req,
      patient._id,
      'DOCTOR_ISSUED_PRESCRIPTION',
      medication
    );

    await sendEvent('patient-events', {
      type: 'PRESCRIPTION_ISSUED',
      patientId: patient._id,
      prescribedBy: doctorName,
      medication,
      verificationId,
      timestamp: new Date()
    });

    res.status(201).json(prescription);
  } catch (error) {
    console.error('[Patient Service] Doctor issue prescription error:', error);
    res.status(500).json({
      message: error.message
    });
  }
};

// ─── Documents ────────────────────────────────────────────────────────────────

exports.uploadDocument = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const patient = await Patient.findById(req.user.patientId);
    if (!patient) return res.status(404).json({ message: 'Patient not found' });

    const newDoc = {
      fileName: req.file.originalname,
      fileUrl: req.file.path.replace(/\\/g, '/'),
      fileSizeBytes: req.file.size,
      mimeType: req.file.mimetype,
      type: req.body.type || 'Report',
      description: req.body.description,
      uploadedBy: req.user.role,
    };
    patient.documents.push(newDoc);
    await patient.save();
    audit(req, patient._id, 'UPLOAD_DOCUMENT', newDoc.fileName);

    await sendEvent('patient-events', {
      type: 'DOCUMENT_UPLOADED',
      patientId: patient._id,
      documentName: newDoc.fileName,
      documentType: newDoc.type,
      timestamp: new Date(),
    });

    res.status(201).json(patient.documents[patient.documents.length - 1]);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getDocuments = async (req, res) => {
  try {
    const patient = await Patient.findById(req.user.patientId);
    if (!patient) return res.status(404).json({ message: 'Patient not found' });
    res.status(200).json(patient.documents);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


exports.downloadDocument = async (req, res) => {
  try {
    const { patientId, documentId } = req.params;

    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    // Patient can access their own documents
    const isOwner =
      req.user.role === 'patient' &&
      req.user.patientId?.toString() === patientId.toString();

    // Admins can access patient documents
    const isAdmin = req.user.role === 'admin';

    // Doctors need a verified care relationship
    let isAuthorizedDoctor = false;

    if (req.user.role === 'doctor') {
      const doctorId = req.user.doctorId || req.user.id;

      isAuthorizedDoctor = await hasDoctorPatientRelationship(
        req,
        doctorId,
        patientId
      );
    }

    if (!isOwner && !isAdmin && !isAuthorizedDoctor) {
      return res.status(403).json({
        message: 'Forbidden: you are not authorized to access this document.'
      });
    }

    const patient = await Patient.findById(patientId);

    if (!patient) {
      return res.status(404).json({ message: 'Patient not found.' });
    }

    const document = patient.documents.id(documentId);

    if (!document) {
      return res.status(404).json({ message: 'Document not found.' });
    }

    const filePath = path.resolve(document.fileUrl);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'File not found.' });
    }

    audit(
      req,
      patient._id,
      'DOWNLOAD_DOCUMENT',
      document.fileName
    );

    return res.sendFile(filePath);
  } catch (error) {
    console.error('[Patient Service] Document download error:', error.message);

    return res.status(500).json({
      message: 'Unable to download document.'
    });
  }
};

exports.deleteDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const patient = await Patient.findById(req.user.patientId);
    if (!patient) return res.status(404).json({ message: 'Patient not found' });
    const doc = patient.documents.id(id);
    if (!doc) return res.status(404).json({ message: 'Document not found' });

    // Best-effort disk cleanup — don't block the API on FS failures
    try {
      const filePath = path.resolve(doc.fileUrl);
      if (filePath.startsWith(path.resolve('uploads')) && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (err) {
      console.warn('[patient] document file cleanup failed:', err.message);
    }

    patient.documents.pull(id);
    await patient.save();
    audit(req, patient._id, 'DELETE_DOCUMENT', id);
    res.status(200).json({ message: 'Document deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── Derived analytics ────────────────────────────────────────────────────────

exports.getHealthScore = async (req, res) => {
  try {
    const targetId = req.params.patientId || req.user.patientId;
    if (req.params.patientId && !ensureSelfOrProvider(req, res, targetId)) return;
    const patient = await Patient.findById(targetId);
    if (!patient) return res.status(404).json({ message: 'Patient not found' });
    const score = patient.computeHealthScore();
    res.status(200).json({
      score,
      tier: score >= 85 ? 'excellent' : score >= 70 ? 'good' : score >= 50 ? 'fair' : 'attention required',
      activeChronicConditions: (patient.chronicConditions || []).filter((c) => c.status === 'active').length,
      severeAllergies: (patient.allergies || []).filter((a) => ['severe', 'life-threatening'].includes(a.severity)).length,
      lastVitalRecord: (patient.vitalSigns || []).slice(-1)[0] || null,
      generatedAt: new Date(),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getMedicalSummary = async (req, res) => {
  try {
    const targetId = req.params.patientId || req.user.patientId;
    if (req.params.patientId && !ensureSelfOrProvider(req, res, targetId)) return;
    const patient = await Patient.findById(targetId);
    if (!patient) return res.status(404).json({ message: 'Patient not found' });

    audit(req, patient._id, 'READ_SUMMARY');

    const prescriptions = await Prescription.find({ patientId: targetId });

    res.status(200).json({
      patient: { id: patient._id, name: `${patient.firstName} ${patient.lastName}`, dateOfBirth: patient.dateOfBirth, gender: patient.gender, bloodType: patient.bloodType },
      criticalAllergies: (patient.allergies || []).filter((a) => ['severe', 'life-threatening'].includes(a.severity)),
      activeChronicConditions: (patient.chronicConditions || []).filter((c) => c.status === 'active'),
      activePrescriptions: (prescriptions || []).filter((p) => p.status !== 'cancelled'),
      lastVitals: (patient.vitalSigns || []).slice(-3).reverse(),
      recentRecords: (patient.medicalHistory || []).slice(-5).reverse(),
      vaccinationCount: (patient.vaccinations || []).length,
      familyHistorySize: (patient.familyHistory || []).length,
      healthScore: patient.computeHealthScore(),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


// Wrap async controllers so rejected promises reach Express error middleware
const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

Object.keys(module.exports).forEach((key) => {
  if (
    typeof module.exports[key] === 'function' &&
    module.exports[key].constructor.name === 'AsyncFunction'
  ) {
    module.exports[key] = asyncHandler(module.exports[key]);
  }
});

