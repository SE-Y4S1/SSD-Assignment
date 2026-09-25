const { body, validationResult } = require('express-validator');

// ─── Reusable middleware to return 422 if any validation failed ────────────
const handleValidation = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
    }
    next();
};

// ─── Rules for POST /api/payments/checkout ──────────────────────────────────
const createCheckoutRules = [
    body('appointmentId').notEmpty().withMessage('appointmentId is required'),
    handleValidation,
];

module.exports = { createCheckoutRules };
