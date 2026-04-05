const express = require('express');
const Ballot = require('./BallotModel');
const Vote = require('./VoteModel');
const { authMiddleware } = require('./middlewareAuth');

const router = express.Router();

// POST /api/vote — cast a vote for one rank in a ballot
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { ballotId, rankTitle, candidateId } = req.body;
    const studentId = req.student.studentId;

    if (!ballotId || !rankTitle || !candidateId) {
      return res.status(400).json({ message: 'ballotId, rankTitle and candidateId are required.' });
    }

    // 1. Find ballot and verify it's open
    const ballot = await Ballot.findById(ballotId);
    if (!ballot) return res.status(404).json({ message: 'Ballot not found.' });

    const now = new Date();
    if (!ballot.isActive || now < ballot.startTime || now > ballot.endTime) {
      return res.status(400).json({ message: 'Voting is not open for this ballot.' });
    }

    // 2. Find the rank
    const rank = ballot.ranks.find(r => r.title === rankTitle);
    if (!rank) return res.status(400).json({ message: `Rank "${rankTitle}" not found in this ballot.` });

    // 3. Find the candidate
    const candidate = rank.candidates.find(c => c._id.toString() === candidateId);
    if (!candidate) return res.status(400).json({ message: 'Candidate not found.' });

    // 4. Check for duplicate vote (also enforced by DB unique index)
    const existing = await Vote.findOne({ studentId, ballotId, rankTitle });
    if (existing) {
      return res.status(409).json({
        message: `You have already voted for ${rankTitle} in this ballot.`
      });
    }

    // 5. Save vote
    const vote = new Vote({
      studentId,
      ballotId,
      rankTitle,
      candidateId: candidate._id,
      candidateName: candidate.name
    });

    await vote.save();

    res.status(201).json({ message: `Your vote for ${rankTitle} has been recorded!` });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: 'You have already voted for this position.' });
    }
    console.error('Vote error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// GET /api/vote/my-votes/:ballotId — which ranks has this student voted in?
router.get('/my-votes/:ballotId', authMiddleware, async (req, res) => {
  try {
    const votes = await Vote.find({
      studentId: req.student.studentId,
      ballotId: req.params.ballotId
    });
    res.json({ votes: votes.map(v => ({ rankTitle: v.rankTitle, candidateName: v.candidateName })) });
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
