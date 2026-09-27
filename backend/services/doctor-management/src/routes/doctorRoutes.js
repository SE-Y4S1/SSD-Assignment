const express = require('express');
const rateLimit = require('express-rate-limit');
// Signed and checked through one module so the algorithm, issuer and audience
// are pinned in every service (V-A15).
const { verifyToken } = require('../config/tokens');

// Credential endpoints are the ones worth guessing at, so they get their own
// limit. Everything else is left alone (V-A03).
const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts. Please try again in a few minutes.' },
});
const router = express.Router();
const doctorController = require('../controllers/doctorController');
const Doctor = require('../models/Doctor');

// Rejects a missing secret, and also one of the placeholders published in
// this repository, which the startup scripts would otherwise copy in (V-A01).
require('../config/validateSecrets').validateSecret('JWT_SECRET');

const auth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authorization token required' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);
    const id = decoded.userId || decoded.id || decoded.doctorId;
    req.user = {
      id,
      doctorId: decoded.doctorId || (decoded.role === 'doctor' ? id : undefined),
      email: decoded.email,
      role: decoded.role,
    };

    // Block doctor tokens until an admin verifies the account
    if (req.user.role === 'doctor') {
      const doctorId = req.user.doctorId || req.user.id;
      const doctor = await Doctor.findById(doctorId).select('isVerified');
      if (!doctor || doctor.isVerified !== true) {
        return res.status(403).json({
          message:
            'Your account is pending admin verification. Access is blocked until verified.',
        });
      }
    }

    next();
  } catch {
    return res.status(401).json({ message: 'Unauthorized' });
  }
};

// Registration / login
router.post('/register', credentialLimiter, doctorController.registerDoctor);
router.post('/login', credentialLimiter, doctorController.login);

// Prescriptions — verify is public (QR scan), issue is doctor-only
router.get('/prescriptions/verify/:verificationId', doctorController.getPrescriptionByVerifyId);
router.post('/prescriptions', auth, doctorController.issuePrescription);

// Doctor lookup
router.get('/', doctorController.listDoctors);
router.get('/:id', doctorController.getDoctor);
router.put('/:id', auth, doctorController.updateDoctor);
router.get('/:id/analytics', auth, doctorController.getAnalytics);

// Availability
router.get('/:id/availability', doctorController.getAvailability);
router.post('/:id/availability', auth, doctorController.addAvailability);
router.post('/:id/availability/bulk', auth, doctorController.addAvailabilityBulk);
router.put('/:id/availability/:slotId', auth, doctorController.updateAvailability);
router.delete('/:id/availability/:slotId', auth, doctorController.deleteAvailability);

module.exports = router;
