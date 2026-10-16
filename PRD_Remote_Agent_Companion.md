# Product Requirements Document (PRD)

# Remote Agent Companion — Android ↔ Rust/Tauri 2 Desktop

| Field | Value |
|---|---|
| Document version | 1.0 |
| Status | Draft — Ready for Technical Review |
| Date | 2026-10-16 |
| Target platforms | Windows desktop (Rust + Tauri 2), Android (Kotlin + Jetpack Compose), cloud relay (Rust) |
| Feature | Keep agents moving from anywhere |
| Product approach | Local-first agent execution; secure remote control via relay |

> **Purpose:** Enable users to securely monitor and control AI coding agents running on their PC from an Android phone over the internet, even when the phone and PC are on different networks. The PC remains responsible for running all agents; a VPS routes encrypted traffic and does not execute agents.

---

## 1. Executive Summary

The Remote Agent Companion extends the existing Rust + Tauri 2 desktop application with an Android companion application. A user can pair an Android device with one or more PCs using a QR code, view active sessions, stream agent output, send follow-up prompts, approve or reject agent requests, interrupt tasks, and receive notifications about important agent events.

The experience must work remotely through mobile data or any Wi-Fi network without exposing a desktop inbound port to the public internet. Both desktop and Android establish outbound secure WebSocket (WSS) connections to a Rust cloud relay. The relay handles device/host routing and presence, while an authenticated end-to-end encrypted (E2EE) channel protects agent content from the relay.

### 1.1 Problem

- Users must currently remain at their PC to follow agent progress or respond to prompts/approvals.
- Long-running coding agents may stall while waiting for input.
- Remote desktop applications are cumbersome and provide overly broad access.
- Mobile and desktop are frequently on different networks, often behind NAT/CGNAT.

### 1.2 Product Vision

**Continue agent workflows from anywhere, without remotely exposing the entire computer.**

### 1.3 Goals

1. Enable secure remote connectivity across different networks.
2. Pair Android and desktop using an understandable, revocable device authorization flow.
3. Provide real-time visibility into PC agent/session states.
4. Allow scoped, authorized remote commands without spawning duplicate agent sessions.
5. Maintain agent execution through Android disconnects.
6. Support reliable resync, error handling, and notifications.
7. Preserve a clear path from Tauri-embedded host to a headless Rust host service.

### 1.4 Non-goals (Initial Release)

- Running AI models or coding-agent CLIs on Android or the relay.
- Remote desktop/screen capture or unrestricted file-system browsing.
- Sharing a host across multiple user accounts or multi-tenant billing.
- General-purpose SSH access or arbitrary shell execution by default.
- Replacing the existing desktop app's session/runtime management.
- Supporting iOS in the first release.
- Zero-downtime host execution while the PC is powered off, sleeping, or disconnected.

---

## 2. Personas and Primary Use Cases

### Persona A — Developer on the move

A developer launches Codex, Claude Code, or OpenCode on a Windows PC, then leaves the desk. They want to read progress and reply to the running session from their Android phone.

### Persona B — Developer managing multiple agents

A developer has multiple concurrent projects and agents. They need to identify sessions that are running, finished, failed, or awaiting approval.

### Core User Stories

| ID | Story | Priority |
|---|---|---|
| US-01 | As a user, I can enable remote access for my desktop host. | P0 |
| US-02 | As a user, I can securely pair my Android phone by scanning a QR code and confirming on the PC. | P0 |
| US-03 | As a user, I can view whether a paired PC is online or offline. | P0 |
| US-04 | As a user, I can list agents and sessions on the paired PC. | P0 |
| US-05 | As a user, I can inspect recent session output and stream new output. | P0 |
| US-06 | As a user, I can submit a follow-up prompt to an existing session. | P0 |
| US-07 | As a user, I can approve or reject a pending agent action with its exact details visible. | P0 |
| US-08 | As a user, I can reconnect and recover session state after losing network connectivity. | P0 |
| US-09 | As a user, I can revoke a lost or untrusted mobile device from the desktop. | P0 |
| US-10 | As a user, I can receive a notification when an agent needs attention or finishes. | P1 |
| US-11 | As a user, I can create a new session remotely for an allowed workspace/agent. | P1 |
| US-12 | As a user, I can connect one mobile device to multiple hosts. | P1 |
| US-13 | As a user, I can view and manage access scopes for each paired device. | P1 |
| US-14 | As a user, I can keep host access available after closing the desktop window using an optional headless service. | P2 |

