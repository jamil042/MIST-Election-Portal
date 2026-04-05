const mongoose = require('mongoose');

const voteSchema = new mongoose.Schema(
  {
    studentId: { type: String, required: true, uppercase: true, trim: true },
    ballotId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ballot', required: true, index: true },
    rankTitle: { type: String, required: true, trim: true },
    candidateId: { type: mongoose.Schema.Types.ObjectId, required: true },
    candidateName: { type: String, required: true, trim: true }
  },
  { timestamps: true }
);

// One student can vote only once for a specific rank in a ballot.
voteSchema.index({ studentId: 1, ballotId: 1, rankTitle: 1 }, { unique: true });

module.exports = mongoose.model('Vote', voteSchema);
