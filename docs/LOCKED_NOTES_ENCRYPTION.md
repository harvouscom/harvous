# Locked Notes with Encryption

**Status:** Implemented  
**Last Updated:** February 2026

This feature is live. See [FEATURES.md](./FEATURES.md#-locked-notes--encryption--implemented) for the user-facing summary.

---

## Overview

Lock individual notes with a **single account-level 4-digit PIN** so that content is encrypted on the client and only you (and God) can read it. The PIN is set and changed in **Profile → Lock PIN**; any note can be locked or unlocked with that same PIN. The server and database only ever see ciphertext. Use cases include prayer notes, confessions, and “things only God knows.”

---

## Cryptography (Implemented)

We state the exact algorithms and parameters for **transparency and trust**. Nothing proprietary; industry-standard, auditable choices.

| Component | Implementation |
|-----------|----------------|
| **Cipher** | **AES-GCM** (256-bit key). Authenticated encryption; tampering is detected. |
| **Key derivation** | **PBKDF2-SHA256** with **310,000 iterations** (OWASP 2025 recommendation). |
| **Salt** | 16 bytes, cryptographically random (`crypto.getRandomValues`), generated **per encryption** and stored with the ciphertext. |
| **IV (nonce)** | 12 bytes for AES-GCM, cryptographically random per encryption. |
| **Key** | 256-bit AES key derived from PIN + salt. Key exists only in memory; never persisted or sent to the server. |
| **API** | Web Crypto API (`crypto.subtle`). No third-party crypto libraries. |

**Stored blob format:** Base64-encoded concatenation: `salt (16 bytes) || IV (12 bytes) || ciphertext`. Stored in the `content` column when `contentEncrypted` is true; server treats it as opaque.

**Source:** [src/utils/note-encryption.ts](../src/utils/note-encryption.ts) — constants `PBKDF2_ITERATIONS = 310000`, `SALT_LENGTH = 16`, `IV_LENGTH = 12`, `KEY_LENGTH = 256`.

**Trust:** We do not have access to your locked note plaintext. If you forget your PIN, locked content cannot be recovered (no backdoor, no recovery path in the current implementation).

---

## Comparison with other notes apps

How Harvous’s encryption compares to common alternatives (as of 2025–2026; competitor details are from public docs and support pages).

| App | Lock / encryption | Cipher & key | Key derivation | Published details? |
|-----|-------------------|--------------|----------------|--------------------|
| **Harvous** | Account-level lock PIN (one PIN for all notes); client-only, server never sees plaintext | **AES-GCM 256-bit** | **PBKDF2-SHA256, 310,000 iterations** (OWASP 2025) | Yes — algorithms and parameters in this doc and in code |
| **Apple Notes** | Per-note lock; device passcode or custom Notes password; E2E on iCloud | End-to-end encrypted; exact cipher/key size not published | Not published | No — “E2E” and no recovery only |
| **Evernote** | Encrypt *selected text* in a note with passphrase; passphrase never sent | **AES 128-bit**, CBC mode | PBKDF2, **50,000 iterations** (per Evernote help) | Yes — AES 128, PBKDF2 50k, no escrow |
| **OneNote** | Password-protect *sections*; content encrypted | **AES 128-bit** (per Microsoft) | Not published | Minimal — 128-bit AES only |
| **Notion** | No built-in password or encryption for individual pages | — | — | Third-party tools add protection |

**Where Harvous stands:**

- **Stronger key and mode than Evernote/OneNote:** We use **AES-256** and **GCM** (authenticated encryption); they use AES-128 and (in Evernote’s case) CBC. GCM also provides integrity (tampering is detected).
- **Much higher key-derivation cost:** **310,000 PBKDF2 iterations** (OWASP 2025) vs Evernote’s 50,000, making brute-force on a stolen ciphertext harder.
- **Fully documented:** Algorithms, iteration count, salt/IV sizes, and blob format are specified here and in [src/utils/note-encryption.ts](../src/utils/note-encryption.ts). Many apps do not publish these details.
- **Same promise as leaders on recovery:** Forgot PIN/password = no recovery (same as Apple Notes, Evernote, OneNote).

**Trade-off:** We use a 4-digit PIN for usability (e.g. prayer notes, quick lock). For high-sensitivity use, a longer passphrase would be stronger; we could support that in a future option while keeping the same cipher and KDF.

---

## Threat Model

**Protected against:** Accidental sharing or screen share; someone with temporary device access; DB leak or server compromise (server never sees plaintext for locked notes).

**Not protected against:** Device compromise while the note is unlocked; user forgets PIN (no recovery).

---

## Architecture

- **Client-only encryption.** Encrypt/decrypt in the browser; server and DB only see ciphertext.
- **Account-level PIN.** One PIN per account, set and changed in Profile → Lock PIN. A **verifier** (hash + salt) is stored in `UserMetadata` so the server can verify the PIN when locking; the PIN itself is never stored or transmitted. Key for each note is derived from PIN + per-note salt and kept only in memory during the session.
- **API contract:** Create/update/update-content accept optional `contentEncrypted`; when true, `content` is stored as-is. Reads return ciphertext; client decrypts after PIN. **Lock PIN APIs:** `POST /api/user/set-lock-pin` (set or change PIN), `POST /api/user/verify-lock-pin` (verify before locking), `GET /api/user/locked-notes` (list locked note IDs for change-PIN re-encrypt flow).

---

## Database

**Table:** [db/config.ts](../db/config.ts) – `Notes`

- `contentEncrypted` – boolean, default `false`. When true, `content` holds the base64 blob (salt || IV || ciphertext).

**Table:** `UserMetadata` (account-level lock PIN)

- `lockPinSalt` – optional; per-user salt for PIN hashing (server-only, never sent to client).
- `lockPinHash` – optional; hash of PIN for verification (server-only, never sent to client). Client only receives `hasLockPinSet: boolean` (e.g. from get-profile).

---

## API & Feature Impact

- **Writes:** create, update, update-content accept `contentEncrypted` and store `content` as opaque.
- **Reads:** details, recent, dashboard return content as-is; client shows “Locked” or decrypts after PIN.
- **Search:** Locked notes excluded from full-text search (content not readable by server).
- **Scripture detection, auto-tags, suggest-threads:** Skip or title-only for locked notes.
- **Sharing:** Locked notes not shareable or show “This note is locked.”

---

## Key Files (Implemented)

- [src/utils/note-encryption.ts](../src/utils/note-encryption.ts) – deriveKey, encryptContent, decryptContent, blob encode/decode
- [src/utils/note-unlock-state.ts](../src/utils/note-unlock-state.ts) – in-memory unlock state
- [src/utils/lock-pin-server.ts](../src/utils/lock-pin-server.ts) – server-side PIN hashing/verification (set-lock-pin, verify-lock-pin)
- [src/components/react/LockNoteButton.tsx](../src/components/react/LockNoteButton.tsx), [PinEntryPanel.tsx](../src/components/react/PinEntryPanel.tsx), [InlinePinUnlock.tsx](../src/components/react/InlinePinUnlock.tsx), [LockPinPanel.tsx](../src/components/react/LockPinPanel.tsx) (profile)
- APIs: create, update, update-content, details, recent; [dashboard-data](../src/utils/dashboard-data.ts), [search](../src/pages/api/search.ts); user/set-lock-pin, user/verify-lock-pin, user/locked-notes, get-profile (hasLockPinSet)
- Schema: [db/config.ts](../db/config.ts) – `contentEncrypted` on Notes; `lockPinSalt`, `lockPinHash` on UserMetadata

Optional future enhancements (e.g. remove lock PIN, session PIN) are documented in [docs/future/LOCKED_NOTES_ENCRYPTION.md](future/LOCKED_NOTES_ENCRYPTION.md).

---

## Recovery Policy

**Default:** Forgot PIN = no recovery. Stated in-product and in help (same as Apple Notes, Evernote). Optional recovery path is a future consideration with clear security tradeoff.

---

## Future: AI and API/MCP

When a note is locked, nothing can read its body—no server, no AI, no API. Content is only readable
after the user unlocks in the Harvous app.

**Connector (planned outbound add-on):**

- **Your locked notes:** Connector returns **metadata only** (id, title, dates, `locked: true`) — no
  body, not an error. User must unlock in Harvous to read content elsewhere.
- **Others' locked notes in shared spaces:** **Excluded** from Connector list/search results (same as
  member view in the app).
- Connector is **read-only permanently** — no path to read locked plaintext via Connector without
  in-app unlock.

See [CONNECTOR_BOUNDARIES.md](../future/CONNECTOR_BOUNDARIES.md).