---

## 3. Scope and Release Strategy

### MVP (P0)

- Tauri Settings: enable/disable remote connection, host identity, connection health.
- Rust relay with authenticated outbound host and mobile WSS channels.
- QR-based, expiring, one-time pairing with desktop approval.
- Persistent device identity and device revocation.
- Authenticated E2EE between host and phone, with tested interoperability.
- Host listing and status/presence.
- Existing session list and detail screen.
- Live agent status, terminal/output streaming, follow-up prompts.
- Approve/reject and interrupt for supported agent adapters.
- Reconnection, event catch-up/resync, RPC validation, and audit trail.

### V1 (P1)

- Firebase Cloud Messaging notifications (minimal-content push payloads).
- Start new session from Android for allowlisted workspace/agent combinations.
- Multiple paired hosts, device permission configuration, improved terminal viewer.
- Metrics, health probes, and operational monitoring.

### Later (P2)

- Headless Windows host independent of the Tauri UI process.
- Optional direct LAN/Tailscale optimization with relay fallback.
- iOS/Kotlin Multiplatform support.
- Horizontal relay scaling, account/team-based host sharing, user preferences sync.

---

## 4. Architecture and Ownership

```text
Android App (Kotlin, Compose)
  ├─ Device identity / secure local storage
  ├─ Relay WSS client + reconnect / E2EE
  ├─ RPC client + event subscriptions
  └─ Sessions / Terminal / Approvals / Notifications
            │ outbound WSS :443
            ▼
Cloud Relay on VPS (Rust, Tokio, Axum)
  ├─ Host/device authentication and routing authorization
  ├─ Host presence + connection registry
  ├─ One-time pairing invitation coordination
  ├─ Rate limits, revocation checks, routing & observability
  └─ Encrypted payload forwarding (no agent plaintext)
            ▲ outbound WSS :443
            │
PC Host (Rust + Tauri 2)
  ├─ Relay client + reconnection + E2EE endpoint
  ├─ Device registry / authorization / RPC dispatcher
  ├─ Shared agent session manager (single source of truth)
  ├─ Agent adapters (Codex / Claude Code / OpenCode)
  ├─ PTY / event bus / event history / SQLite
  └─ Tauri frontend (shares the same session manager)
```

### 4.1 Core Design Decisions

- **Host is the source of truth** for session lifecycle, workspaces, and agent outputs.
- **Relay is a transport and access-routing service, not an execution engine.**
- **Both clients connect outbound**, requiring no desktop port-forwarding.
- **Every mobile RPC is authenticated and authorized at the host**, even if relay already accepted routing.
- **Desktop UI and mobile RPC share the same runtime**, rather than creating a second agent process.
- **No remote plaintext agent traffic is stored in relay logs**; E2EE covers RPC payloads.
- **E2EE does not hide metadata** such as host/device association, connection time, and traffic volume.

### 4.2 Rust Workspace (Proposed)

```text
crates/
  agent-core/          # Session lifecycle, event bus
  agent-adapters/      # Agent-specific APIs and approval interfaces
  terminal-core/       # PTY ownership and stream handling
  remote-protocol/     # Versioned RPC and event schemas
  remote-crypto/       # Reviewed interoperable secure channel
  remote-host/         # WSS client, pairing, RPC dispatch
  remote-relay/        # Axum relay service
  remote-storage/      # SQLite and device/session metadata
apps/
  desktop/             # Existing Tauri 2 desktop app
  android/             # Native Kotlin/Compose companion
```

**Implementation rule:** Do not restructure working agent internals solely for architectural purity. Introduce a small, testable interface around existing agent session management and migrate incrementally.

---

## 5. Functional Requirements

### 5.1 Desktop Remote Access Settings

