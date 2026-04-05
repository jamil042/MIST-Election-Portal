require('dotenv').config();
const app = require('./app');
const connectDB = require('./db');

// Connect to MongoDB and start server
const PORT = process.env.PORT || 5000;
connectDB()
  .then(() => {
    console.log('✅ Connected to MongoDB');
    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`📋 Student portal: http://localhost:${PORT}`);
      console.log(`🔐 Admin panel:    http://localhost:${PORT}/admin.html`);
    });
  })
  .catch(err => {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  });

module.exports = app;
