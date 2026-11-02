# Implementation and Traceability Report

## Messenger: Real-Time Private and Group Communication Platform

> **Course:** CPS 490: Capstone I (Fall 2026)  
> **Assignment:** IA 06: Messenger Implementation and Verification  
> **Author:** Amar Sambe  
> **Last updated:** November 2, 2026  

---

## 1. Executive Summary and Architectural Reconciliation

This report documents the implementation of the Messenger platform and traces every functional and non-functional requirement from `docs/requirements.md` to its implementing source module, automated verification test, and observed outcome.

### Reconciliation of Earlier Artifacts (Section 2 Compliance)
During initial planning (IA-02 through IA-04), the persistence and real-time layers were generically described using relational SQL terminology and generic WebSockets. To comply with the prescribed course technology stack in IA-06:
1. **Persistence Layer:** Implemented using **MongoDB 7 and Mongoose** (`server/src/models/User.js`, `Conversation.js`, `Message.js`), orchestrated via **Docker Compose** (`compose.yaml`).
2. **Real-Time Layer:** Implemented using **Socket.IO** (`server/src/app.js` and `client/src/App.jsx`) with JWT handshake authentication and server-enforced room authorization.
3. **Frontend & Auth:** Implemented using **React 18 with Vite**, **bcrypt** (cost factor 10), and **JWT** (`jsonwebtoken`).

All earlier documents (`docs/statement-of-work.md`, `docs/requirements.md`, `docs/analysis.md`, and `docs/diagrams/*.puml`) have been updated and reconciled so the entire repository describes one coherent MongoDB/Mongoose, Express, React/Vite, and Socket.IO system.

---

## 2. Requirements Traceability Matrix