| ID | Requirement | Priority | Acceptance criteria |
|---|---|---|---|
| FR-001 | User can explicitly enable/disable remote access. | P0 | Disabled means no relay connection or mobile RPC routing. |
| FR-002 | UI shows relay status, host ID/fingerprint, and last connected time. | P0 | Status changes reflect healthy, reconnecting, offline, and disabled states. |
| FR-003 | User can generate an expiring QR invitation. | P0 | Invitation expires automatically and cannot be reused. |
| FR-004 | User must approve each newly paired device. | P0 | Unknown mobile never receives persistent access before approval. |
| FR-005 | User can list and revoke devices. | P0 | Revocation blocks active and future commands promptly. |
| FR-006 | User can inspect permission scopes by device. | P1 | Read / Execute / Approve / Terminal are separately enforced. |

### 5.2 Host / Device Presence

| ID | Requirement | Priority | Acceptance criteria |
|---|---|---|---|
| FR-010 | Android lists paired hosts and their current state. | P0 | Online/offline based on authenticated heartbeat and TTL; stale state clearly marked. |
| FR-011 | Host reconnects automatically when internet resumes. | P0 | Backoff with jitter, bounded retries, and no uncontrolled retry storm. |
| FR-012 | Android supports reauth and reconnect. | P0 | Existing valid pairing survives app restart and temporary network changes. |

### 5.3 Agent Session Visibility

| ID | Requirement | Priority | Acceptance criteria |
|---|---|---|---|
| FR-020 | Android can list active/recent sessions. | P0 | Session ID, agent type, workspace, activity state, last activity displayed. |
| FR-021 | Android displays per-session recent output and live updates. | P0 | Ordered stream, bounded memory, pause/autoscroll, reconnect recovery. |
| FR-022 | Android can send a prompt to an existing session. | P0 | Prompt reaches original agent session; no duplicate agent created. |
| FR-023 | Android can interrupt an agent when supported. | P0 | Interrupt targets the selected session and reports success/failure. |
| FR-024 | Android can approve/reject pending actions. | P0 | Exact command/tool name, target, risk context, and expiry/status shown. |
| FR-025 | Android can create sessions within allowed workspaces. | P1 | Path is selected from a host allowlist; arbitrary path input rejected. |
| FR-026 | Android can display unsupported agent capabilities. | P0 | UI hides/disables actions unsupported by the adapter. |

### 5.4 Notification and Audit

| ID | Requirement | Priority | Acceptance criteria |
|---|---|---|---|
| FR-030 | Push user when agent needs approval or completes. | P1 | Opening notification performs authenticated fetch; push contains no sensitive output. |
| FR-031 | Host records security-relevant actions locally. | P0 | Device, time, method, target, outcome available; secrets redacted. |
| FR-032 | User can revoke all mobile access immediately. | P0 | Active device connections rejected and stored access revoked. |

---

## 6. Primary UX Flows

### 6.1 First-time Pairing

1. User opens desktop **Settings → Mobile Access → Enable**.
2. Desktop establishes an authenticated outbound WSS connection to the relay.
3. User selects **Pair New Device**; host creates a 2-minute one-time invitation.
4. Tauri displays a QR containing protocol version, relay URL, host identity fingerprint, invitation ID, nonce, and expiration.
5. Android opens **Add PC → Scan QR** and validates QR shape, freshness, and relay policy.
6. Android creates a device signing identity in Android Keystore and initiates an authenticated pairing exchange through the relay.
7. Desktop and Android display matching short authentication codes; desktop shows the requesting device identifier.
8. User confirms on desktop. Both endpoints bind device identity to the host and establish a persistent authorization record.
9. Android opens its encrypted, authenticated RPC session and loads host status.

**Failure cases:** expired/replayed invitation, wrong host fingerprint, mismatched verification codes, user rejection, offline host, invalid proof, duplicate key, cryptographic negotiation mismatch. All failures deny pairing by default.

### 6.2 Observe and Continue Agent

