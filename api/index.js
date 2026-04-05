require('dotenv').config();

const app = require('../app');
const connectDB = require('../db');

function getMongoHost(uri) {
  if (!uri || typeof uri !== 'string') return 'missing';
  const atIndex = uri.indexOf('@');
  if (atIndex === -1) return 'invalid-uri';
  const hostPart = uri.slice(atIndex + 1);
  return hostPart.split('/')[0] || 'invalid-uri';
}

module.exports = async (req, res) => {
  try {
    await connectDB();
    return app(req, res);
  } catch (err) {
    const mongoHost = getMongoHost(process.env.MONGODB_URI);
    console.error('[DB_CONNECT_ERROR]', {
      message: err && err.message ? err.message : 'Unknown database error',
      name: err && err.name ? err.name : 'UnknownError',
      mongoHost,
      hasMongoUri: Boolean(process.env.MONGODB_URI),
      hasJwtSecret: Boolean(process.env.JWT_SECRET),
      hasAdminSecret: Boolean(process.env.ADMIN_SECRET)
    });
    return res.status(500).json({ message: 'Database connection failed.', error: err.message });
  }
};
