const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const createConversationRouter = require('./routes/conversations');
const { verifyTokenAndGetUser } = require('./middleware/auth');
const Conversation = require('./models/Conversation');
const Message = require('./models/Message');

function createApp() {
  const app = express();
  const httpServer = http.createServer(app);

  const clientOrigin = process.env.CLIENT_ORIGIN || '*';
  app.use(cors({ origin: clientOrigin, credentials: true }));
  app.use(express.json());

  const io = new Server(httpServer, {
    cors: {
      origin: clientOrigin,
      methods: ['GET', 'POST']
    }
  });

  // Socket.IO authentication middleware (FR-04, Section 4.1 & 4.4)
  io.use(async (socket, next) => {
    try {
      const authHeader = socket.handshake.headers?.authorization || '';
      const token =
        socket.handshake.auth?.token ||
        (authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '');

      const user = await verifyTokenAndGetUser(token);
      socket.user = user;
      next();
    } catch (err) {
      next(new Error(err.message || 'Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    // Join personal room for conversation notifications and authorized updates
    socket.join(`user:${socket.user.id}`);

    // Section 4.4: Enforce server-side authorization on Socket.IO room subscriptions
    socket.on('conversation:join', async (conversationId, callback) => {
      try {
        if (!mongoose.Types.ObjectId.isValid(conversationId)) {
          if (typeof callback === 'function') callback({ error: 'Invalid conversation ID' });
          return;
        }
        const conv = await Conversation.findById(conversationId);
        if (!conv) {
          if (typeof callback === 'function') callback({ error: 'Conversation not found' });
          return;
        }
        const isParticipant = conv.participants.some(
          (p) => p.toString() === socket.user.id
        );
        if (!isParticipant) {
          if (typeof callback === 'function') {
            callback({ error: 'Forbidden: Not a participant in this conversation' });
          }
          return;
        }
        socket.join(`conversation:${conversationId}`);
        if (typeof callback === 'function') callback({ status: 'ok', conversationId });
      } catch (err) {
        if (typeof callback === 'function') callback({ error: 'Failed to join conversation' });
      }
    });

    // Live message submission via Socket.IO with strict authorization & persistence-first guarantee
    socket.on('message:send', async (payload, callback) => {
      try {
        const { conversationId, content } = payload || {};
        if (!mongoose.Types.ObjectId.isValid(conversationId)) {
          if (typeof callback === 'function') callback({ error: 'Invalid conversation ID' });
          return;
        }
        const trimmed = typeof content === 'string' ? content.trim() : '';
        if (!trimmed || trimmed.length > 2000) {
          if (typeof callback === 'function') {
            callback({ error: 'Message content must be between 1 and 2000 characters' });
          }
          return;
        }

        const conv = await Conversation.findById(conversationId);
        if (!conv) {
          if (typeof callback === 'function') callback({ error: 'Conversation not found' });
          return;
        }

        const isParticipant = conv.participants.some(
          (p) => p.toString() === socket.user.id
        );
        if (!isParticipant) {
          if (typeof callback === 'function') {
            callback({ error: 'Forbidden: Not a participant in this conversation' });
          }
          return;
        }

        // Persist message BEFORE broadcasting (Section 4.5)
        let msg = await Message.create({
          conversation: conv._id,
          sender: socket.user.id,
          content: trimmed
        });
        msg = await msg.populate('sender', '_id username');

        const formatted = {
          id: msg._id.toString(),
          conversationId: conv._id.toString(),
          sender: {
            id: msg.sender._id.toString(),
            username: msg.sender.username
          },
          content: msg.content,
          createdAt: msg.createdAt
        };

        let broadcast = io.to(`conversation:${conversationId}`);
        conv.participants.forEach((pid) => {
          broadcast = broadcast.to(`user:${pid.toString()}`);
        });
        broadcast.emit('message:new', formatted);

        if (typeof callback === 'function') {
          callback({ status: 'ok', message: formatted });
        }
      } catch (err) {
        if (typeof callback === 'function') callback({ error: 'Failed to send message' });
      }
    });
  });

  app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/conversations', createConversationRouter(io));

  return { app, httpServer, io };
}

module.exports = { createApp };