1. User opens Android on another network.
2. App authenticates to relay and establishes an E2EE tunnel to the selected host.
3. App fetches `session.list`; user selects an existing session.
4. App obtains current snapshot, subscribes to events, and starts streaming.
5. User sends `agent.sendPrompt` with an idempotency key.
6. Host validates device scope, session state, and adapter capability, then forwards prompt to **the same session**.
7. Host responds `accepted` with command ID; progress/terminal events follow asynchronously.

### 6.3 Approval Flow

1. Agent requests permission to execute a particular action.
2. Host produces a pending approval object with a unique request ID, precise action details, target, session, and expiry.
3. Android shows the pending action and user selects Approve or Reject.
4. Host authenticates authorization (`Approve` scope), verifies that request is still pending, and applies an atomic state transition.
5. Host returns the final approval result; duplicate or stale responses do not re-execute the action.

### 6.4 Disconnect / Resume

1. Android stores the last applied event sequence per session.
2. On reconnect, Android reauthenticates and reestablishes fresh secure-session keys.
3. Android requests `session.resume(lastSequence)`.
4. Host replays retained events or signals `resync_required` and provides a fresh snapshot.
5. UI reconciles state without resubmitting any command unless it can safely retry using the same idempotency key.

---

## 7. WebSocket and RPC Contract

### 7.1 Transport Endpoints (Proposed)

- `wss://relay.example.com/v1/host/connect`
- `wss://relay.example.com/v1/mobile/connect`

All public connections use valid TLS. Do not expose an unauthenticated port on the user PC.

### 7.2 Framing

**Outer envelope (relay can inspect routing only):**

```json
{
  "v": 1,
  "type": "route.data",
  "connectionId": "conn_123",
  "payload": "BASE64URL_E2EE_CIPHERTEXT"
}
```

**Inner encrypted RPC request (after host decryption):**

```json
{
  "v": 1,
  "id": "req_1001",
  "type": "request",
  "method": "agent.sendPrompt",
  "params": {
    "sessionId": "session_abc",
    "prompt": "Continue fixing authentication tests"
  },
  "idempotencyKey": "cmd_48df"
}
```

**Response:**

```json
{
  "v": 1,
  "id": "req_1001",
  "type": "response",
  "result": {
    "commandId": "cmd_48df",
    "accepted": true
  }
}
```

`accepted=true` confirms host-side acceptance, **not completion of agent work**. Completion is reported as a separate event.

**Event:**

```json
{
  "v": 1,
  "type": "event",
  "event": "agent.status",
  "sessionId": "session_abc",
  "sequence": 1025,
  "data": {
    "status": "running"
  }
}
```

### 7.3 RPC Methods

| RPC | Purpose | Scope | Phase |
|---|---|---|---|
| `host.getCapabilities` | Negotiate supported protocol/features | Read | MVP |
| `host.getStatus` | Host connectivity/runtime information | Read | MVP |
| `agent.list` | Available agent types | Read | MVP |
| `session.list` | Enumerate sessions | Read | MVP |
| `session.get` | Obtain session snapshot | Read | MVP |
| `session.resume` | Replay events/resync | Read | MVP |
| `terminal.subscribe` | Receive output stream | Read | MVP |
| `agent.sendPrompt` | Continue selected agent session | Execute | MVP |
| `agent.interrupt` | Interrupt active action | Execute | MVP |
| `agent.approve` | Approve pending action | Approve | MVP |
| `agent.reject` | Reject pending action | Approve | MVP |
| `session.create` | Start allowlisted session | Execute | V1 |
| `workspace.list` | List allowed workspaces | Read | V1 |
| `terminal.input` | Raw terminal input | Terminal | Later, opt-in |

### 7.4 Error Model

Errors must carry stable machine codes, human-readable messages safe to display, and optional retry details. Codes include `UNAUTHENTICATED`, `FORBIDDEN`, `HOST_OFFLINE`, `SESSION_NOT_FOUND`, `UNSUPPORTED_CAPABILITY`, `APPROVAL_EXPIRED`, `CONFLICT`, `RATE_LIMITED`, `RESYNC_REQUIRED`, `PROTOCOL_UNSUPPORTED`, and `INTERNAL_ERROR`.

### 7.5 Protocol Behavior

