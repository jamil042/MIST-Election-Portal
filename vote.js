const express = require('express');
const Ballot = require('./BallotModel');
const Vote = require('./VoteModel');
const { authMiddleware } = require('./middlewareAuth');

const router = express.Router();

// POST /api/vote — deprecated single-rank endpoint
router.post('/', authMiddleware, async (req, res) => {
  return res.status(405).json({
    message: 'Single-rank voting is disabled. Submit all rank selections at once using /api/vote/submit-ballot.'
  });
});

// POST /api/vote/submit-ballot — submit votes for all remaining ranks at once
router.post('/submit-ballot', authMiddleware, async (req, res) => {
  try {
    const { ballotId, selections } = req.body;
    const studentId = req.student.studentId;

    if (!ballotId || !Array.isArray(selections)) {
      return res.status(400).json({ message: 'ballotId and selections[] are required.' });
    }

    const ballot = await Ballot.findById(ballotId);
    if (!ballot) return res.status(404).json({ message: 'Ballot not found.' });

    const now = new Date();
    if (!ballot.isActive || now < ballot.startTime || now > ballot.endTime) {
      return res.status(400).json({ message: 'Voting is not open for this ballot.' });
    }

    const existingVotes = await Vote.find({ studentId, ballotId });
    const alreadyVotedRanks = new Set(existingVotes.map(v => v.rankTitle));
    const remainingRanks = ballot.ranks.filter(rank => !alreadyVotedRanks.has(rank.title));

    if (!remainingRanks.length) {
      return res.status(409).json({ message: 'You have already submitted votes for all ranks in this ballot.' });
    }

    if (selections.length !== remainingRanks.length) {
      return res.status(400).json({
        message: `You must select exactly one candidate for every remaining rank (${remainingRanks.length} required).`
      });
    }

    const selectionMap = new Map();
    for (const item of selections) {
      if (!item || !item.rankTitle || !item.candidateId) {
        return res.status(400).json({ message: 'Each selection must include rankTitle and candidateId.' });
      }
      if (selectionMap.has(item.rankTitle)) {
        return res.status(400).json({ message: `Duplicate rank selection found for ${item.rankTitle}.` });
      }
      selectionMap.set(item.rankTitle, item.candidateId);
    }

    const voteDocs = [];
    for (const rank of remainingRanks) {
      const selectedCandidateId = selectionMap.get(rank.title);
      if (!selectedCandidateId) {
        return res.status(400).json({ message: `Missing selection for rank: ${rank.title}` });
      }

      const candidate = rank.candidates.find(c => c._id.toString() === String(selectedCandidateId));
      if (!candidate) {
        return res.status(400).json({ message: `Invalid candidate selected for rank: ${rank.title}` });
      }

      voteDocs.push({
        studentId,
        ballotId,
        rankTitle: rank.title,
        candidateId: candidate._id,
        candidateName: candidate.name
      });
    }

    await Vote.insertMany(voteDocs, { ordered: true });

    return res.status(201).json({
      message: `Successfully submitted votes for ${voteDocs.length} rank${voteDocs.length > 1 ? 's' : ''}.`
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: 'Vote already submitted for one or more ranks in this ballot.' });
    }
    console.error('Submit ballot vote error:', err);
    return res.status(500).json({ message: 'Server error.' });
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
