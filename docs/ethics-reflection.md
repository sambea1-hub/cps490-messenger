# Ethics and Social Impact Reflection

## Messenger: Real-Time Private and Group Communication Platform

> **Document status:** Final 
> **Course:** CPS 490: Capstone I (Fall 2026) 
> **Assignment:** IA 05: Messenger: Ethics Reflection 
> **Author:** Amar Sambe 
> **Assigned date:** September 30, 2026 
> **Due date:** October 12, 2026 
> **Submission:** GitHub 
> **Required repository path:** `docs/ethics-reflection.md` 
> **Version:** 1.0 
> **Last updated:** October 12, 2026 

---

## 1. Purpose and System Overview

Engineering decisions have consequences that extend well beyond whether software compiles and functions correctly. Every technical decision regarding data persistence, network transmission, user identity, and interface layout directly influences the security, welfare, and social dynamics of the individuals who interact with the system.

The Messenger project is an independent, self-hosted communication platform designed to provide authenticated direct messaging and multi-user group channels. The client intentionally supplied an incomplete specification, requiring deliberate software engineering choices to bound the system. This reflection analyzes the broader impacts of Messenger across eight societal dimensions, connects identified risks to concrete engineering requirements, and documents responsible AI collaboration practices.

---

## 2. Design Impact Analysis

### 2.1 Cultural Impact
* **Positive Impact:** Messenger enables decentralized sub-communities, technical project teams, and localized organizations to establish their own communication norms without being subjected to commercial platform algorithms or corporate content curation.
* **Negative Impact:** Isolated group channels can foster insular communication silos where exclusionary subcultures, toxic communication patterns, or harmful groupthink develop without visibility or intervention.
* **Mitigation:** The system designates channel creators as channel administrators with the authority to establish community norms, manage participant rosters, and moderate channel access.

### 2.2 Economic Impact
* **Positive Impact:** By delivering a self-hosted, open-source communication utility, Messenger eliminates recurring commercial SaaS licensing costs (such as Slack or Discord premium subscriptions) for student teams, non-profits, and resource-constrained organizations.
* **Negative Impact:** Operating self-hosted infrastructure shifts hardware, power, network bandwidth, and maintenance costs onto the deploying host or organization.
* **Mitigation:** The architecture enforces a lightweight, containerized footprint using Docker Compose with minimal CPU and RAM resource requirements, allowing the stack to run efficiently on low-cost virtual machines or commodity hardware.

### 2.3 Environmental Impact
* **Positive Impact:** Messenger deliberately excludes resource-heavy features such as continuous video streaming, WebRTC voice channels, and large media hosting. By restricting messaging strictly to UTF-8 text payloads, the system minimizes data transmission volume, reducing network energy consumption and data center storage demands.
* **Negative Impact:** Poorly designed backend socket loops, continuous polling, or unoptimized database queries could cause excessive server CPU cycles and power waste under continuous client connections.
* **Mitigation:** The system implements an event-driven WebSocket gateway rather than rapid HTTP polling, ensuring compute cycles and energy are consumed only when active messages are transmitted.

### 2.4 Global Impact
* **Positive Impact:** The self-hosted architecture provides complete data sovereignty. Organizations in international jurisdictions can deploy Messenger locally to comply with regional data protection standards without transmitting internal records across foreign commercial cloud services. Standard UTF-8 encoding ensures full support for international character sets.
* **Negative Impact:** Without distributed multi-region edge servers, international users geographically distant from the single deployment host will experience increased network latency, potentially leading to connection timeouts.
* **Mitigation:** Message payloads are minimized by stripping metadata overhead, ensuring small packet sizes that transmit reliably even over high-latency cross-border network connections.

### 2.5 Public Health
* **Positive Impact:** The system explicitly avoids attention-capturing engagement algorithms, endless content feeds, user streak mechanics, and invasive push notifications that contribute to compulsive screen time, insomnia, and digital fatigue.
* **Negative Impact:** The availability of real-time communication tools can blur the boundaries between work and personal rest, creating peer pressure to remain continuously available and responsive at all hours.
* **Mitigation:** Messenger provides explicit session termination controls (FR-03) and displays transparent connection state indicators (FR-15), allowing users to disconnect cleanly without background tracking.