- Versioned envelope with explicit minimum/maximum compatible versions.
- Request/response correlation using unique `id`.
- Deduplication of side-effect commands using durable `idempotencyKey` storage with bounded retention.
- Monotonically increasing per-session event `sequence` with defined truncation/resync behavior.
- Bounded payload sizes, subscriptions, buffers, and per-device in-flight requests.
- Flow control/backpressure: prioritize approvals/control over high-volume terminal output.
- Distinguish *requested*, *accepted*, *started*, *completed*, *failed*, and *cancelled* states.
- Agent adapters declare capabilities, including whether interrupt and structured approval are supported.
- Avoid assuming one JSON representation is sufficient for all PTY data; support binary terminal frames in later iterations.

---

## 8. Security Requirements and Threat Model

### 8.1 Trust Boundaries

1. **Android device:** untrusted until paired, may be lost or compromised.
2. **VPS relay:** routing infrastructure; must not be trusted with plaintext commands/output.
3. **PC host:** trusted execution endpoint, responsible for enforcement and process authority.
4. **AI agent / shell:** high-risk execution subsystem; requests may affect code, files, credentials, and processes.

### 8.2 Mandatory Controls

| ID | Requirement |
|---|---|
| SEC-01 | TLS 1.3/WSS or modern secure TLS baseline; strict certificate validation. |
| SEC-02 | Per-host and per-device cryptographic identities; no shared API secret baked into APK. |
| SEC-03 | Pairing invitation is one-time, strongly random, expires after ~2 minutes, and requires human desktop approval. |
| SEC-04 | Pairing authenticates both host and mobile key identities; user verifies a matching short authentication code or equivalent authenticated confirmation. |
| SEC-05 | RPC content is protected by authenticated E2EE; relay cannot decrypt prompts or terminal streams. |
| SEC-06 | Use reviewed authenticated key exchange, KDF, AEAD, fresh session keys, anti-replay counters, and session rekey policy. Do not invent a custom cryptographic handshake. |
| SEC-07 | Android private key stored using Android Keystore (hardware-backed where available); desktop secret protected using OS facilities such as Windows DPAPI. |
| SEC-08 | Authorization checked **on host for every RPC method and target**; device grants are least-privilege. |
| SEC-09 | Device revocation invalidates active sessions and subsequent authentications; disable-all switch available. |
| SEC-10 | Strict command allowlist; raw terminal access is disabled by default and separately scoped. |
| SEC-11 | Redact sensitive values from logs; do not send plaintext agent content in push notifications. |
| SEC-12 | Message rate limits, size limits, heartbeats, idle timeouts, and backpressure on relay and host. |
| SEC-13 | Idempotency and replay protections prevent repeated prompt/approval execution. |
| SEC-14 | Security testing of pairing, MITM, stolen QR, lost device, relay compromise, privilege escalation, and duplicate command delivery. |

### 8.3 Cryptographic Design Direction

- Identity signatures: Ed25519 **where supported and interoperable**.
- Key agreement: X25519-based authenticated key exchange, ideally through an audited protocol such as a supported Noise pattern.
- Derivation: HKDF-SHA256; message protection via ChaCha20-Poly1305 or AES-GCM.
- Design review **must** validate handshake pattern, transcript binding, nonce uniqueness, session rekeying, and cross-platform Android Keystore integration before implementation is marked DONE.

**Important:** Algorithm selections are design candidates, not a safe complete protocol by themselves. A reviewed, interoperability-tested implementation is an explicit release gate.

### 8.4 Permission Model

| Scope | Allowed actions |
|---|---|
| `read` | Host presence, session lists, state, authorized output |
| `execute` | Follow-up prompt, interrupt, optionally create session |
| `approve` | Respond to pending tool/permission requests |
| `terminal` | Raw PTY input (advanced; disabled by default) |
| `admin` | Device/security management (desktop-only for MVP) |

New devices default to `read`; user explicitly grants `execute` and/or `approve` during or after pairing. No Android device has `admin` scope in MVP.

---

## 9. Reliability, Background Behavior, and Notifications

### 9.1 Reconnect

