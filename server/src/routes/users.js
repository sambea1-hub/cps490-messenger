const express = require('express');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// List registered users for starting direct or group conversations
router.get('/', authMiddleware, async (req, res) => {
  try {
    const users = await User.find({}, '_id username createdAt').sort({ username: 1 });
    return res.status(200).json({
      users: users.map((u) => ({
        id: u._id.toString(),
        username: u.username,
        createdAt: u.createdAt
      }))
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve users' });
  }
});

module.exports = router;
