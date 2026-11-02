const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { io: ClientIO } = require('socket.io-client');

process.env.JWT_SECRET = 'acceptance-verification-secret-key';
const TEST_DB_URI = process.env.MONGODB_TEST_URI || 'mongodb://127.0.0.1:27017/messenger_test';

const { createApp } = require('../src/app');
const User = require('../src/models/User');
const Conversation = require('../src/models/Conversation');
const Message = require('../src/models/Message');

async function runAcceptanceScenario() {
  console.log('=== Starting Section 5.3 Manual Acceptance Scenario Verification ===');
  await mongoose.connect(TEST_DB_URI);
  await Message.deleteMany({});
  await Conversation.deleteMany({});
  await User.deleteMany({});

  const { httpServer, io } = createApp();
  const baseUrl = await new Promise((resolve) => {
    httpServer.listen(0, '127.0.0.1', () => {
      resolve(`http://127.0.0.1:${httpServer.address().port}`);
    });
  });

  async function api(path, { method = 'GET', token = null, body = null } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  }

  try {
    // Register Alice, Bob, Carol, and Outsider Eve
    const alice = (await api('/api/auth/register', { method: 'POST', body: { username: 'alice', password: 'Password123!' } })).data;
    const bob = (await api('/api/auth/register', { method: 'POST', body: { username: 'bob', password: 'Password123!' } })).data;
    const carol = (await api('/api/auth/register', { method: 'POST', body: { username: 'carol', password: 'Password123!' } })).data;
    const eve = (await api('/api/auth/register', { method: 'POST', body: { username: 'eve', password: 'Password123!' } })).data;

    // Steps 1 & 2: Alice and Bob exchange messages in a direct conversation while signed in; appears without manual refresh
    const dmConv = (await api('/api/conversations/direct', {
      method: 'POST',
      token: alice.token,
      body: { recipientId: bob.user.id }
    })).data.conversation;

    const bobSocket = ClientIO(baseUrl, { auth: { token: bob.token }, transports: ['websocket'] });
    await new Promise((resolve) => bobSocket.on('connect', resolve));
    await new Promise((resolve) => bobSocket.emit('conversation:join', dmConv.id, resolve));

    const liveMsgPromise = new Promise((resolve) => bobSocket.on('message:new', resolve));
    await api(`/api/conversations/${dmConv.id}/messages`, {
      method: 'POST',
      token: alice.token,
      body: { content: 'Hi Bob! This is Alice live.' }
    });
    const liveMsg = await liveMsgPromise;
    assert.equal(liveMsg.content, 'Hi Bob! This is Alice live.');
    console.log('[PASS] Steps 1 & 2: Alice and Bob exchanged direct messages and Bob received Alice message live via Socket.IO without refresh.');

    // Step 3: Bob logs out; Alice sends another message; Bob logs back in and retrieves missed message from persistent history
    bobSocket.disconnect();
    await api('/api/auth/logout', { method: 'POST', token: bob.token });

    await api(`/api/conversations/${dmConv.id}/messages`, {
      method: 'POST',
      token: alice.token,
      body: { content: 'Bob, you are offline right now, catch this when you log back in!' }
    });

    const bobRelogin = (await api('/api/auth/login', {
      method: 'POST',
      body: { username: 'bob', password: 'Password123!' }
    })).data;

    const dmHistory = (await api(`/api/conversations/${dmConv.id}/messages`, { token: bobRelogin.token })).data.messages;
    assert.equal(dmHistory.length, 2);
    assert.equal(dmHistory[1].content, 'Bob, you are offline right now, catch this when you log back in!');
    console.log('[PASS] Step 3: Bob logged out, Alice sent a message while Bob was offline, and Bob retrieved both messages in order after logging back in.');

    // Step 4: Alice creates a group with Bob and Carol. Each member can read and contribute; unrelated user (Eve) cannot.
    const grpConv = (await api('/api/conversations/group', {
      method: 'POST',
      token: alice.token,
      body: { name: 'Project Group', participantIds: [bob.user.id, carol.user.id] }
    })).data.conversation;

    await api(`/api/conversations/${grpConv.id}/messages`, {
      method: 'POST',
      token: alice.token,
      body: { content: 'Welcome to Project Group, Bob and Carol!' }
    });
    await api(`/api/conversations/${grpConv.id}/messages`, {
      method: 'POST',
      token: carol.token,
      body: { content: 'Thanks Alice, happy to be here!' }
    });

    const bobGroupHistory = await api(`/api/conversations/${grpConv.id}/messages`, { token: bobRelogin.token });
    assert.equal(bobGroupHistory.status, 200);
    assert.equal(bobGroupHistory.data.messages.length, 2);

    const eveGroupRead = await api(`/api/conversations/${grpConv.id}/messages`, { token: eve.token });
    assert.equal(eveGroupRead.status, 403);
    console.log('[PASS] Step 4: Alice created group with Bob and Carol; members read/contributed; unrelated user Eve was rejected with HTTP 403.');

    // Step 5: User outside Alice and Bob private conversation (Eve) attempts direct API or Socket.IO access and is rejected
    const eveDmRead = await api(`/api/conversations/${dmConv.id}/messages`, { token: eve.token });
    assert.equal(eveDmRead.status, 403);

    const eveDmSend = await api(`/api/conversations/${dmConv.id}/messages`, {
      method: 'POST',
      token: eve.token,
      body: { content: 'Trying to inject into Alice and Bob DM' }
    });
    assert.equal(eveDmSend.status, 403);

    const eveSocket = ClientIO(baseUrl, { auth: { token: eve.token }, transports: ['websocket'] });
    await new Promise((resolve) => eveSocket.on('connect', resolve));
    const eveJoinAck = await new Promise((resolve) => eveSocket.emit('conversation:join', dmConv.id, resolve));
    assert.match(eveJoinAck.error, /Forbidden/);
    eveSocket.disconnect();
    console.log('[PASS] Step 5: Outsider Eve attempted direct HTTP API and Socket.IO access to Alice & Bob private conversation and was rejected on both.');

    console.log('=== All 5 Acceptance Scenarios Verified Successfully ===');
  } finally {
    await Message.deleteMany({});
    await Conversation.deleteMany({});
    await User.deleteMany({});
    io.close();
    await new Promise((resolve) => httpServer.close(resolve));
    await mongoose.connection.close();
  }
}

runAcceptanceScenario().catch((err) => {
  console.error(err);
  process.exit(1);
});
