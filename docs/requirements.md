# Requirements Engineering Document

## Messenger: Real-Time Private and Group Communication Platform

> **Document status:** Final 
> **Course:** CPS 490: Capstone I (Fall 2026)
> **Assignment:** IA 03: Messenger: Requirements Engineering
> **Author:** Amar Sambe 
> **Assigned date:** September 30, 2026
> **Due date:** October 12, 2026
> **Submission:** GitHub
> **Required repository path:** `docs/requirements.md`
> **Version:** 1.0 
> **Last updated:** October 12, 2026 

---

## 1. System Context

### 1.1 System Boundary
Messenger is a three-tier client-server application designed to provide authenticated, self-hosted text communication. The system boundary defines the components under direct engineering control versus external human actors and runtime systems.

The Messenger system boundary contains]:
* **Web Client Application:** Single-page application executing in the user browser that renders interface views, manages thread state, and communicates over HTTP and WebSockets.
* **Application Backend Service:** Central server providing REST endpoints for transactional actions and a WebSocket gateway for low-latency event broadcast.
* **Persistence Database:** Relational database storing user records, channel rosters, direct message logs, and channel archives.

The system boundary explicitly excludes external commercial chat platforms (Discord, Slack), voice or video telephony, third-party identity providers, cloud object stores, and arbitrary file-hosting pipelines.

### 1.2 Actors and External Entities
The primary actors and external systems interacting across the Messenger boundary include:

* **Unauthenticated Visitor:** A user accessing the client who must register an account or log in before accessing messaging resources.
* **Registered Member:** An authenticated user who can initiate direct private messages, create channels, join existing channels, and exchange real-time messages.
* **Channel Administrator:** A registered user who creates a specific group channel, retaining authority to manage channel settings and participant rosters.
* **Web Browser Environment:** The client host environment (Chromium, Firefox, Safari) providing standard DOM, WebSocket, and HTTP fetch APIs.
* **Docker Container Runtime:** The host platform orchestrating container execution, network isolation, and volume persistence via Docker Compose.

---

## 2. Functional Requirements

Functional requirements describe the specific observable behaviors and obligations of the Messenger system.

### 2.1 Identity and Access Control
* **FR-01 (Account Registration):** The system shall allow an unauthenticated visitor to create a new user account by submitting a unique username and a password of at least 8 characters.
* **FR-02 (Credential Verification):** The system shall authenticate user credentials against salted, cryptographic password hashes and issue a signed session token upon successful validation.
* **FR-03 (Session Termination):** The system shall provide an explicit logout function that invalidates the active session token and closes associated WebSocket connections.
* **FR-04 (Route Authorization):** The system shall restrict all messaging and channel endpoints to requests bearing a valid, non-expired authentication token, returning HTTP 401 for unauthorized requests.

### 2.2 Direct Private Messaging (One-to-One)
* **FR-05 (Send Direct Message):** The system shall allow any authenticated user to dispatch a private text message to any other registered user.
* **FR-06 (Real-Time Direct Delivery):** The system shall deliver direct messages immediately over WebSocket to the recipient if the recipient is currently connected.
* **FR-07 (Direct Message Persistence):** The system shall persistently store direct messages in the database with sender ID, recipient ID, UTF-8 text body, and server-generated timestamps.
* **FR-08 (Direct Conversation Retrieval):** The system shall allow authenticated participants of a direct conversation to retrieve past messages sorted strictly in ascending chronological order.

### 2.3 Group Messaging (Channels)
* **FR-09 (Channel Creation):** The system shall allow an authenticated user to create a named group channel, automatically recording the creator as the channel administrator.
* **FR-10 (Channel Discovery and Joining):** The system shall allow authenticated users to view all available group channels and join open channels without external invitations.
* **FR-11 (Channel Message Broadcast):** The system shall broadcast any message sent to a channel in real time to all channel members who maintain an active WebSocket connection.
* **FR-12 (Channel Access Isolation):** The system shall prevent non-members of a channel from receiving real-time broadcasts or querying message history from that channel.
* **FR-13 (Channel History Persistence):** The system shall persistently store all channel messages and provide paginated, chronologically ordered history to authenticated members.

### 2.4 User Interface and Input Constraints
* **FR-14 (Payload Length Limit):** The system shall enforce a maximum limit of 2,000 characters per message payload and reject messages exceeding this boundary with an explicit validation error.
* **FR-15 (Connection Status Feedback):** The client interface shall provide visible status indicators reflecting active connection, disconnection, and ongoing reconnection attempts.
* **FR-16 (Dynamic DOM Updates):** The client interface shall insert and render incoming messages dynamically into active conversation views without requiring full browser reloads.

---

## 3. Non-Functional Requirements

Non-functional requirements specify measurable quality attributes, technical constraints, and operating boundaries[cite: 11].

