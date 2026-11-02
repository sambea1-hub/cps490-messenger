const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { io: ClientIO } = require('socket.io-client');

process.env.JWT_SECRET = 'test-secret-key-for-automated-verification';
const TEST_DB_URI = process.env.MONGODB_TEST_URI || 'mongodb://127.0.0.1:27017/messenger_test';

const { createApp } = require('../src/app');
const User = require('../src/models/User');
const Conversation = require('../src/models/Conversation');
const Message = require('../src/models/Message');

let httpServer;
let ioServer;
let baseUrl;

async function apiRequest(path, { method = 'GET', token = null, body = null } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

before(async () => {
  await mongoose.connect(TEST_DB_URI);
  const appBundle = createApp();
  httpServer = appBundle.httpServer;
  ioServer = appBundle.io;

  await new Promise((resolve) => {
    httpServer.listen(0, '127.0.0.1', () => {
      const address = httpServer.address();
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

beforeEach(async () => {
  // Isolate disposable test data per test run
  await Message.deleteMany({});
  await Conversation.deleteMany({});
  await User.deleteMany({});
});

after(async () => {
  await Message.deleteMany({});
  await Conversation.deleteMany({});
  await User.deleteMany({});
  if (ioServer) ioServer.close();
  if (httpServer) {
    await new Promise((resolve) => httpServer.close(resolve));
  }
  await mongoose.connection.close();
});

test('FR-01, FR-02, NFR-03: Account registration, bcrypt hashing, and duplicate/invalid rejection', async () => {
  // Allowed: Valid registration
  const reg = await apiRequest('/api/auth/register', {
    method: 'POST',
    body: { username: 'alice', password: 'Password123!' }
  });
  assert.equal(reg.status, 201);
  assert.ok(reg.data.token);
  assert.equal(reg.data.user.username, 'alice');

  // Verify password is stored only as a bcrypt hash, never plain text
  const dbUser = await User.findOne({ username: 'alice' });
  assert.ok(dbUser);
  assert.notEqual(dbUser.passwordHash, 'Password123!');
  assert.match(dbUser.passwordHash, /^\$2[abxy]\$\d+\$/);

  // Rejected: Duplicate username (409)
  const dup = await apiRequest('/api/auth/register', {
    method: 'POST',
    body: { username: 'alice', password: 'AnotherPassword123!' }
  });
  assert.equal(dup.status, 409);

  // Rejected: Short password under 8 characters (400)
  const shortPass = await apiRequest('/api/auth/register', {
    method: 'POST',
    body: { username: 'bob', password: 'short' }
  });
  assert.equal(shortPass.status, 400);
});

test('FR-02, FR-03, FR-04: Login verification, invalid login rejection, missing token rejection, and logout revocation', async () => {
  await apiRequest('/api/auth/register', {
    method: 'POST',
    body: { username: 'alice', password: 'Password123!' }
  });

  // Rejected: Wrong password (401)
  const badLogin = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: { username: 'alice', password: 'WrongPassword!' }
  });
  assert.equal(badLogin.status, 401);

  // Rejected: Non-existent user (401)
  const noUser = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: { username: 'nobody', password: 'Password123!' }
  });
  assert.equal(noUser.status, 401);

  // Allowed: Valid login (200)
  const goodLogin = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: { username: 'alice', password: 'Password123!' }
  });
  assert.equal(goodLogin.status, 200);
  const token = goodLogin.data.token;
  assert.ok(token);

  // Rejected: Protected route without a token (401)
  const unauth = await apiRequest('/api/conversations');
  assert.equal(unauth.status, 401);

  // Allowed: Identify current authenticated user (/api/auth/me)
  const me = await apiRequest('/api/auth/me', { token });
  assert.equal(me.status, 200);
  assert.equal(me.data.user.username, 'alice');

  // Allowed: Logout and verify token is revoked (FR-03)
  const logout = await apiRequest('/api/auth/logout', { method: 'POST', token });
  assert.equal(logout.status, 200);

  const afterLogout = await apiRequest('/api/auth/me', { token });
  assert.equal(afterLogout.status, 401);
});

test('FR-05, FR-07, FR-08, FR-14: Direct conversation deduplication, message persistence, ordering, and length validation', async () => {
  const alice = await apiRequest('/api/auth/register', {
    method: 'POST',
    body: { username: 'alice', password: 'Password123!' }
  });
  const bob = await apiRequest('/api/auth/register', {
    method: 'POST',
    body: { username: 'bob', password: 'Password123!' }
  });

  // Create direct conversation from Alice to Bob
  const conv1 = await apiRequest('/api/conversations/direct', {
    method: 'POST',
    token: alice.data.token,
    body: { recipientId: bob.data.user.id }
  });
  assert.equal(conv1.status, 201);
  const convId = conv1.data.conversation.id;

  // Attempting to create direct conversation again from Bob to Alice returns same conversation without duplication
  const conv2 = await apiRequest('/api/conversations/direct', {
    method: 'POST',
    token: bob.data.token,
    body: { recipientId: alice.data.user.id }
  });
  assert.equal(conv2.status, 200);
  assert.equal(conv2.data.conversation.id, convId);

  // Rejected: Empty message (400)
  const emptyMsg = await apiRequest(`/api/conversations/${convId}/messages`, {
    method: 'POST',
    token: alice.data.token,
    body: { content: '   ' }
  });
  assert.equal(emptyMsg.status, 400);

  // Rejected: Message exceeding 2000 characters (400)
  const longMsg = await apiRequest(`/api/conversations/${convId}/messages`, {
    method: 'POST',
    token: alice.data.token,
    body: { content: 'x'.repeat(2001) }
  });
  assert.equal(longMsg.status, 400);

  // Allowed: Send persistent messages in order
  const m1 = await apiRequest(`/api/conversations/${convId}/messages`, {
    method: 'POST',
    token: alice.data.token,
    body: { content: 'First message from Alice' }
  });
  assert.equal(m1.status, 201);

  const m2 = await apiRequest(`/api/conversations/${convId}/messages`, {
    method: 'POST',
    token: bob.data.token,
    body: { content: 'Second message from Bob' }
  });
  assert.equal(m2.status, 201);

  // Retrieve persisted history and verify chronological order
  const history = await apiRequest(`/api/conversations/${convId}/messages`, {
    token: bob.data.token
  });
  assert.equal(history.status, 200);
  assert.equal(history.data.messages.length, 2);
  assert.equal(history.data.messages[0].content, 'First message from Alice');
  assert.equal(history.data.messages[0].sender.username, 'alice');
  assert.equal(history.data.messages[1].content, 'Second message from Bob');
  assert.equal(history.data.messages[1].sender.username, 'bob');
});

test('FR-09, FR-12, Section 4.4: Group conversations and strict server-side authorization blocking non-participants', async () => {
  const alice = await apiRequest('/api/auth/register', {
    method: 'POST',
    body: { username: 'alice', password: 'Password123!' }
  });
  const bob = await apiRequest('/api/auth/register', {
    method: 'POST',
    body: { username: 'bob', password: 'Password123!' }
  });
  const carol = await apiRequest('/api/auth/register', {
    method: 'POST',
    body: { username: 'carol', password: 'Password123!' }
  });
  const outsider = await apiRequest('/api/auth/register', {
    method: 'POST',
    body: { username: 'outsider', password: 'Password123!' }
  });

  // Alice creates a group with Bob and Carol
  const groupRes = await apiRequest('/api/conversations/group', {
    method: 'POST',
    token: alice.data.token,
    body: {
      name: 'Capstone Team',
      participantIds: [bob.data.user.id, carol.data.user.id]
    }
  });
  assert.equal(groupRes.status, 201);
  const groupId = groupRes.data.conversation.id;

  // Carol can post and read in the group
  const postRes = await apiRequest(`/api/conversations/${groupId}/messages`, {
    method: 'POST',
    token: carol.data.token,
    body: { content: 'Hello team from Carol!' }
  });
  assert.equal(postRes.status, 201);

  const bobRead = await apiRequest(`/api/conversations/${groupId}/messages`, {
    token: bob.data.token
  });
  assert.equal(bobRead.status, 200);
  assert.equal(bobRead.data.messages.length, 1);

  // Rejected: Outsider cannot read group history (403 Forbidden)
  const outsiderRead = await apiRequest(`/api/conversations/${groupId}/messages`, {
    token: outsider.data.token
  });
  assert.equal(outsiderRead.status, 403);

  // Rejected: Outsider cannot send a message to the group (403 Forbidden)
  const outsiderSend = await apiRequest(`/api/conversations/${groupId}/messages`, {
    method: 'POST',
    token: outsider.data.token,
    body: { content: 'Unauthorized injection attempt' }
  });
  assert.equal(outsiderSend.status, 403);
});

test('FR-06, FR-11, Section 4.4 & 4.5: Socket.IO live message delivery and real-time subscription authorization', async () => {
  const alice = await apiRequest('/api/auth/register', {
    method: 'POST',
    body: { username: 'alice', password: 'Password123!' }
  });
  const bob = await apiRequest('/api/auth/register', {
    method: 'POST',
    body: { username: 'bob', password: 'Password123!' }
  });
  const eve = await apiRequest('/api/auth/register', {
    method: 'POST',
    body: { username: 'eve', password: 'Password123!' }
  });

  const conv = await apiRequest('/api/conversations/direct', {
    method: 'POST',
    token: alice.data.token,
    body: { recipientId: bob.data.user.id }
  });
  const convId = conv.data.conversation.id;

  // Connect Bob and Eve via Socket.IO
  const bobSocket = ClientIO(baseUrl, {
    auth: { token: bob.data.token },
    transports: ['websocket']
  });
  const eveSocket = ClientIO(baseUrl, {
    auth: { token: eve.data.token },
    transports: ['websocket']
  });

  await Promise.all([
    new Promise((resolve, reject) => {
      bobSocket.on('connect', resolve);
      bobSocket.on('connect_error', reject);
    }),
    new Promise((resolve, reject) => {
      eveSocket.on('connect', resolve);
      eveSocket.on('connect_error', reject);
    })
  ]);

  try {
    // Allowed: Bob joins the conversation room
    const bobJoin = await new Promise((resolve) => {
      bobSocket.emit('conversation:join', convId, resolve);
    });
    assert.equal(bobJoin.status, 'ok');

    // Rejected: Outsider Eve is blocked from subscribing to Alice & Bob's room
    const eveJoin = await new Promise((resolve) => {
      eveSocket.emit('conversation:join', convId, resolve);
    });
    assert.ok(eveJoin.error);
    assert.match(eveJoin.error, /Forbidden/);

    // Rejected: Outsider Eve is blocked from sending via Socket.IO
    const eveSend = await new Promise((resolve) => {
      eveSocket.emit('message:send', { conversationId: convId, content: 'Spy message' }, resolve);
    });
    assert.ok(eveSend.error);
    assert.match(eveSend.error, /Forbidden/);

    // Verify Bob receives Alice's message in real time while Eve receives nothing
    let eveReceived = false;
    eveSocket.on('message:new', () => {
      eveReceived = true;
    });

    const bobMessagePromise = new Promise((resolve) => {
      bobSocket.on('message:new', (msg) => resolve(msg));
    });

    await apiRequest(`/api/conversations/${convId}/messages`, {
      method: 'POST',
      token: alice.data.token,
      body: { content: 'Live hello over Socket.IO!' }
    });

    const receivedMsg = await bobMessagePromise;
    assert.equal(receivedMsg.content, 'Live hello over Socket.IO!');
    assert.equal(receivedMsg.sender.username, 'alice');
    assert.equal(eveReceived, false);
  } finally {
    bobSocket.disconnect();
    eveSocket.disconnect();
  }
});
