const nodemailer = require('nodemailer');

function isSmtpConfigured() {
  return Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_PORT &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS
  );
}

function buildTransport() {
  const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true';
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

async function sendRegistrationAlert({ to, studentName, studentId }) {
  if (!isSmtpConfigured()) {
    return { sent: false, reason: 'SMTP is not configured.' };
  }

  const transport = buildTransport();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  const info = await transport.sendMail({
    from,
    to,
    subject: 'MIST Vote Account Created',
    text: [
      `Dear ${studentName},`,
      '',
      'Your MIST Vote account has been created successfully.',
      `Student ID: ${studentId}`,
      '',
      'If this was not done by you, please contact the election authority immediately.',
      '',
      'MIST Election Portal'
    ].join('\n')
  });

  return { sent: true, messageId: info.messageId };
}

module.exports = {
  sendRegistrationAlert,
  isSmtpConfigured
};
