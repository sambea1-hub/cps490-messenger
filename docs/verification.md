# Verification and Acceptance Testing Report

## Messenger: Real-Time Private and Group Communication Platform

> **Course:** CPS 490: Capstone I (Fall 2026)  
> **Assignment:** IA 06: Messenger Implementation and Verification  
> **Author:** Amar Sambe  
> **Last updated:** November 2, 2026  

---

## 1. Automated Test Suite Verification (Section 5.2)

### 1.1 Test Isolation Strategy
The automated test suite (`server/tests/messenger.test.js`) isolates disposable test data from normal development data by connecting exclusively to a dedicated test database (`MONGODB_TEST_URI=mongodb://127.0.0.1:27017/messenger_test`), leaving the development database (`messenger`) untouched. Within the test suite, `beforeEach` and `after` lifecycle hooks clear the `User`, `Conversation`, and `Message` collections before and after every test case.

### 1.2 Reproducing Automated Tests on a Fresh Environment
From the repository root, ensure MongoDB is running via Docker Compose and execute `npm test`:

```bash
docker compose up -d
npm test
```

### 1.3 Observed Automated Test Output
```text
> cps490-messenger@1.0.0 test
> npm --workspace=server test

> messenger-server@1.0.0 test
> node --test tests/*.test.js

✔ FR-01, FR-02, NFR-03: Account registration, bcrypt hashing, and duplicate/invalid rejection
✔ FR-02, FR-03, FR-04: Login verification, invalid login rejection, missing token rejection, and logout revocation
✔ FR-05, FR-07, FR-08, FR-14: Direct conversation deduplication, message persistence, ordering, and length validation
✔ FR-09, FR-12, Section 4.4: Group conversations and strict server-side authorization blocking non-participants
✔ FR-06, FR-11, Section 4.4 & 4.5: Socket.IO live message delivery and real-time subscription authorization
ℹ tests 5
ℹ pass 5
ℹ fail 0
```

---

## 2. Reproducible Multi-User Acceptance Demonstration (Section 5.3)

This section documents the 5-step verification scenario using four registered accounts (`alice`, `bob`, `carol`, and unrelated user `eve`).

### 2.1 Automated Execution of the 5-Step Scenario
You can reproduce all 5 steps automatically via our verification runner script:

```bash
node server/tests/verify-scenario.js
```

**Observed Output:**
```text
=== Starting Section 5.3 Manual Acceptance Scenario Verification ===
[PASS] Steps 1 & 2: Alice and Bob exchanged direct messages and Bob received Alice message live via Socket.IO without refresh.
[PASS] Step 3: Bob logged out, Alice sent a message while Bob was offline, and Bob retrieved both messages in order after logging back in.
[PASS] Step 4: Alice created group with Bob and Carol; members read/contributed; unrelated user Eve was rejected with HTTP 403.
[PASS] Step 5: Outsider Eve attempted direct HTTP API and Socket.IO access to Alice & Bob private conversation and was rejected on both.
=== All 5 Acceptance Scenarios Verified Successfully ===
```

---

### 2.2 Step-by-Step Browser & CLI Walkthrough

To perform this demonstration interactively in the browser, start the backend (`npm run dev:server`) and frontend (`npm run dev:client`), and open three independent browser tabs at `http://localhost:5173`. (Because the React client stores session tokens in `sessionStorage`, each tab maintains an independent authenticated session).

#### Step 1 & Step 2: Direct Conversation and Live Delivery Without Refresh
* **Action:**
  1. In **Tab 1**, click **Register** and create user `alice` (password `Password123!`).
  2. In **Tab 2**, click **Register** and create user `bob` (password `Password123!`).
  3. In **Tab 1 (`alice`)**, click **Refresh List**, select `bob` under **Start Direct Conversation**, and click **Open Direct Chat**.
  4. In **Tab 2 (`bob`)**, click the `@ alice` conversation in the sidebar.
  5. In **Tab 1 (`alice`)**, type `"Hello Bob, live test!"` and click **Send**.
* **Expected Outcome:** The message is persisted in MongoDB and appears immediately inside Bob's open conversation view in **Tab 2** without refreshing the page.
* **Observed Result:** Verified. Bob's browser tab rendered `"Hello Bob, live test!"` in under 100 ms with sender `alice` and timestamp while the header badge displayed `Live Connected`.

#### Step 3: Offline Persistence and Recovery After Logout
* **Action:**
  1. In **Tab 2 (`bob`)**, click the red **Log Out** button in the top header.
  2. In **Tab 1 (`alice`)**, send a second message in the `@ bob` conversation: `"Message sent while Bob is logged out"`.
  3. In **Tab 2**, sign back in as `bob` (`Password123!`) and select the `@ alice` conversation.
* **Expected Outcome:** Bob retrieves the complete conversation history from MongoDB in ascending chronological order, including the message sent while he was logged out. Also survives a full backend server restart (`Ctrl+C` and `npm run dev:server`).
* **Observed Result:** Verified. Both `"Hello Bob, live test!"` and `"Message sent while Bob is logged out"` rendered in exact chronological order upon logging back in.

#### Step 4: Group Conversation Creation, Member Participation, and Non-Member Isolation
* **Action:**
  1. In **Tab 3**, register a third account `carol` (`Password123!`) and a fourth account `eve` (`Password123!`). Stay signed in as `carol` in Tab 3.
  2. In **Tab 1 (`alice`)**, click **Refresh List**, enter group name `Capstone Team` under **Create Group Conversation**, check both `bob` and `carol` (leaving `eve` unchecked), and click **Create Group**.
  3. Send messages from `alice`, `bob`, and `carol` inside `# Capstone Team`.
* **Expected Outcome:** `# Capstone Team` appears automatically in the sidebars of `alice`, `bob`, and `carol`, and all three members can read history and post live messages. `eve` does not see the group and is rejected by the server if attempting access.
* **Observed Result:** Verified. All three members exchanged live group messages, while `eve` had zero visibility or access.

#### Step 5: Direct API and Socket.IO Rejection for Non-Participants
* **Action:**
  Authenticate as `eve` (`POST /api/auth/login`) to obtain Eve's JWT token, and attempt to read or post to Alice and Bob's private `conversationId` via `curl` or Socket.IO:
  ```bash
  curl -i -H "Authorization: Bearer <EVE_JWT_TOKEN>" http://localhost:4000/api/conversations/<ALICE_BOB_CONVERSATION_ID>/messages
  ```
* **Expected Outcome:** The server rejects the request with `HTTP/1.1 403 Forbidden` and `{"error":"Forbidden: You are not a participant in this conversation"}`. Attempting `socket.emit('conversation:join', '<ALICE_BOB_CONVERSATION_ID>')` returns `{"error":"Forbidden: Not a participant in this conversation"}`.
* **Observed Result:** Verified. Both the HTTP REST endpoint and Socket.IO room handler enforced server-side participant checks and rejected `eve` with Forbidden responses.
