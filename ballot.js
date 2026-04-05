const express = require('express');
const Ballot = require('./BallotModel');
const Vote = require('./VoteModel');
const { authMiddleware, adminMiddleware } = require('./middlewareAuth');

const router = express.Router();

// GET /api/ballots — get all ballots (active, upcoming, closed) for students
router.get('/', authMiddleware, async (req, res) => {
  try {
    const ballots = await Ballot.find({ isActive: true }).sort({ startTime: -1 });
    const now = new Date();

    const enriched = ballots.map(b => {
      const obj = b.toJSON();
      if (now < b.startTime) obj.status = 'upcoming';
      else if (now > b.endTime) obj.status = 'closed';
      else obj.status = 'active';
      return obj;
    });

    res.json({ ballots: enriched });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// GET /api/ballots/all — admin: get all including drafts
router.get('/all', adminMiddleware, async (req, res) => {
  try {
    const ballots = await Ballot.find().sort({ createdAt: -1 });
    const now = new Date();
    const enriched = ballots.map(b => {
      const obj = b.toJSON();
      if (!b.isActive) obj.status = 'draft';
      else if (now < b.startTime) obj.status = 'upcoming';
      else if (now > b.endTime) obj.status = 'closed';
      else obj.status = 'active';
      return obj;
    });
    res.json({ ballots: enriched });
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

// GET /api/ballots/:id — single ballot detail
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const ballot = await Ballot.findById(req.params.id);
    if (!ballot) return res.status(404).json({ message: 'Ballot not found.' });

    const now = new Date();
    const obj = ballot.toJSON();
    if (!ballot.isActive) obj.status = 'draft';
    else if (now < ballot.startTime) obj.status = 'upcoming';
    else if (now > ballot.endTime) obj.status = 'closed';
    else obj.status = 'active';

    // Include which ranks this student has already voted in
    const existingVotes = await Vote.find({
      studentId: req.student.studentId,
      ballotId: ballot._id
    });
    obj.votedRanks = existingVotes.map(v => v.rankTitle);

    res.json({ ballot: obj });
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/ballots — admin: create ballot
router.post('/', adminMiddleware, async (req, res) => {
  try {
    const { title, organization, description, ranks, startTime, endTime } = req.body;

    if (!title || !organization || !ranks || !startTime || !endTime) {
      return res.status(400).json({ message: 'Title, organization, ranks, start and end time are required.' });
    }

    if (new Date(startTime) >= new Date(endTime)) {
      return res.status(400).json({ message: 'End time must be after start time.' });
    }

    const ballot = new Ballot({
      title,
      organization,
      description,
      ranks,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      isActive: false
    });

    await ballot.save();
    res.status(201).json({ message: 'Ballot created successfully.', ballot });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// PATCH /api/ballots/:id/publish — admin: publish ballot
router.patch('/:id/publish', adminMiddleware, async (req, res) => {
  try {
    const ballot = await Ballot.findByIdAndUpdate(
      req.params.id,
      { isActive: true },
      { new: true }
    );
    if (!ballot) return res.status(404).json({ message: 'Ballot not found.' });
    res.json({ message: 'Ballot published!', ballot });
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

// PATCH /api/ballots/:id — admin: update ballot (only if not yet active)
router.patch('/:id', adminMiddleware, async (req, res) => {
  try {
    const ballot = await Ballot.findById(req.params.id);
    if (!ballot) return res.status(404).json({ message: 'Ballot not found.' });

    const now = new Date();
    if (ballot.isActive && now >= ballot.startTime && now <= ballot.endTime) {
      return res.status(400).json({ message: 'Cannot edit a ballot while voting is active.' });
    }

    const allowed = ['title', 'organization', 'description', 'ranks', 'startTime', 'endTime'];
    allowed.forEach(key => {
      if (req.body[key] !== undefined) ballot[key] = req.body[key];
    });

    await ballot.save();
    res.json({ message: 'Ballot updated.', ballot });
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

// DELETE /api/ballots/:id — admin: delete draft ballot
router.delete('/:id', adminMiddleware, async (req, res) => {
  try {
    const ballot = await Ballot.findById(req.params.id);
    if (!ballot) return res.status(404).json({ message: 'Ballot not found.' });
    if (ballot.isActive) return res.status(400).json({ message: 'Cannot delete an active ballot.' });
    await ballot.deleteOne();
    res.json({ message: 'Ballot deleted.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
