const jwt = require('jsonwebtoken');

const auth = (req, res, next) => {
  // Allow internal service calls with matching secret header
  const internalSecretHeader = req.headers['x-internal-secret'];
  const expectedSecret = process.env.INTERNAL_SERVICE_SECRET || process.env.JWT_SECRET;
  if (internalSecretHeader && expectedSecret && internalSecretHeader === expectedSecret) {
    req.isInternalService = true;
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authorization token or service secret required' });
  }

  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
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
