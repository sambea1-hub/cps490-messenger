const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { authMiddleware, revokeToken, getJwtSecret } = require('../middleware/auth');

const router = express.Router();

// FR-01: Account Registration
router.post('/register', async (req, res) => {
  try {
    const rawUsername = typeof req.body.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    if (rawUsername.length < 3 || rawUsername.length > 32) {
      return res.status(400).json({ error: 'Username must be between 3 and 32 characters' });
    }
    if (!/^[a-zA-Z0-9_.-]+$/.test(rawUsername)) {
      return res.status(400).json({ error: 'Username may only contain letters, numbers, underscores, dots, and hyphens' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }

    const existing = await User.findOne({ username: rawUsername });
    if (existing) {
      return res.status(409).json({ error: 'Username is already registered' });
    }

    // NFR-03: Hash password with bcrypt (work factor 10)
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      username: rawUsername,
      passwordHash
    });

    const token = jwt.sign(
      { id: user._id.toString(), username: user.username },
      getJwtSecret(),
      { expiresIn: '24h' }
    );

    return res.status(201).json({
      token,
      user: user.toSafeObject()
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Username is already registered' });
    }
    return res.status(500).json({ error: 'Internal server error during registration' });
  }
});

// FR-02: Credential Verification and Login
router.post('/login', async (req, res) => {
  try {
    const rawUsername = typeof req.body.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    if (!rawUsername || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = await User.findOne({ username: rawUsername });
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const token = jwt.sign(
      { id: user._id.toString(), username: user.username },
      getJwtSecret(),
      { expiresIn: '24h' }
    );

    return res.status(200).json({
      token,
      user: user.toSafeObject()
    });
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error during login' });
  }
});

// Identify current authenticated account (Section 4.1)
router.get('/me', authMiddleware, async (req, res) => {
  return res.status(200).json({
    user: {
      id: req.user.id,
      username: req.user.username
    }
  });
});

// FR-03: Explicit Session Termination
router.post('/logout', authMiddleware, async (req, res) => {
  revokeToken(req.user.token);
  return res.status(200).json({ message: 'Logged out successfully' });
});

module.exports = router;
