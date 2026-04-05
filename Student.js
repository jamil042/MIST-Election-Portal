const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Valid student IDs seeded from university records
const validStudentSchema = new mongoose.Schema({
  studentId: { type: String, required: true, unique: true, uppercase: true, trim: true },
  name: { type: String, required: true },
  department: { type: String, required: true },
  batch: { type: String, required: true },
  isRegistered: { type: Boolean, default: false }
});

// Registered student accounts
const studentSchema = new mongoose.Schema({
  studentId: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true
  },
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  department: { type: String, required: true },
  batch: { type: String, required: true },
  isVerified: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

// Hash password before save
studentSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

studentSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

const ValidStudent = mongoose.model('ValidStudent', validStudentSchema);
const Student = mongoose.model('Student', studentSchema);

module.exports = { Student, ValidStudent };
