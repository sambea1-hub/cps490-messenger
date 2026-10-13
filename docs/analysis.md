# Architectural Diagrams and Analysis Document

## Messenger: Real-Time Private and Group Communication Platform

> **Document status:** Final 
> **Course:** CPS 490: Capstone I (Fall 2026) 
> **Assignment:** IA 04: Messenger: Diagrams and Analysis 
> **Author:** Amar Sambe 
> **Assigned date:** September 30, 2026 
> **Due date:** October 12, 2026 
> **Submission:** GitHub 
> **Required repository paths:** 
> - `docs/analysis.md` 
> - `docs/diagrams/data-flow.puml` 
> - `docs/diagrams/sequence.puml` 
> **Version:** 1.0 
> **Last updated:** October 12, 2026 

---

## 1. Introduction and Modeling Purpose

Software modeling provides distinct, complementary perspectives on system architecture. Models are effective when they answer specific engineering questions rather than merely restating code structures.

This document accompanies two architectural models for the Messenger communication platform:
1. **Data Flow Diagram (Level 1 DFD):** Models information transformation, data boundaries, and persistence stores.
2. **Sequence Diagram:** Models temporal ordering, component responsibilities, real-time routing, and failure paths.

Both models maintain strict consistency with the project Statement of Work (`docs/statement-of-work.md`) and Requirements Engineering specification (`docs/requirements.md`).

---

## 2. Model 1: Data Flow Diagram (DFD Level 1)

### 2.1 Authoritative Diagram Source
The authoritative source for this diagram is maintained in version control at `docs/diagrams/data-flow.puml`.

### 2.2 Engineering Question the DFD Answers
The Data Flow Diagram is designed to answer the core structural engineering question:

> **Where does information enter the Messenger platform, where does it travel, what processes transform it, and what data must be permanently persisted versus held in ephemeral memory?**

### 2.3 Requirements Directly Represented
The DFD models the following requirements from `docs/requirements.md`:

* **FR-01 (Account Registration) and FR-02 (Credential Verification):** Represented by Process 1.0 and Data Store D1 (Users Store). Registration and login data enter from Unauthenticated Visitors, credentials are verified against stored hashes, and session tokens are generated.
* **FR-04 (Route Authorization):** Represented by cross-process validation flows from Process 2.0, Process 3.0, and Process 4.0 into Process 1.0 to verify token validity before executing business logic.
* **FR-06 and FR-07 (Direct Message Real-Time Delivery and Persistence):** Represented by Process 2.0 writing message records to Data Store D2 (Direct Messages Store) while concurrently querying the in-memory WebSocket Connection Hub to route packets to the Recipient.
* **FR-08 (Direct Conversation Retrieval):** Represented by the read flow from Data Store D2 through Process 2.0 back to the Recipient.
* **FR-09, FR-10, and FR-12 (Channel Management and Access Isolation):** Represented by Process 3.0 updating and querying Data Store D3 (Channels and Memberships Store).
* **FR-11 and FR-13 (Channel Broadcast and Archive Persistence):** Represented by Process 4.0 validating sender membership via Store D3, persisting text in Store D4 (Channel Messages Store), and pushing broadcast events to active members via the WebSocket Connection Hub.

### 2.4 Substantive Design Responsibilities and Dependencies Made Visible
The DFD makes several critical design realities visible:

1. **Clear Separation Between Persistent Storage and In-Memory Session State:**
   The diagram reveals that a relational database cannot efficiently handle real-time socket delivery on its own. While Data Stores D1 through D4 persist state to disk, active socket routing requires an ephemeral in-memory registry (`Active WebSocket Connection Hub`). This hub maintains active connection handles mapped to user IDs, allowing processes to look up target sockets without polling the database.
2. **Centralized Authentication Dependency:**
   Processes 2.0, 3.0, and 4.0 have a strict upstream dependency on Process 1.0 (or shared auth middleware). No messaging or channel transaction can occur without first transforming a raw session token into a verified user identity.
3. **Decoupled Messaging Paths:**
   Direct messaging (Process 2.0) and group messaging (Process 4.0) maintain completely isolated persistence stores (D2 versus D4) and routing logic. This prevents table locking contentions between high-volume group channels and private conversations.

### 2.5 Ambiguities and Missing Requirements Discovered During Modeling
While constructing the DFD, the following architectural gaps were uncovered:

* **Discovery: Ephemeral Socket Disconnect Lifecycle:**
  The original requirements specified that messages are delivered in real time if the user is connected (FR-05, FR-06). However, the requirements did not define what process cleans up the `Active WebSocket Connection Hub` when a client abruptly closes their browser tab or suffers network loss.
* **Resolution and Reconciliation:**
  Process 1.0 must explicitly encompass socket session lifecycle management, including heartbeat ping/pong frames. If a heartbeat times out, the hub must unregister the connection handle to prevent failed broadcast attempts.

---

## 3. Model 2: Sequence Diagram

### 3.1 Authoritative Diagram Source
The authoritative source for this diagram is maintained in version control at `docs/diagrams/sequence.puml`.

### 3.2 Engineering Question the Sequence Diagram Answers
The Sequence Diagram is designed to answer the temporal behavioral question:

> **Who communicates with whom, in what sequential order, and what happens when the direct messaging scenario encounters validation errors, expired sessions, or an offline recipient?**