| Req ID | Requirement Summary | Implementing Module / Endpoint | Automated Test / Verification Check | Verification Outcome & Notes |
|---|---|---|---|---|
| **FR-01** | User account registration with unique username (3-32 chars) and password (>= 8 chars) | `server/src/routes/auth.js` (`POST /api/auth/register`), `server/src/models/User.js` | `server/tests/messenger.test.js` (Test 1); `verify-scenario.js` | **PASSED.** Creates account (201), rejects duplicate usernames (409) and passwords < 8 chars (400). |
| **FR-02** | Authenticate credentials against bcrypt hashes and issue signed JWT; identify current user | `server/src/routes/auth.js` (`POST /api/auth/login`, `GET /api/auth/me`) | `server/tests/messenger.test.js` (Tests 1 & 2) | **PASSED.** Issues signed JWT on valid login (200); rejects invalid credentials (401); `/api/auth/me` identifies acting user from JWT. |
| **FR-03** | Explicit logout revoking session token and terminating active socket connection | `server/src/routes/auth.js` (`POST /api/auth/logout`), `server/src/middleware/auth.js`, `client/src/App.jsx` | `server/tests/messenger.test.js` (Test 2) | **PASSED.** Token added to server revocation set; subsequent requests with logged-out token return HTTP 401. |
| **FR-04** | Protect all HTTP endpoints and Socket.IO connections via server-verified JWT identity | `server/src/middleware/auth.js` (`authMiddleware`), `server/src/app.js` (`io.use`) | `server/tests/messenger.test.js` (Tests 2 & 5) | **PASSED.** Acting user is always derived from verified JWT (`req.user.id` / `socket.user.id`), never from client-supplied user IDs. |
| **FR-05** | Create/enter direct conversation between two registered users without duplication and send messages | `server/src/routes/conversations.js` (`POST /api/conversations/direct`, `POST /api/conversations/:id/messages`) | `server/tests/messenger.test.js` (Test 3); `verify-scenario.js` (Step 1) | **PASSED.** Canonical sorted `directKey` prevents duplicate direct conversations between the same pair of users. |
| **FR-06** | Real-time delivery of direct messages over Socket.IO to connected recipients | `server/src/routes/conversations.js`, `server/src/app.js` (`message:new` event) | `server/tests/messenger.test.js` (Test 5); `verify-scenario.js` (Step 2) | **PASSED.** Messages arrive instantly in open recipient sessions without manual page refresh. |
| **FR-07** | Persist all direct messages in MongoDB before notifying clients; survive logout and restart | `server/src/models/Message.js`, `server/src/routes/conversations.js` | `server/tests/messenger.test.js` (Test 3); `verify-scenario.js` (Step 3) | **PASSED.** `Message.create()` completes in MongoDB prior to `io.to(...).emit('message:new')`. |
| **FR-08** | Retrieve direct message history sorted strictly in ascending chronological order | `server/src/routes/conversations.js` (`GET /api/conversations/:id/messages`) | `server/tests/messenger.test.js` (Test 3); `verify-scenario.js` (Step 3) | **PASSED.** Queries compound index `{ conversation: 1, createdAt: 1, _id: 1 }` for deterministic chronological ordering. |
| **FR-09** | Create named group conversation involving multiple registered users | `server/src/routes/conversations.js` (`POST /api/conversations/group`), `server/src/models/Conversation.js` | `server/tests/messenger.test.js` (Test 4); `verify-scenario.js` (Step 4) | **PASSED.** Creates group conversation and notifies all initial participants in real time. |
| **FR-10** | Display all direct and group conversations in which the authenticated user participates | `server/src/routes/conversations.js` (`GET /api/conversations`), `client/src/App.jsx` | `server/tests/messenger.test.js` (Test 4); `verify-scenario.js` (Step 4) | **PASSED.** Queries `{ participants: req.user.id }` and renders sidebar conversation list. |
| **FR-11** | Broadcast group messages in real time to all connected group participants | `server/src/routes/conversations.js`, `server/src/app.js` | `server/tests/messenger.test.js` (Tests 4 & 5); `verify-scenario.js` (Step 4) | **PASSED.** Group messages broadcast to all authorized participant sockets in real time. |
| **FR-12** | Enforce server-side authorization blocking non-participants from reading, sending, or subscribing | `server/src/routes/conversations.js`, `server/src/app.js` (`conversation:join`, `message:send`) | `server/tests/messenger.test.js` (Tests 4 & 5); `verify-scenario.js` (Steps 4 & 5) | **PASSED.** Non-participants receive HTTP 403 Forbidden on REST endpoints and `Forbidden` error callbacks on Socket.IO events. |
| **FR-13** | Persist group channel messages and retrieve chronological history | `server/src/models/Message.js`, `server/src/routes/conversations.js` | `server/tests/messenger.test.js` (Test 4); `verify-scenario.js` (Step 4) | **PASSED.** Group messages persist in MongoDB and load in chronological order across sessions. |
| **FR-14** | Validate message content (non-empty, max 2,000 characters) | `server/src/models/Message.js`, `server/src/routes/conversations.js`, `client/src/App.jsx` | `server/tests/messenger.test.js` (Test 3) | **PASSED.** Empty/whitespace messages and payloads > 2,000 chars are rejected with HTTP 400. |
| **FR-15** | Clear UI states for login, loading, empty conversations, validation errors, and connectivity loss | `client/src/App.jsx`, `client/src/styles.css` | Manual UI inspection & `docs/verification.md` | **PASSED.** Displays connection badge (`Live Connected` / `Disconnected`), offline banner, loading indicators, and error alerts. |
| **FR-16** | Dynamic DOM rendering of incoming messages without manual page refresh | `client/src/App.jsx` (`socket.on('message:new')`) | `server/tests/messenger.test.js` (Test 5); `verify-scenario.js` (Step 2) | **PASSED.** Incoming messages append dynamically with duplicate-ID protection. |
| **NFR-01** | Sub-500ms real-time message delivery latency | `server/src/app.js`, `server/src/routes/conversations.js` | `server/tests/messenger.test.js` (Test 5) | **PASSED.** Local end-to-end persistence + Socket.IO delivery completes in < 50 ms. |
| **NFR-03** | Passwords stored strictly as bcrypt hashes (work factor 10), never plain text | `server/src/routes/auth.js`, `server/src/models/User.js` | `server/tests/messenger.test.js` (Test 1) | **PASSED.** Verified stored `passwordHash` matches `/^\$2[abxy]\$\d+\$/` and never equals plaintext password. |
| **NFR-04** | Route protection and XSS prevention via React JSX auto-escaping | `server/src/middleware/auth.js`, `client/src/App.jsx` | `server/tests/messenger.test.js` (Tests 2, 4, 5) | **PASSED.** All private endpoints require Bearer JWT; React escapes message text nodes in DOM. |
| **NFR-05** | Automatic Socket.IO reconnection and persistent history recovery | `client/src/App.jsx` (`reconnection: true`) | `verify-scenario.js` (Step 3) | **PASSED.** Reconnecting or logging back in fetches complete missed message history from MongoDB. |
| **NFR-06** | Reproducible setup from clean checkout with Docker Compose | `compose.yaml`, `package.json`, `README.md` | Clean checkout build & test run | **PASSED.** `docker compose up -d && npm install && npm test && npm run build` succeeds cleanly. |
| **NFR-07** | Automated test suite covering positive and negative cases with isolated test data | `server/tests/messenger.test.js` | `npm test` | **PASSED.** All 5 comprehensive integration test suites pass (`pass 5, fail 0`). |
