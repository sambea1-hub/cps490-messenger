# Messenger: Real-Time Private and Group Communication Platform

> **Course:** CPS 490: Capstone I (Fall 2026)  
> **Assignment:** IA 06: Messenger Implementation, Verification, and Release  
> **Author:** Amar Sambe  

Messenger is a full-stack, real-time communication web application supporting authenticated one-to-one direct conversations and multi-user group conversations with durable message history and server-enforced access control.

---

## 1. Prescribed Technology Stack

* **Runtime & Backend:** Node.js 24 LTS and Express (`server/`)
* **Database & ODM:** MongoDB 7 with Mongoose (`compose.yaml`, `server/src/models/`)
* **Frontend Client:** React 18 with Vite (`client/`)
* **Authentication & Security:** `bcrypt` password hashing (work factor 10) and signed `JWT` Bearer tokens (`server/src/middleware/auth.js`)
* **Real-Time Transport:** Socket.IO (`server/src/app.js`, `client/src/App.jsx`)

### Supporting Libraries and Justification
* `cors`: Enables cross-origin requests between the Vite React client (`http://localhost:5173`) and Express API (`http://localhost:4000`).
* `dotenv`: Loads environment variables from `.env` without hardcoding secrets in source files.
* `socket.io-client`: Official client library matching the backend Socket.IO real-time server and used for automated WebSocket tests.

---

## 2. Prerequisites and Versions

Ensure the following software is installed on your machine before starting from a clean clone:
* **Node.js:** v24.x LTS (verified with `node -v`)
* **npm:** v10.x or newer (verified with `npm -v`)
* **Docker Engine & Docker Compose:** Docker v24+ and Docker Compose v2+ (verified with `docker --version` and `docker compose version`)
* **Git:** v2.34+

---

## 3. Clean Checkout Installation and Configuration

1. **Clone the repository and enter the project directory:**
   ```bash
   git clone [https://github.com/sambea1-hub/cps490-messenger.git](https://github.com/sambea1-hub/cps490-messenger.git)
   cd cps490-messenger
   ```

2. **Create your local environment file from the safe example template:**
   ```bash
   cp .env.example .env
   ```
   The `.env.example` file contains safe local defaults and no private production credentials:
   ```env
   PORT=4000
   MONGODB_URI=mongodb://127.0.0.1:27017/messenger
   MONGODB_TEST_URI=mongodb://127.0.0.1:27017/messenger_test
   JWT_SECRET=replace-with-a-strong-random-jwt-secret-key
   CLIENT_ORIGIN=http://localhost:5173
   ```

3. **Start the local MongoDB service via Docker Compose:**
   ```bash
   docker compose up -d
   ```
   Verify that the `messenger-mongodb` container is running on port `27017`:
   ```bash
   docker compose ps
   ```

4. **Install all backend and frontend workspace dependencies:**
   ```bash
   npm install
   ```
   *(Note: If your environment runs an `allowScripts` security plugin that pauses native compilation of `bcrypt`, run `npm rebuild bcrypt` to compile the native module).*

---

## 4. Starting the Backend and React Client

Open two terminal tabs in the repository root:

* **Terminal 1 (Start Express + Socket.IO Backend Server on port 4000):**
  ```bash
  npm run dev:server
  ```
  *(Or run `npm start` for standard non-watch execution).*

* **Terminal 2 (Start React + Vite Client on port 5173):**
  ```bash
  npm run dev:client
  ```

Open your browser to **`http://localhost:5173`**.  
*(Note: Because the React client stores session tokens in `sessionStorage`, you can open multiple tabs in the same browser to sign in simultaneously as different users such as `alice`, `bob`, and `carol`).*

---

## 5. Running Automated Tests and Build Checks

1. **Run the automated unit, API, persistence, and Socket.IO integration test suite:**
   ```bash
   npm test
   ```
   * **Test Data Isolation:** The test suite connects exclusively to `MONGODB_TEST_URI` (`mongodb://127.0.0.1:27017/messenger_test`), which is completely separate from the development database (`messenger`). Every test cleans up its collections in `beforeEach` and `after` hooks so normal development data is never modified.

2. **Run the automated 5-step multi-user acceptance scenario script:**
   ```bash
   node server/tests/verify-scenario.js
   ```

3. **Verify the React + Vite production frontend build:**
   ```bash
   npm run build
   ```

---

## 6. Common Failure Diagnoses and Troubleshooting

* **Missing `JWT_SECRET` Variable:**  
  If `.env` is missing or `JWT_SECRET` is empty, the server immediately logs `FATAL ERROR: JWT_SECRET environment variable is not set` and exits with code `1`. Fix by running `cp .env.example .env`.
* **Occupied Ports (`EADDRINUSE` on `4000`, `5173`, or `27017`):**  
  If port `4000` is occupied, change `PORT=4001` in `.env` and set `VITE_API_URL=http://localhost:4001` when running the client, or stop the conflicting process with `lsof -i :4000`.
* **MongoDB Connection Refused (`ECONNREFUSED 127.0.0.1:27017`):**  
  Ensure the Docker daemon is running (`sudo systemctl start docker`) and start the database container with `docker compose up -d`.
* **Loss of Backend Connectivity in Browser:**  
  If the backend server stops while a user is signed in, the React client automatically transitions the header badge to `Disconnected` and displays a red banner (`Live connection interrupted. Attempting to reconnect to backend server...`), reconnecting automatically via Socket.IO once the server restarts.

---

## 7. Known Limitations and Release Procedure

* **Known Limitations:**  
  * Messaging is intentionally scoped to plain UTF-8 text up to 2,000 characters; file uploads, voice/video streaming, and read receipts are out of scope per the Statement of Work.
  * Token revocation upon logout is tracked in server memory (`revokedTokens` set) alongside the 24-hour JWT expiration window.
* **Release Procedure:**  
  1. Ensure `docker compose up -d` is running.
  2. Execute `npm test` and confirm 100% of automated tests pass (`fail 0`).
  3. Execute `node server/tests/verify-scenario.js` to verify the 5-step multi-user acceptance workflow.
  4. Execute `npm run build` to verify the client production bundle compiles cleanly.
  5. Verify `git status` contains no `.env`, `node_modules/`, or `client/dist/` artifacts before pushing to GitHub.