### 3.3 Requirements Directly Represented
The Sequence Diagram models the following requirements from `docs/requirements.md`:

* **FR-04 (Route Authorization):** Explicitly modeled in Phase 2, where an expired or invalid token triggers an HTTP 401 error path before any database write occurs.
* **FR-05 and FR-06 (Send and Real-Time Delivery):** Modeled in Phase 1 and Phase 3, showing the message payload traveling from User Alpha through the Gateway to the WebSocket Hub and appearing on Client Beta without a manual browser reload.
* **FR-07 (Direct Message Persistence):** Modeled in Phase 2, showing the synchronous SQL write to the database (`INSERT INTO direct_messages`) before real-time socket dispatch.
* **FR-08 (Direct Conversation Retrieval):** Modeled in Phase 4, showing User Beta retrieving sorted historical messages from the database upon logging in at a later time.
* **FR-14 (Payload Length Limit):** Modeled in Phase 1, where a message exceeding 2,000 characters is rejected by Client A, preventing unnecessary network traffic.
* **FR-16 (Dynamic DOM Updates) and NFR-01 (Latency Under 500 ms):** Modeled in Phase 3, showing Client B dynamically inserting the incoming payload into the active view in under 200 ms.
* **NFR-04 (Input Sanitization):** Modeled in Phase 3, showing Client B escaping HTML tags before updating the DOM.

### 3.4 Substantive Design Responsibilities and Dependencies Made Visible
The Sequence Diagram highlights several sequential dependencies and engineering responsibilities:

1. **Store-Before-Forward Delivery Guarantee:**
   The sequence model enforces a critical reliability rule: the Gateway writes the message to the database and receives confirmation *before* attempting WebSocket push. If the WebSocket server crashes or the recipient drops offline mid-flight, the message is never lost because it has already been safely persisted to disk.
2. **Client-Side Pre-Validation Responsibility:**
   Enforcing the 2,000-character payload limit (FR-14) on Client A protects the backend from processing oversized payloads, offloading validation work to the client while the server remains the authoritative gatekeeper.
3. **Decoupling Real-Time Push from Message Confirmation:**
   Client A receives confirmation that the message is persisted independently of whether User Beta is currently connected. The sender UI updates to "Sent" as soon as the database write succeeds, preventing client hangs when recipients are offline.

### 3.5 Ambiguities and Missing Requirements Discovered During Modeling
Constructing the sequence model revealed the following behavioral ambiguity:

* **Discovery: Missing Delivered and Read Receipts:**
  The original scenario and requirements only specified sending and receiving messages. Modeling the interaction over time made it apparent that User Alpha has no way to distinguish whether a message was merely saved to the server or actually seen by User Beta.
* **Resolution and Reconciliation:**
  To maintain a clean and defensible boundary without inflating scope into complex multi-state receipt systems (like Discord or WhatsApp), the system explicitly adopts a single observable state: the server sends an acknowledgment once the message is persisted to the database. Read receipts and typing indicators are formally documented as out of scope for this release.

---

## 4. Traceability and Consistency Summary

The models directly align with the system boundaries and quality attributes defined in earlier project artifacts:

| Requirement ID | Summary Statement | Represented in DFD | Represented in Sequence Diagram | Consistency Status |
|---|---|---|---|---|
| **FR-01** | User Registration | Process 1.0; Store D1 | Implicit Precondition | Fully Consistent |
| **FR-02** | Credential Hashing and Auth | Process 1.0; Store D1 | Implicit Precondition | Fully Consistent |
| **FR-04** | Route Token Authorization | Auth validation flows | Phase 2 (401 Error Branch) | Fully Consistent |
| **FR-05** | Send Direct Message | Process 2.0; Sender flow | Phase 1 (Send event) | Fully Consistent |
| **FR-06** | Real-Time Direct Push | Socket Hub to Recipient | Phase 3 (Push to Client B) | Fully Consistent |
| **FR-07** | Direct Message Persistence | Store D2 | Phase 2 (SQL Insert) | Fully Consistent |
| **FR-08** | Chronological History Query | Read flow from Store D2 | Phase 4 (History Retrieval) | Fully Consistent |
| **FR-09** | Channel Creation | Process 3.0; Store D3 | Not modeled (Scoped to DM) | Fully Consistent |
| **FR-11** | Channel Message Broadcast | Process 4.0; Store D4 | Not modeled (Scoped to DM) | Fully Consistent |
| **FR-14** | Max 2,000 Characters | Process 2.0 Boundary | Phase 1 (Length Check Alt) | Fully Consistent |
| **FR-16** | Dynamic DOM Updates | Process 2.0 to Recipient | Phase 3 (DOM Insertion) | Fully Consistent |
| **NFR-01** | Latency Under 500 ms | Real-time push stream | Phase 3 (< 200 ms rendering) | Fully Consistent |
| **NFR-04** | HTML Sanitization / XSS | Client boundary | Phase 3 (Payload sanitization) | Fully Consistent |

Both diagrams and the analysis document adhere strictly to the project schedule, completing all milestone requirements prior to the November 2, 2026 delivery deadline.

---

## 5. Approvals

| Role | Name | Signature / Approval | Date |
|---|---|---|---|
| **Lead Software Engineer** | Amar Sambe | [Submitted] | October 12, 2026 |
| **Course Instructor / Evaluator** | Nick Stiffler | [Pending Review] | October 12, 2026 |
