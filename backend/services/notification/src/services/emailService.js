const nodemailer = require('nodemailer');

// Use ethereal email (or similar mock service) for development
// To use a real SMTP server, update these credentials via environment variables
const smtpHost = process.env.SMTP_HOST || process.env.EMAIL_HOST || 'smtp.ethereal.email';
const smtpPort = process.env.SMTP_PORT || process.env.EMAIL_PORT || 587;
const smtpUser = process.env.SMTP_USER || process.env.EMAIL_USER;
const smtpPass = process.env.SMTP_PASS || process.env.EMAIL_PASS;

const transportOptions = {
  host: smtpHost,
  port: smtpPort,
};

if (smtpUser && smtpPass) {
  transportOptions.auth = {
    user: smtpUser,
    pass: smtpPass,
  };
}

const transporter = nodemailer.createTransport(transportOptions);

const sendEmail = async (to, subject, text) => {
  try {
    const info = await transporter.sendMail({
      from: '"MedSync Notifications" <no-reply@medsync.com>',
      to,
      subject,
      text,
    });
    console.log(`[EmailService] Sent email to ${to}: ${info.messageId}`);
  } catch (error) {
    console.error(`[EmailService] Error sending email to ${to}:`, error.message);
  }
};

module.exports = { sendEmail };