| Identifier | Quality Category | Requirement Statement[cite: 11] | Verification Method[cite: 11] |
|---|---|---|---|
| **NFR-01** | Performance | The system shall deliver messages from sender to active recipient WebSockets within 500 ms under a concurrent load of 20 messages per second[cite: 11]. | Automated load script executing end-to-end socket transit benchmarks[cite: 11]. |
| **NFR-02** | Scalability | The backend application and database shall support at least 50 simultaneous active WebSocket connections without memory exhaustion or process failures[cite: 11]. | Stress testing script maintaining 50 concurrent client connections[cite: 11]. |
| **NFR-03** | Security | The system shall hash user passwords using bcrypt (work factor >= 10) or Argon2id prior to database storage, never logging plain text credentials[cite: 11]. | Database schema audit and automated credential hashing unit tests[cite: 11]. |
| **NFR-04** | Security | The client application shall escape HTML and script tags in message payloads before rendering to eliminate Cross-Site Scripting (XSS) risks[cite: 11]. | Automated UI test injecting script tags and inspecting DOM structure[cite: 11]. |
| **NFR-05** | Reliability | The web client shall automatically attempt to reconnect to the WebSocket server using exponential backoff if the network connection drops[cite: 11]. | Simulation test cutting socket server for 10 seconds; verifying client resumes connection and queries missed message delta[cite: 11]. |
| **NFR-06** | Deployability | The complete Messenger product shall start cleanly on a host system with Docker and Docker Compose via a single command (`docker compose up --build`) within 120 seconds[cite: 11]. | Clean virtual machine automated build test with empty container cache[cite: 11]. |
| **NFR-07** | Maintainability | The automated unit and integration test suite shall achieve a minimum of 80% statement coverage across core business logic and data access modules[cite: 11]. | Test coverage runner execution during build[cite: 11]. |
| **NFR-08** | Compatibility | The client user interface shall render and function correctly on standard evergreen desktop browsers (Chromium >= 120, Firefox >= 120, Safari >= 17)[cite: 11]. | Browser compatibility matrix audit verifying identical functional test execution[cite: 11]. |

---

## 4. Acceptance Criteria Matrix

This matrix establishes observable, testable evidence that demonstrates requirements are satisfied.

| Identifier | Test Condition / Input[cite: 11] | Observable Expected Result |
|---|---|---|
| **AC-AUTH-01** | POST `/api/auth/register` with user "alex", password "SecretPass123" | Status 201 Created; database contains hashed password, not plain text. |
| **AC-AUTH-02** | POST `/api/auth/register` with existing username "alex" | Status 409 Conflict; descriptive JSON error message returned. |
| **AC-AUTH-03** | POST `/api/auth/login` with valid user; query protected `/api/channels` | Returns JWT token; request to `/api/channels` returns HTTP 200 OK. |
| **AC-AUTH-04** | GET `/api/channels` with missing token or expired credentials | Returns HTTP 401 Unauthorized; zero channel records leaked. |
| **AC-DM-01** | User A sends direct message to User B while both are actively connected | Message renders in User B socket feed in < 200 ms; persisted in database. |
| **AC-DM-02** | User A sends message to offline User B and User B connects 1 minute later | Message stored in DB; User B logs in and loads history; message appears in order. |
| **AC-GRP-01** | User A creates channel "#general"; User B queries list and joins | Channel record created; User B joins; membership table links both user IDs. |
| **AC-GRP-02** | User A sends message in "#general"; User C is not a member | Users A and B receive socket event; User C client receives zero packets. |
| **AC-INP-01** | User submits message containing 2,001 characters | Status 400 Bad Request; message is rejected and not broadcast or saved. |
| **AC-LOAD-01** | 50 clients connect simultaneously and send 20 messages/sec for 60 seconds | 100% of messages delivered; zero socket errors; latency under 500 ms. |
| **AC-DEPLOY-01** | Fresh clone; execute command: `docker compose up --build` | All containers exit status 0 / running; app accessible at localhost in < 120s. |

---

## 5. Assumptions, Ambiguities, and Unresolved Questions

Requirements engineering requires documenting what is known versus what requires ongoing clarification.

### 5.1 Documented Engineering Assumptions
1. **UTF-8 Plain Text Communication:** The system assumes text-only communication limited to UTF-8 strings up to 2,000 characters, as the client requested core messaging without specifying rich file storage.
2. **Voluntary Channel Membership:** It is assumed that all registered users are allowed to discover and join open public group channels without prior approval from administrators unless private channels are requested in future iterations.
3. **Single-Node Deployment Boundary:** The deployment environment is assumed to be a single host system running Docker Compose, removing the need for distributed message brokers like Redis Pub/Sub or Kafka in this release.
4. **Permanent Account Storage:** It is assumed that user accounts remain permanently active during the evaluation period without requiring automated expiration.

