const express = require('express');
const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');

function formatConversation(conv) {
  return {
    id: conv._id.toString(),
    type: conv.type,
    name: conv.name || '',
    participants: (conv.participants || []).map((p) => ({
      id: p._id ? p._id.toString() : p.toString(),
      username: p.username || ''
    })),
    createdBy: conv.createdBy ? conv.createdBy.toString() : null,
    createdAt: conv.createdAt
  };
}

function formatMessage(msg) {
  return {
    id: msg._id.toString(),
    conversationId: msg.conversation._id ? msg.conversation._id.toString() : msg.conversation.toString(),
    sender: {
      id: msg.sender._id ? msg.sender._id.toString() : msg.sender.toString(),
      username: msg.sender.username || ''
    },
    content: msg.content,
    createdAt: msg.createdAt
  };
}

module.exports = function createConversationRouter(io) {
  const router = express.Router();

  router.use(authMiddleware);

  // List all conversations where the authenticated user is a participant
  router.get('/', async (req, res) => {
    try {
      const conversations = await Conversation.find({ participants: req.user.id })
        .populate('participants', '_id username')
        .sort({ createdAt: -1 });

      return res.status(200).json({
        conversations: conversations.map(formatConversation)
      });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to load conversations' });
    }
  });

  // FR-05 & Section 4.2: Create or enter a direct conversation without duplication
  router.post('/direct', async (req, res) => {
    try {
      const { recipientId, username } = req.body;
      let targetUser = null;

      if (recipientId) {
        if (!mongoose.Types.ObjectId.isValid(recipientId)) {
          return res.status(400).json({ error: 'Invalid recipient user ID' });
        }
        targetUser = await User.findById(recipientId);
      } else if (typeof username === 'string' && username.trim()) {
        targetUser = await User.findOne({ username: username.trim() });
      } else {
        return res.status(400).json({ error: 'recipientId or username is required' });
      }

      if (!targetUser) {
        return res.status(404).json({ error: 'Target user not found' });
      }

      const targetId = targetUser._id.toString();
      if (targetId === req.user.id) {
        return res.status(400).json({ error: 'Cannot create a direct conversation with yourself' });
      }

      const sortedIds = [req.user.id, targetId].sort();
      const directKey = `${sortedIds[0]}:${sortedIds[1]}`;

      let conversation = await Conversation.findOne({ directKey }).populate('participants', '_id username');
      let statusCode = 200;

      if (!conversation) {
        conversation = await Conversation.create({
          type: 'direct',
          name: '',
          participants: sortedIds,
          directKey,
          createdBy: req.user.id
        });
        conversation = await conversation.populate('participants', '_id username');
        statusCode = 201;

        if (io) {
          const payload = formatConversation(conversation);
          sortedIds.forEach((uid) => {
            io.to(`user:${uid}`).emit('conversation:new', payload);
          });
        }
      }

      return res.status(statusCode).json({
        conversation: formatConversation(conversation)
      });
    } catch (err) {
      if (err.code === 11000) {
        const sortedIds = [req.user.id, req.body.recipientId].sort();
        const directKey = `${sortedIds[0]}:${sortedIds[1]}`;
        const existing = await Conversation.findOne({ directKey }).populate('participants', '_id username');
        if (existing) {
          return res.status(200).json({ conversation: formatConversation(existing) });
        }
      }
      return res.status(500).json({ error: 'Failed to create or retrieve direct conversation' });
    }
  });

  // FR-09 & Section 4.2: Create a group conversation involving multiple registered users
  router.post('/group', async (req, res) => {
    try {
      const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
      const rawParticipants = Array.isArray(req.body.participantIds) ? req.body.participantIds : [];

      if (!name || name.length > 64) {
        return res.status(400).json({ error: 'Group name is required and must be at most 64 characters' });
      }

      const uniqueIds = new Set([req.user.id]);
      for (const pid of rawParticipants) {
        if (typeof pid !== 'string' || !mongoose.Types.ObjectId.isValid(pid)) {
          return res.status(400).json({ error: 'Invalid participant ID in list' });
        }
        uniqueIds.add(pid);
      }

      const participantIdArray = Array.from(uniqueIds);
      if (participantIdArray.length < 2) {
        return res.status(400).json({ error: 'Group conversation must include at least one other registered user' });
      }

      const foundUsers = await User.find({ _id: { $in: participantIdArray } }, '_id');
      if (foundUsers.length !== participantIdArray.length) {
        return res.status(404).json({ error: 'One or more specified participants do not exist' });
      }

      let conversation = await Conversation.create({
        type: 'group',
        name,
        participants: participantIdArray,
        createdBy: req.user.id
      });
      conversation = await conversation.populate('participants', '_id username');

      const formatted = formatConversation(conversation);
      if (io) {
        participantIdArray.forEach((uid) => {
          io.to(`user:${uid}`).emit('conversation:new', formatted);
        });
      }

      return res.status(201).json({
        conversation: formatted
      });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to create group conversation' });
    }
  });

  // FR-08, FR-12, FR-13 & Section 4.3, 4.4: Retrieve chronological message history (participants only)
  router.get('/:id/messages', async (req, res) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ error: 'Invalid conversation ID' });
      }

      const conversation = await Conversation.findById(id);
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      const isParticipant = conversation.participants.some(
        (p) => p.toString() === req.user.id
      );
      if (!isParticipant) {
        return res.status(403).json({ error: 'Forbidden: You are not a participant in this conversation' });
      }

      const messages = await Message.find({ conversation: id })
        .sort({ createdAt: 1, _id: 1 })
        .populate('sender', '_id username');

      return res.status(200).json({
        messages: messages.map(formatMessage)
      });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to retrieve message history' });
    }
  });

  // FR-05, FR-06, FR-07, FR-11, FR-12, FR-14: Submit a message (persist BEFORE notifying clients)
  router.post('/:id/messages', async (req, res) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ error: 'Invalid conversation ID' });
      }

      const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';
      if (!content) {
        return res.status(400).json({ error: 'Message content cannot be empty' });
      }
      if (content.length > 2000) {
        return res.status(400).json({ error: 'Message content cannot exceed 2000 characters' });
      }

      const conversation = await Conversation.findById(id);
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      const isParticipant = conversation.participants.some(
        (p) => p.toString() === req.user.id
      );
      if (!isParticipant) {
        return res.status(403).json({ error: 'Forbidden: You are not a participant in this conversation' });
      }

      // Section 4.5: Persist the message BEFORE notifying other clients
      let message = await Message.create({
        conversation: conversation._id,
        sender: req.user.id,
        content
      });
      message = await message.populate('sender', '_id username');
      const formatted = formatMessage(message);

      if (io) {
        let broadcast = io.to(`conversation:${id}`);
        conversation.participants.forEach((pid) => {
          broadcast = broadcast.to(`user:${pid.toString()}`);
        });
        broadcast.emit('message:new', formatted);
      }

      return res.status(201).json({
        message: formatted
      });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to persist and send message' });
    }
  });

  return router;
};
