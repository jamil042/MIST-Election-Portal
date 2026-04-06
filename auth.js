const express = require('express');
const jwt = require('jsonwebtoken');
const { Student, ValidStudent } = require('./Student');
const { sendRegistrationAlert } = require('./mailer');

const router = express.Router();

function getOfficialStudentEmail(studentId) {
  return `${studentId.toLowerCase()}@student.mist.ac.bd`;
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { studentId, name, password, department, batch } = req.body;

    if (!studentId || !name || !password || !department || !batch) {
      return res.status(400).json({ message: 'All fields are required.' });
    }

    const normalizedStudentId = studentId.toUpperCase().trim();
    const officialEmail = getOfficialStudentEmail(normalizedStudentId);

    // Step 1: Validate student ID against university records
    const validStudent = await ValidStudent.findOne({
      studentId: normalizedStudentId
    });

    if (!validStudent) {
      return res.status(400).json({
        message: 'Student ID not found in university records. Only enrolled students can register.'
      });
    }

    // Step 2: Check if this student ID is already registered
    if (validStudent.isRegistered) {
      return res.status(400).json({
        message: 'This student ID is already registered. Please login instead.'
      });
    }

    // Step 3: Check email not already used
    const emailExists = await Student.findOne({ email: officialEmail.toLowerCase() });
    if (emailExists) {
      return res.status(400).json({ message: 'Email is already in use.' });
    }

    // Step 4: Create account
    const student = new Student({
      studentId: normalizedStudentId,
      name,
      email: officialEmail.toLowerCase(),
      password,
      department: validStudent.department || department,
      batch: validStudent.batch || batch
    });

    await student.save();

    // Mark as registered in valid students
    await ValidStudent.updateOne(
      { studentId: normalizedStudentId },
      { isRegistered: true }
    );

    try {
      await sendRegistrationAlert({
        to: officialEmail,
        studentName: student.name,
        studentId: student.studentId
      });
    } catch (mailError) {
      console.warn(`Registration mail failed for ${student.studentId}: ${mailError.message}`);
    }

    // Issue JWT
    const token = jwt.sign(
      { studentId: student.studentId, name: student.name, department: student.department },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'Registration successful!',
      token,
      student: {
        studentId: student.studentId,
        name: student.name,
        email: student.email,
        department: student.department,
        batch: student.batch
      }
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: 'Student ID or email already registered.' });
    }
    console.error('Register error:', err);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { studentId, password } = req.body;

    if (!studentId || !password) {
      return res.status(400).json({ message: 'Student ID and password are required.' });
    }

    const student = await Student.findOne({ studentId: studentId.toUpperCase().trim() });
    if (!student) {
      return res.status(401).json({ message: 'Invalid student ID or password.' });
    }

    const isMatch = await student.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid student ID or password.' });
    }

    const token = jwt.sign(
      { studentId: student.studentId, name: student.name, department: student.department },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful!',
      token,
      student: {
        studentId: student.studentId,
        name: student.name,
        email: student.email,
        department: student.department,
        batch: student.batch
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// GET /api/auth/me — verify token and return profile
router.get('/me', require('./middlewareAuth').authMiddleware, async (req, res) => {
  try {
    const student = await Student.findOne({ studentId: req.student.studentId }).select('-password');
    if (!student) return res.status(404).json({ message: 'Student not found.' });
    res.json({ student });
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