### 5.2 Ambiguities and Unresolved Stakeholder Questions
The original scenario leaves several business requirements open. The following items represent genuine ambiguities that require formal stakeholder clarification rather than manufactured assumptions]:

* **Question 1 (Channel Access Control):** Does the client require private, invite-only group channels in addition to open public channels, or should all created channels remain open for any registered user to join?
* **Question 2 (Account Lifecycle):** Does the client require user account deactivation, password reset mechanisms, or profile deletion, or is account registration strictly permanent for this evaluation prototype?
* **Question 3 (Message Modification and Deletion):** Should users have the capability to edit or delete their sent messages, or must conversation logs remain immutable audit records?
* **Question 4 (Channel Moderation Controls):** Should channel creators possess administrative powers to kick or ban abusive members from a group channel, or is membership purely self-directed?
* **Question 5 (Message Retention Limits):** Does the client require automatic message expiration (time-to-live) after a designated duration, or should historical messages be retained indefinitely?

---

## 6. Traceability Matrix

Every requirement in this specification traces directly to the approved Statement of Work, course constraints, or foundational architectural decisions:

| Requirement ID | Requirement Summary | Traceability Source / Rationale |
|---|---|---|
| **FR-01** | User Account Registration | SoW Objective 1 (Secure Access and Identity); Stakeholder Need. |
| **FR-02** | Credential Hashing and Token Auth | SoW Objective 1; In-Scope Capability (Authentication). |
| **FR-03** | Explicit Session Termination (Logout) | SoW Objective 1; Stakeholder Need (Access Revocation). |
| **FR-04** | Protected Route Authorization | SoW Objective 1; Constraint (Data Privacy and Isolation). |
| **FR-05** | Send Direct Private Message | Client Scenario; SoW Objective 2 (Direct Messaging). |
| **FR-06** | Real-Time Direct Delivery via WebSocket | SoW Objective 2; Stakeholder Need (Immediate Communication). |
| **FR-07** | Direct Message Persistence | SoW Objective 2; In-Scope Capability (Relational Storage). |
| **FR-08** | Chronological Direct History Retrieval | SoW Objective 2; Stakeholder Need (Conversation Continuity). |
| **FR-09** | Group Channel Creation | Client Scenario; SoW Objective 3 (Group Collaboration). |
| **FR-10** | Channel Discovery and Joining | SoW Objective 3; In-Scope Capability (Group Roster). |
| **FR-11** | Channel Message Broadcast | Client Scenario; SoW Objective 3; Stakeholder Need. |
| **FR-12** | Channel Access and Event Isolation | SoW Scope Boundary (Defensible Security Boundary). |
| **FR-13** | Channel History Persistence | SoW Objective 3; In-Scope Capability (Message Archive). |
| **FR-14** | Message Length Constraint (2,000 chars) | SoW Assumption A4; Boundary Constraint (Prevent Buffer Abuse). |
| **FR-15** | Connection Status UI Feedback | SoW Section 3.1; Stakeholder Need (Network Awareness). |
| **FR-16** | Dynamic DOM Chat Updates | SoW Objective 4; In-Scope Capability (Web UI Client). |
| **NFR-01** | Delivery Latency Under 500 ms | SoW Assumption A2; Performance Quality Expectation. |
| **NFR-02** | 50 Concurrent Connections Target | SoW Assumption A2; Scalability Quality Expectation. |
| **NFR-03** | Bcrypt / Argon2 Password Encryption | SoW Section 3.1; Security Baseline Constraint. |
| **NFR-04** | Route Protection and XSS Sanitization | SoW Section 3.1; Defensive Engineering Decision. |
| **NFR-05** | Automatic Reconnection with Backoff | SoW Risk Mitigation; Reliability Quality Expectation. |
| **NFR-06** | Single-Command Docker Deployment | SoW Objective 4; Deliverable D7; Evaluator Constraint. |
| **NFR-07** | 80% Minimum Test Code Coverage | SoW Objective 4; Deliverable D6; Quality Assurance. |
| **NFR-08** | Evergreen Desktop Browser Support | SoW Assumption A3; Compatibility Quality Expectation. |

---

## 7. Delivery Constraints and Approvals

### 7.1 Delivery Constraints
In strict alignment with the Statement of Work, all implementation and verification activities derived from these requirements must culminate in a final product delivery no later than **November 2, 2026**.

The primary submission artifact for this assignment is this file, committed to version control under the path `docs/requirements.md`.

### 7.2 Sign-Off and Approvals

| Role | Name | Signature / Approval | Date |
|---|---|---|---|
| **Lead Software Engineer** | Amar Sambe | [Submitted] | October 12, 2026 |
| **Course Instructor / Evaluator** | Nick Stiffler | [Pending Review] | October 12, 2026 |