### 2.6 Public Safety
* **Positive Impact:** Salting and hashing passwords with cryptographic algorithms (bcrypt or Argon2) protects user credentials against credential harvesting and database compromise, defending user safety across shared environments.
* **Negative Impact:** If input sanitization fails, malicious actors could exploit the real-time broadcast engine to execute Cross-Site Scripting (XSS) attacks, hijack user sessions, or distribute malicious scripts to every connected member in a channel.
* **Mitigation:** All incoming message bodies undergo strict server-side validation and client-side HTML entity escaping prior to DOM rendering (NFR-04), neutralising embedded executable script tags.

### 2.7 Public Welfare
* **Positive Impact:** Providing an accessible, zero-cost communication platform empowers community organizations and academic groups with an auditable collaboration tool, democratizing digital access for groups unable to afford commercial enterprise tools.
* **Negative Impact:** If the user interface is built without accessibility standards, individuals relying on assistive technology (such as screen readers or keyboard navigation) could be excluded from participating.
* **Mitigation:** The single-page web client uses semantic HTML elements, high-contrast visual status indicators, and keyboard-navigable input forms.

### 2.8 Social Impact
* **Positive Impact:** Facilitates structured group collaboration and reliable one-to-one dialogue for academic and small-team workflows, strengthening interpersonal teamwork through focused discussion channels.
* **Negative Impact:** Private messaging channels can become avenues for targeted harassment, bullying, or interpersonal abuse without easy recourse for the recipient.
* **Mitigation:** Group channels maintain strict membership rosters and channel access isolation (FR-12), and the system architecture supports future enhancements for blocking or reporting abusive accounts.

---

## 3. Connect Ethics to Engineering

This section connects two significant negative impacts to concrete engineering requirements, constraints, and verification procedures.

### 3.1 Ethical Consequence 1: Session Hijacking and Client Exploitation via Injected Scripts (Public Safety)
* **Affected Stakeholders:** All registered members receiving private or group messages within the platform.
* **Potential Harm:** A malicious actor sends a crafted text payload containing embedded JavaScript (such as `<script>stealToken()</script>`). If the client application injects this payload directly into the active conversation pane without sanitization, the script executes inside the browsers of all recipients. This can result in session token theft, private message exfiltration, and unauthorized actions performed on behalf of victim accounts.
* **Realistic Engineering Mitigation:** Enforce strict input validation boundaries and mandatory HTML entity escaping across both client and server tiers. All message bodies must be treated as untrusted text rather than executable markup.
* **Engineering Connection and Requirements:**
  * **Requirement NFR-04:** Explicitly mandates HTML entity escaping and route authorization, ensuring that script tags render purely as visible text characters rather than executable DOM nodes.
  * **Requirement FR-14:** Enforces a hard constraint limiting message payloads to 2,000 characters, reducing the attack surface for complex payload injection.
  * **Acceptance Criterion AC-INP-01:** Verifies that oversized or malformed payloads return HTTP 400 Bad Request and are rejected before entering database storage.
  * **Verification Test:** An automated security test injects HTML script tags into a direct message payload and verifies that the recipient DOM contains escaped entity text (`&lt;script&gt;`) with zero script execution.

### 3.2 Ethical Consequence 2: Unauthorized Eavesdropping and Channel Privacy Violation (Social and Cultural Welfare)
* **Affected Stakeholders:** Channel administrators and registered group members participating in focused team channels.
* **Potential Harm:** In collaborative team environments, group channels are used to share sensitive project details, academic work, and internal planning. If the WebSocket routing engine broadcasts messages indiscriminately to all connected sockets, non-member clients could listen to private channel traffic, resulting in severe privacy violations, intellectual property leaks, and broken organizational trust.
* **Realistic Engineering Mitigation:** Implement server-side membership verification on every message broadcast. The WebSocket connection hub must query channel membership rosters before dispatching frames, ensuring that network packets are routed exclusively to verified active channel members.
* **Engineering Connection and Requirements:**
  * **Requirement FR-11:** Mandates that channel messages are broadcast strictly to active members of that specific channel.
  * **Requirement FR-12:** Enforces complete channel isolation, obligating the server to ensure non-members receive zero socket frames, event notifications, or message data.
  * **Acceptance Criterion AC-GRP-02:** An automated integration test logs in three clients (Alpha, Beta, and Gamma), adds Alpha and Beta to Channel X, and posts a message from Alpha. The test verifies that Beta receives the message while Gamma receives zero socket packets.
  * **Design Decision:** Modeled directly in the Data Flow Diagram (Process 4.0 querying Data Store D3 for membership verification before dispatching to the WebSocket Hub) and the Sequence Diagram.

