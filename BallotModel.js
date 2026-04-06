const mongoose = require('mongoose');

const candidateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    studentId: { type: String, required: true, trim: true, uppercase: true },
    department: { type: String, trim: true, default: '' },
    year: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    bio: { type: String, trim: true, default: '' },
    photo: { type: String, trim: true, default: '' },
    symbolName: { type: String, trim: true, default: '' },
    symbolImage: { type: String, trim: true, default: '' }
  },
  { _id: true }
);

const rankSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    candidates: {
      type: [candidateSchema],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length > 0,
        message: 'Each rank must contain at least one candidate.'
      }
    }
  },
  { _id: false }
);

const ballotSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    organization: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    ranks: {
      type: [rankSchema],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length > 0,
        message: 'Ballot must contain at least one rank.'
      }
    },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    isActive: { type: Boolean, default: false }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Ballot', ballotSchema);
