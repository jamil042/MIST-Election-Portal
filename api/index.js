require('dotenv').config();

const app = require('../app');
const connectDB = require('../db');

module.exports = async (req, res) => {
  try {
    await connectDB();
    return app(req, res);
  } catch (err) {
    return res.status(500).json({ message: 'Database connection failed.', error: err.message });
  }
};
