const jwt = require('jsonwebtoken');
const User = require('../models/User');

// In-memory revocation set for logged-out tokens (FR-03)
const revokedTokens = new Set();

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is missing');
  }
  return secret;
}

function revokeToken(token) {
  if (token) {
    revokedTokens.add(token);
  }
}

function isTokenRevoked(token) {
  return revokedTokens.has(token);
}

async function verifyTokenAndGetUser(token) {
  if (!token || isTokenRevoked(token)) {
    const err = new Error('Authentication required');
    err.status = 401;
    throw err;
  }

  let decoded;
  try {
    decoded = jwt.verify(token, getJwtSecret());
  } catch (e) {
    const err = new Error('Invalid or expired authentication token');
    err.status = 401;
    throw err;
  }

  const user = await User.findById(decoded.id);
  if (!user) {
    const err = new Error('Authenticated user account no longer exists');
    err.status = 401;
    throw err;
  }

  return {
    id: user._id.toString(),
    username: user.username,
    token
  };
}

async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization Bearer token required' });
    }
    const token = authHeader.slice(7).trim();
    const user = await verifyTokenAndGetUser(token);
    req.user = user;
    next();
  } catch (err) {
    return res.status(err.status || 401).json({ error: err.message || 'Unauthorized' });
  }
}

module.exports = {
  authMiddleware,
  verifyTokenAndGetUser,
  revokeToken,
  getJwtSecret
};