- Exponential backoff with jitter, reconnect cap and network-aware retry.
- Heartbeat/ping-pong and server-side TTL distinguish connected versus stale.
- Fresh authenticated/E2EE session upon reconnect.
- Durable idempotency records prevent duplicated side effects after unknown acknowledgement.
- Session events can be replayed from local PC storage, within retention policy.

### 9.2 Android Background Policy

- Foreground: WebSocket for real-time interaction.
- Background: do not rely on indefinite Android WebSocket execution.
- V1: use Firebase Cloud Messaging for minimal-content signals; user opens app to authenticate and fetch actual details.
- Notifications deep-link to a host/session only after device authorization and secure session establishment.

### 9.3 Host Lifecycle

- MVP: remote service lives in Tauri process; minimize-to-tray keeps it running if OS supports it.
- If Tauri is killed or PC sleeps, the host becomes offline and Android shows actionable status.
- P2: independently managed, single-owner Rust host process/service and local IPC with Tauri UI.

---

## 10. Data Model (Logical)

### PC Host (SQLite)

- `host_identity`: host ID, public-key metadata, protected private-key reference.
- `paired_devices`: device ID, public key, friendly name, permissions, created/revoked timestamps.
- `agent_sessions`: session ID, adapter type, workspace ID, state, timestamps.
- `session_events`: session ID, event sequence, event type, retained payload, timestamps.
- `rpc_idempotency`: device ID, idempotency key, command status/result reference, expiry.
- `security_audit`: device ID, action, resource, outcome, timestamp, redacted metadata.

### Relay (SQLite MVP)

- `registered_hosts`: routing ID and verified identity metadata.
- `registered_devices`: verified identity metadata and per-host routing grants.
- `pairing_invitations`: one-time token hash/metadata, expiry, consumption state.
- `revocations`: invalidated device/host grants and relevant timestamps.

**Data minimization:** Do not store prompts, source code, terminal output, or E2EE session keys in relay persistence. Store only the metadata required for routing/security, with retention limits.

---

## 11. Android UI Requirements

| Screen | Minimum contents |
|---|---|
| Onboarding | Product overview, local notification permission when needed, scan QR CTA |
| Pair Host | QR scanner, host verification, pairing state/error, device name |
| Hosts | Paired host list, online/offline, last seen, agent count |
| Host Detail | Available agents, active/recent sessions, host health |
| Session Detail | Agent type, workspace, status, recent output, prompt composer, interrupt |
| Approvals | Exact pending action, requested operation, associated session, approve/reject |
| Settings | Device/host information, disconnect, device grant visibility, diagnostic status |

Design states required for every networked screen: `loading`, `empty`, `online`, `offline`, `reconnecting`, `unauthorized`, `error`, and `stale_data` where applicable.

Accessibility: readable typography, sufficient contrast, screen reader labels, and no approval action requiring a hidden gesture.

---

## 12. Non-Functional Requirements and Initial SLO Targets

These are **design targets to measure**, not guaranteed performance claims.

| Category | Target |
|---|---|
| Availability | Relay service target ≥99.5% monthly availability for initial production |
| Command responsiveness | p95 authenticated host RPC acknowledgement ≤2 seconds under normal connectivity |
| Status freshness | Online host presence detected within ≤15 seconds in normal conditions |
| Event latency | p95 relay-mediated event arrival ≤1.5 seconds on stable networks |
| Reconnect | Resume event view automatically, without duplicate commands, after transient disconnection |
| Data integrity | Event ordering per session; explicit gaps and resync rather than silent loss |
| Scalability | Design for one relay instance initially; load-test configured max hosts/connections before launch |
| Privacy | No plaintext prompt/terminal payload stored or logged by relay |
| Observability | Structured metrics for connection count, latency, disconnects, route errors, pairing failures |
| Compatibility | Protocol version negotiation plus fixtures tested across Rust and Kotlin |

Benchmark targets must be revalidated using actual VPS location, mobile networks, and host load. Do not ship claims of guaranteed low latency without measurements.

---

## 13. Testing and Acceptance Plan

### Unit Tests

- RPC schema/validation and permission mapping.
- Agent adapter capabilities and session state transitions.
- Pairing expiry, single-use behavior, revocation.
- Command deduplication and event ordering.
- Serialization fixtures shared between Rust and Kotlin.

