const express = require('express');
const Ballot = require('./BallotModel');
const Vote = require('./VoteModel');
const { authMiddleware, adminMiddleware } = require('./middlewareAuth');

const router = express.Router();

// GET /api/results/:ballotId — results for a ballot (only after voting closes OR for admin)
router.get('/:ballotId', authMiddleware, async (req, res) => {
  try {
    const ballot = await Ballot.findById(req.params.ballotId);
    if (!ballot) return res.status(404).json({ message: 'Ballot not found.' });

    const now = new Date();
    const isAdmin = req.headers['x-admin-key'] === process.env.ADMIN_SECRET;
    const isClosed = now > ballot.endTime;

    if (!isClosed && !isAdmin) {
      return res.status(403).json({ message: 'Results will be available after voting closes.' });
    }

    // Aggregate votes per rank per candidate
    const votes = await Vote.find({ ballotId: ballot._id });

    const results = ballot.ranks.map(rank => {
      const rankVotes = votes.filter(v => v.rankTitle === rank.title);
      const tally = {};

      rank.candidates.forEach(c => {
        tally[c._id.toString()] = {
          candidateId: c._id,
          name: c.name,
          studentId: c.studentId,
          department: c.department,
          year: c.year,
          email: c.email,
          phone: c.phone,
          bio: c.bio,
          photo: c.photo,
          votes: 0
        };
      });

      rankVotes.forEach(v => {
        if (tally[v.candidateId.toString()]) {
          tally[v.candidateId.toString()].votes++;
        }
      });

      const sorted = Object.values(tally).sort((a, b) => b.votes - a.votes);
      const winner = sorted[0] && sorted[0].votes > 0 ? sorted[0] : null;
      const totalVotes = rankVotes.length;

      return {
        rank: rank.title,
        totalVotes,
        winner,
        candidates: sorted.map(c => ({
          ...c,
          percentage: totalVotes > 0 ? Math.round((c.votes / totalVotes) * 100) : 0
        }))
      };
    });

    res.json({
      ballot: {
        _id: ballot._id,
        title: ballot.title,
        organization: ballot.organization,
        startTime: ballot.startTime,
        endTime: ballot.endTime,
        status: isClosed ? 'closed' : 'active'
      },
      results
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// GET /api/results/:ballotId/live — admin live tallying
router.get('/:ballotId/live', adminMiddleware, async (req, res) => {
  // Same as above but no time restriction
  req.headers.authorization = 'Bearer admin';
  try {
    const ballot = await Ballot.findById(req.params.ballotId);
    if (!ballot) return res.status(404).json({ message: 'Ballot not found.' });

    const votes = await Vote.find({ ballotId: ballot._id });
    const results = ballot.ranks.map(rank => {
      const rankVotes = votes.filter(v => v.rankTitle === rank.title);
      const tally = {};
      rank.candidates.forEach(c => {
        tally[c._id.toString()] = {
          candidateId: c._id,
          name: c.name,
          studentId: c.studentId,
          department: c.department,
          year: c.year,
          email: c.email,
          phone: c.phone,
          bio: c.bio,
          photo: c.photo,
          votes: 0
        };
      });
      rankVotes.forEach(v => {
        if (tally[v.candidateId.toString()]) tally[v.candidateId.toString()].votes++;
      });
      const sorted = Object.values(tally).sort((a, b) => b.votes - a.votes);
      return { rank: rank.title, totalVotes: rankVotes.length, candidates: sorted };
    });

    res.json({ ballot: { title: ballot.title }, results, totalVoters: [...new Set(votes.map(v => v.studentId))].length });
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