---

## 4. Summary of Ethical Constraints in Design

| Ethical Dimension | Identified Risk | Engineering Response | Traceable Artifact |
|---|---|---|---|
| **Public Safety** | XSS and token theft via malicious payloads | Entity escaping and 2,000 char length limit | NFR-04, FR-14, AC-INP-01 |
| **Social / Privacy** | Unauthorized channel eavesdropping | Server-side roster verification on socket dispatch | FR-11, FR-12, AC-GRP-02 |
| **Public Health** | Continuous availability and compulsive use | Explicit logout and zero invasive tracking | FR-03, FR-15 |
| **Environmental** | Compute cycle and server energy waste | Event-driven WebSocket push over HTTP polling | NFR-01, DFD Socket Hub |
| **Public Welfare** | Financial and deployment barrier | Docker Compose single-command orchestration | NFR-06, AC-DEPLOY-01 |

---

## AI-Assisted Work

### Overview of Assistance
During the completion of the Messenger assignment sequence (Statement of Work, Requirements Engineering, Diagrams and Analysis, and Ethics Reflection), I used Google Gemini as an engineering assistant. I brainstormed the initial project boundaries, identified all required functional capabilities (authentication, one-to-one messaging, group channels), drafted the core technical concepts, and defined the scope exclusions.

I then used Gemini to assist with:
* Expanding my drafted concepts into structured, professional Markdown documentation.
* Generating the PlantUML diagram source code for the Level 1 Data Flow Diagram (`docs/diagrams/data-flow.puml`) and the Direct Message Sequence Diagram (`docs/diagrams/sequence.puml`) based on my architectural specifications.
* Formatting requirements and acceptance criteria into structured traceability tables.

### Meaningful Human Review and Revision
During the requirements and diagramming phases, Gemini initially proposed adding commercial Discord-style features, including typing indicators, read receipts, voice channel WebRTC connections, and a distributed Apache Kafka message queue.

Because I had established a strict delivery constraint of November 2, 2026 in the Statement of Work, I recognized that these suggestions represented significant scope creep that would jeopardize individual project completion. I conducted a thorough human review, rejected all proposed voice, attachment, and distributed clustering recommendations, and instructed the tool to adhere strictly to my bounded scope of text-only messaging on a single-host Docker Compose deployment.

### Verification and Incorporation Process
I verified all generated artifacts through the following manual engineering checks:
1. **Requirement Identifier Validation:** I audited every identifier (`FR-01` through `FR-16`, `NFR-01` through `NFR-08`, and `AC-xx`) across the Statement of Work, Requirements document, and Diagrams analysis to confirm 100% bidirectional traceability.
2. **PlantUML Syntax and Logic Verification:** I reviewed the generated `.puml` files to ensure they modeled valid data store separations and alternative failure branches (such as authentication failure and offline recipient handling) rather than happy-path-only sequences.
3. **Repository Path and Quality Verification:** I verified that all documents complied with the required directory structure (`docs/statement-of-work.md`, `docs/requirements.md`, `docs/analysis.md`, `docs/diagrams/`, and `docs/ethics-reflection.md`) and verified that formatting remained consistent throughout the Git commit history.

---

## 5. Approvals

| Role | Name | Signature / Approval | Date |
|---|---|---|---|
| **Lead Software Engineer** | Amar Sambe | [Submitted] | October 12, 2026 |
| **Course Instructor / Evaluator** | Nick Stiffler | [Pending Review] | October 12, 2026 |
