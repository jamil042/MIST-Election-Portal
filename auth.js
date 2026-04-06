const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { Student, ValidStudent } = require('./Student');
const { sendRegistrationAlert, sendPasswordResetEmail } = require('./mailer');

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

// POST /api/auth/forgot-password — send password reset link to official email
router.post('/forgot-password', async (req, res) => {
  try {
    const { studentId } = req.body;
    if (!studentId) {
      return res.status(400).json({ message: 'Student ID is required.' });
    }

    const normalizedStudentId = studentId.toUpperCase().trim();
    const student = await Student.findOne({ studentId: normalizedStudentId });

    // Do not reveal whether account exists.
    if (!student) {
      return res.json({
        message: 'If your account exists, a password reset link has been sent to your official email.'
      });
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    student.resetPasswordTokenHash = tokenHash;
    student.resetPasswordExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await student.save();

    const appBaseUrl = process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`;
    const resetLink = `${appBaseUrl}/?studentId=${encodeURIComponent(student.studentId)}&resetToken=${encodeURIComponent(rawToken)}`;

    await sendPasswordResetEmail({
      to: student.email,
      studentName: student.name,
      studentId: student.studentId,
      resetLink
    });

    return res.json({
      message: 'If your account exists, a password reset link has been sent to your official email.'
    });
  } catch (err) {
    console.error('Forgot password error:', err);
    return res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// POST /api/auth/reset-password — reset password from email link token
router.post('/reset-password', async (req, res) => {
  try {
    const { studentId, token, newPassword, confirmPassword } = req.body;

    if (!studentId || !token || !newPassword || !confirmPassword) {
      return res.status(400).json({ message: 'All fields are required.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters.' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match.' });
    }

    const normalizedStudentId = studentId.toUpperCase().trim();
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const student = await Student.findOne({
      studentId: normalizedStudentId,
      resetPasswordTokenHash: tokenHash,
      resetPasswordExpiresAt: { $gt: new Date() }
    });

    if (!student) {
      return res.status(400).json({ message: 'Reset link is invalid or expired.' });
    }

    student.password = newPassword;
    student.resetPasswordTokenHash = undefined;
    student.resetPasswordExpiresAt = undefined;
    await student.save();

    return res.json({ message: 'Password reset successful. You can now sign in.' });
  } catch (err) {
    console.error('Reset password error:', err);
    return res.status(500).json({ message: 'Server error. Please try again.' });
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

// PATCH /api/auth/settings — update profile and/or password
router.patch('/settings', require('./middlewareAuth').authMiddleware, async (req, res) => {
  try {
    const {
      name,
      batch,
      currentPassword,
      newPassword,
      confirmNewPassword
    } = req.body;

    const student = await Student.findOne({ studentId: req.student.studentId });
    if (!student) return res.status(404).json({ message: 'Student not found.' });

    const hasProfileUpdate = typeof name === 'string' || typeof batch === 'string';
    const hasPasswordUpdate = Boolean(newPassword || confirmNewPassword || currentPassword);

    if (!hasProfileUpdate && !hasPasswordUpdate) {
      return res.status(400).json({ message: 'Nothing to update.' });
    }

    if (typeof name === 'string') {
      const trimmedName = name.trim();
      if (!trimmedName) {
        return res.status(400).json({ message: 'Name cannot be empty.' });
      }
      student.name = trimmedName;
    }

    if (typeof batch === 'string') {
      const trimmedBatch = batch.trim();
      if (!trimmedBatch) {
        return res.status(400).json({ message: 'Year/Batch cannot be empty.' });
      }
      student.batch = trimmedBatch;
    }

    if (hasPasswordUpdate) {
      if (!currentPassword || !newPassword || !confirmNewPassword) {
        return res.status(400).json({ message: 'Current password and new password fields are required.' });
      }

      const passwordMatches = await student.comparePassword(currentPassword);
      if (!passwordMatches) {
        return res.status(400).json({ message: 'Current password is incorrect.' });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ message: 'New password must be at least 6 characters.' });
      }

      if (newPassword !== confirmNewPassword) {
        return res.status(400).json({ message: 'New passwords do not match.' });
      }

      student.password = newPassword;
    }

    await student.save();

    return res.json({
      message: 'Settings updated successfully.',
      student: {
        studentId: student.studentId,
        name: student.name,
        email: student.email,
        department: student.department,
        batch: student.batch
      }
    });
  } catch (err) {
    console.error('Settings update error:', err);
    return res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

module.exports = router;