### Integration Tests

- End-to-end pairing over relay with both endpoints authenticated.
- Android can list and continue an already-running PC session.
- Relay cannot decrypt RPC contents.
- Approval race: first valid response wins, later responses rejected.
- Host restart and client reconnect work without stale access grants.
- Relay restart triggers reconnect and state restoration.

### Security Tests

- QR replay, expired invitation, invalid fingerprint, unauthorized device, revoked device.
- Invalid/oversized frames and high-volume terminal output.
- Attempt to bypass method permissions or access session of another host.
- Replay and nonce misuse detection.
- Secure storage behavior on supported Android API levels.

### Device/Network Matrix

- PC on home Wi-Fi and Android on cellular data.
- PC behind CGNAT; no inbound port forwarding.
- Android switches Wi-Fi ↔ cellular during live stream.
- Host sleeps/restarts; correct offline behavior.
- Android is backgrounded/force-stopped; notification and eventual resync behavior.

### MVP Release Gate

MVP is complete only when: paired Android on cellular can securely connect to a PC without inbound router changes, monitor a running agent, submit exactly one follow-up prompt to the original session, handle a permitted approval, recover after reconnect, and lose access immediately after revocation. All mandatory security controls and automated tests must pass.

---

## 14. Phased Implementation Plan and Task Tracker

**Task status definitions:** `WAIT` = not started, `IN_PROGRESS` = active, `BLOCKED` = waiting on dependency, `DONE` = implemented and validated.

Every task begins as `WAIT` and is marked `DONE` only after its acceptance criteria and required tests pass.

| ID | Phase | Task | Priority | Status |
|---|---|---|---|---|
| TASK-001 | 1 — Agent Core | Audit existing Tauri session/PTY and agent adapter architecture | P0 | WAIT |
| TASK-002 | 1 — Agent Core | Expose shared `AgentSessionManager` interface | P0 | WAIT |
| TASK-003 | 1 — Agent Core | Define adapter capabilities and structured approval model | P0 | WAIT |
| TASK-004 | 1 — Agent Core | Add session event sequence and durable history | P0 | WAIT |
| TASK-005 | 2 — Protocol | Define versioned RPC schemas and error model | P0 | WAIT |
| TASK-006 | 2 — Protocol | Add Rust/Kotlin shared serialization fixtures | P0 | WAIT |
| TASK-007 | 2 — Relay | Implement Rust relay routing and authenticated host connection | P0 | WAIT |
| TASK-008 | 2 — Relay | Implement mobile connection, presence and heartbeat | P0 | WAIT |
| TASK-009 | 2 — Relay | Configure WSS reverse proxy and VPS deployment | P0 | WAIT |
| TASK-010 | 3 — Pairing | Build Tauri pairing settings and QR invitation screen | P0 | WAIT |
| TASK-011 | 3 — Pairing | Implement device identity and protected key storage | P0 | WAIT |
| TASK-012 | 3 — Pairing | Implement reviewed cross-platform authenticated E2EE handshake | P0 | WAIT |
| TASK-013 | 3 — Pairing | Implement mutual verification, one-time invite, desktop approval | P0 | WAIT |
| TASK-014 | 3 — Pairing | Implement revocation and default-deny permission checks | P0 | WAIT |
| TASK-015 | 4 — Android | Create Kotlin/Compose shell, DI and navigation | P0 | WAIT |
| TASK-016 | 4 — Android | Build QR scanner, hosts screen and connection indicators | P0 | WAIT |
| TASK-017 | 4 — Android | Implement authenticated WebSocket, reconnection and RPC repository | P0 | WAIT |
| TASK-018 | 4 — Agent Control | Build session list/detail and streamed output | P0 | WAIT |
| TASK-019 | 4 — Agent Control | Implement existing-session follow-up prompts and interrupt | P0 | WAIT |
| TASK-020 | 4 — Agent Control | Implement pending approval UI and safe host-side execution | P0 | WAIT |
| TASK-021 | 5 — Reliability | Implement idempotency, event replay, resync and backpressure | P0 | WAIT |
| TASK-022 | 5 — Quality | Add end-to-end network and security test suite | P0 | WAIT |
| TASK-023 | 5 — Notifications | Integrate FCM signals and deep-link fetch | P1 | WAIT |
| TASK-024 | 5 — Capabilities | Allowlisted remote session creation | P1 | WAIT |
| TASK-025 | 5 — Multi-host | Multiple paired hosts and per-device scopes | P1 | WAIT |
| TASK-026 | 6 — Operations | Add observability, rate limiting, operational runbook | P1 | WAIT |
| TASK-027 | 6 — Security | Threat-model review, penetration testing, remediation | P0 | WAIT |
| TASK-028 | 6 — Host Lifecycle | Extract optional headless Rust host and local IPC | P2 | WAIT |
| TASK-029 | 6 — Production | Version compatibility, migration, installer and rollback validation | P1 | WAIT |

