const app = require('./src/app');
const connectDB = require('./src/config/db');
const seedAdmin = require('./src/config/seed');

const PORT = process.env.PORT || 5000;

// Rejects a missing secret, and also one of the placeholders published in this
// repository, which the startup scripts would otherwise copy in (V-A01).
const { validateSecret } = require('./src/config/validateSecrets');
try {
  validateSecret('JWT_SECRET');
  validateSecret('ADMIN_PASSWORD', { minLength: 12, required: false });
} catch (err) {
  console.error('[auth]', err.message);
  process.exit(1);
}

const start = async () => {
  await connectDB();
  await seedAdmin();
  app.listen(PORT, () => console.log(`[auth] listening on ${PORT}`));
};

start().catch((err) => {
  console.error('[auth] failed to start:', err);
  process.exit(1);
});
