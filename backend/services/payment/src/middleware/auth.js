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
  const token = authHeader.slice(7);
  try {
    const decoded = verifyToken(token);
    req.user = {
      id: decoded.userId || decoded.id || decoded.patientId || decoded.doctorId,
      email: decoded.email,
      role: decoded.role,
    };
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

module.exports = auth;
