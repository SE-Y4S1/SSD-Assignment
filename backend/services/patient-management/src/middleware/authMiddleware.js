// Signed and checked through one module so the algorithm, issuer and audience
// are pinned in every service (V-A15).
const { verifyToken } = require('../config/tokens');
const Patient = require('../models/Patient');

// Rejects a missing secret, and also one of the placeholders published in
// this repository, which the startup scripts would otherwise copy in (V-A01).
require('../config/validateSecrets').validateSecret('JWT_SECRET');

const JWT_SECRET = process.env.JWT_SECRET;

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authentication required. Please provide a valid token.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);

    const id = decoded.userId || decoded.id || decoded.patientId || decoded.doctorId;
    req.user = {
      id,
      patientId: decoded.patientId || (decoded.role === 'patient' ? id : undefined),
      doctorId: decoded.doctorId || (decoded.role === 'doctor' ? id : undefined),
      email: decoded.email,
      role: decoded.role,
    };

    // A token cannot be withdrawn once issued, so account status is read from
    // the record on every request rather than trusted from the token. Before
    // this, suspending or deactivating an account left the holder with a
    // working token until it expired, which used to be seven days (V-A05).
    if (req.user.role === 'patient' && req.user.patientId) {
      const patient = await Patient.findById(req.user.patientId)
        .select('accountStatus')
        .lean();
      if (!patient) {
        return res.status(401).json({ message: 'Invalid or expired token.' });
      }
      if (patient.accountStatus !== 'active') {
        return res.status(403).json({ message: `Account is ${patient.accountStatus}.` });
      }
    }

    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
};

module.exports = { authMiddleware, JWT_SECRET };