### Dependencies / Critical Path

`TASK-001 → TASK-002/003/004 → TASK-005/006 → TASK-007/008 → TASK-010/011/012/013/014 → TASK-015/016/017 → TASK-018/019/020 → TASK-021/022/027`.

Parallel work is possible on Android UI mocks while relay/crypto contracts are under development. The production E2EE handshake and host authorization must be complete before any remote execution is enabled.

---

## 15. Risks, Mitigations, and Open Decisions

| Risk | Impact | Mitigation |
|---|---|---|
| Agent CLIs have different interaction models | Prompts/approval may be unreliable | Capability-based adapters; never guess terminal input format |
| Custom cryptographic protocol errors | Severe compromise | Audited protocol + cross-platform conformance tests + security review |
| Relay compromise or abuse | Metadata exposure, traffic disruption | E2EE, least data, rate limits, strict authorization and monitoring |
| PC sleeps or Tauri exits | Sessions unavailable | Clear offline UI, tray mode for MVP, headless host later |
| Android background restrictions | Missed live WebSocket events | FCM signal + fetch/resync on app open |
| Event stream volume | Memory or bandwidth pressure | Bounded buffers, streaming backpressure, limits and retention |
| Stolen paired mobile | Remote PC control misuse | Keystore identity, revocation, default read-only, optional biometric step-up |
| Protocol changes between app versions | Client/server incompatibility | Version negotiation and compatibility tests |

### Decisions to Confirm Before Coding

1. Which agent adapter(s) are already implemented, and whether their sessions expose structured prompt/approval APIs or PTY-only control.
2. Whether the Tauri desktop is Windows-only for MVP.
3. Whether Android `minSdk` should target API 24 (Android 7) or a newer baseline; verify crypto library/Keystore behavior against the chosen floor.
4. Existing repository directory conventions and storage layer to preserve.
5. Relay deployment domain and VPS architecture.
6. Exactly which actions require desktop-side confirmation or biometric step-up.
7. Retention policy for local session events and security audit logs.

---

## 16. Definition of Done

A task can be marked `DONE` when:

- Code is integrated into the actual Rust/Tauri or Kotlin project.
- The feature works against real agent sessions, not only mock data (unless it is an explicitly UI-only task).
- Unit/integration tests relevant to the task pass.
- Security and authorization cases have been tested.
- UI supports offline/error/loading states when applicable.
- Telemetry does not disclose sensitive content.
- README/protocol documentation is updated.
- Regression tests establish no unintended changes to existing desktop behavior.

## 17. Reference Reading

- Orca: https://www.onorca.dev/
- Orca source: https://github.com/stablyai/orca
- Orca cloud folder: https://github.com/stablyai/orca/tree/main/cloud
- Tauri 2: https://v2.tauri.app/
- Tokio: https://tokio.rs/
- Axum: https://docs.rs/axum/
- Android Keystore: https://developer.android.com/privacy-and-security/keystore
- Firebase Cloud Messaging: https://firebase.google.com/docs/cloud-messaging
- OWASP WebSocket Security Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html

---

**PRD owner note:** This document defines the proposed product and acceptance requirements. It is not a claim that any portion is implemented in the existing project. Reconcile this PRD with the current repository architecture before development.
