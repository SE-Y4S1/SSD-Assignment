// Signed and checked through one module so the algorithm, issuer and audience
// are pinned in every service (V-A15).
const { verifyToken } = require('../config/tokens');

// Rejects a missing secret, and also one of the placeholders published in
// this repository, which the startup scripts would otherwise copy in (V-A01).
require('../config/validateSecrets').validateSecret('JWT_SECRET');

const auth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authorization token required' });
  }
  try {
    const decoded = verifyToken(authHeader.slice(7));
    req.user = {
      id: decoded.userId || decoded.id || decoded.patientId || decoded.doctorId,
      patientId: decoded.patientId || (decoded.role === 'patient' ? decoded.userId : undefined),
      email: decoded.email,
      role: decoded.role,
    };
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) {
    return res.status(403).json({ message: `Forbidden. Required role: ${roles.join(' | ')}.` });
  }
  next();
};

module.exports = { auth, requireRole };
