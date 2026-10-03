# Locked Notes with Encryption

**Status:** Implemented (built Feb 2026; switched off in the Harvous 2 shell May 2026; back on, web only, Oct 2026)  
**Last Updated:** October 2026

This feature is live. See [FEATURES.md](./FEATURES.md#-locked-notes--encryption--implemented) for the user-facing summary.

---

## Overview

Lock individual notes with a **single account-level 4-digit PIN** so that content is encrypted on the client and only you (and God) can read it. The PIN is set, changed and removed in **Settings › Lock PIN**; a note is locked and unlocked from its **⋯ menu** (or Mod+Shift+L). One PIN entry opens every locked note for an **unlock session** (below). The server and database only ever see ciphertext. Use cases include prayer notes, confessions, and “things only God knows.”

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

**Protected against:** Accidental sharing, public links and co-editing (all refused server-side for locked notes); someone glancing at the screen or picking up an unlocked device after the session has ended; anything that reads the server's plaintext views — search, Review, exports, link previews and connected AI apps (the Connector returns title and dates only).

**Not protected against:**

- **Offline guessing of the ciphertext.** A 4-digit PIN has 10,000 values. Anyone holding a locked note's blob — a database leak, or someone signed in as you, who can read it through the API — can try all of them offline; at 310k PBKDF2 iterations that is minutes, not years. The server's PIN verifier (`lockPinHash`) is a cheaper target still. The PBKDF2 cost and the server rate limit (10 PIN checks per 15 minutes, shared across verify / change / remove) slow *online* guessing only. A longer passphrase option is the real fix if this needs to hold against a determined attacker.
- Device compromise while a note is open; a forgotten PIN (no recovery).

---

## Architecture

- **Client-only encryption.** Encrypt/decrypt in the browser; server and DB only see ciphertext.
- **Unlock session** ([note-unlock-state.ts](../src/utils/note-unlock-state.ts)). Entering the PIN once opens every locked note: the PIN is held in memory (never persisted) and each note's gate decrypts with it automatically. The session ends after **5 minutes without activity** (keys and pointer presses slide the window), when the tab has been **hidden for 15 seconds** (a grace, so a note's last save — encrypted asynchronously — can finish), on unload, on **Lock now**, and whenever a note is locked.
- **Saves of an open locked note** are encrypted in `useUpdateNote` with the session PIN and a fresh salt/IV. With no session there is no key, and the save refuses rather than sending plaintext. The editor writes **no local drafts** for a locked note, and its unload flush goes through the encrypting save instead of the plaintext keepalive PUT. Locked bodies never enter a query cache as plaintext.
- **Server backstops.** `PUT /api/notes/update`, `update-content` and sync push refuse a non-ciphertext body for a locked note (`LOCKED_NOTE_NEEDS_CIPHERTEXT`, checked by shape in [note-lock-blob.ts](../src/utils/note-lock-blob.ts)); only the author may lock or unlock (`LOCK_AUTHOR_ONLY`); a note in a shared space can't be locked (`LOCKED_NOTE_IN_SHARED_SPACE`) — see [note-lock-guards.ts](../server/utils/note-lock-guards.ts). List payloads blank a locked note's body, and exports write a placeholder (the backup zip keeps the ciphertext in `manifest.json`).
- **Account-level PIN.** One PIN per account, set, changed and removed in Settings › Lock PIN. Removing it is allowed only when no note is still locked (`HAS_LOCKED_NOTES`). A **verifier** (hash + salt) is stored in `UserMetadata` so the server can verify the PIN when locking; the PIN itself is never stored or transmitted. Key for each note is derived from PIN + per-note salt and kept only in memory during the session.
- **API contract:** Create/update/update-content accept optional `contentEncrypted`; when true, `content` is stored as-is. Reads return ciphertext; client decrypts after PIN. **Lock PIN APIs:** `POST /api/user/set-lock-pin` (set, or change with `currentPin`; setting over an existing PIN is refused), `POST /api/user/verify-lock-pin` (verify before locking), `POST /api/user/remove-lock-pin` (only with no locked notes), `GET /api/user/locked-notes` (list locked note IDs for the change-PIN re-encrypt flow). All three POSTs share the `lock-pin` rate-limit bucket.

---

## Database

**Table:** [server/db/schema.ts](../server/db/schema.ts) – `Notes`

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
- [src/utils/note-lock-actions.ts](../src/utils/note-lock-actions.ts) – lock / remove-lock writes; [note-lock-blob.ts](../src/utils/note-lock-blob.ts) – ciphertext shape check
- Harvous 2 shell: [PrototypePinPanels.tsx](../spa/src/pages/prototype/PrototypePinPanels.tsx) (listener + cache refresh) and [PrototypePinSheet.tsx](../spa/src/pages/prototype/PrototypePinSheet.tsx) (lazy sheet); ⋯ menu items in [PrototypeNoteMoreMenu.tsx](../spa/src/pages/prototype/PrototypeNoteMoreMenu.tsx); Settings › Lock PIN at `settings/lock-pin`
- APIs: [server/routes/notes.ts](../server/routes/notes.ts) (create, update, update-content), [server/routes/user.ts](../server/routes/user.ts) (lock PIN), [server/routes/sync.ts](../server/routes/sync.ts); [dashboard-data](../server/utils/dashboard-data.ts), [search](../server/utils/search-notes-query.ts), [export](../server/utils/export-user-data.ts)
- Schema: [server/db/schema.ts](../server/db/schema.ts) – `contentEncrypted` on Notes; `lockPinSalt`, `lockPinHash` on UserMetadata

**Native (not yet):** the Swift app syncs `contentEncrypted` but has no decryption or PIN entry — `SettingsLockPINView` is a stub and `.lockNote` is a no-op. Native parity (CryptoKit AES-GCM + PBKDF2 with the same parameters, a PIN sheet, optional Face ID) is its own piece of work.

Remaining future ideas are in [docs/future/LOCKED_NOTES_ENCRYPTION.md](future/LOCKED_NOTES_ENCRYPTION.md).

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

See [CONNECTOR_BOUNDARIES.md](./future/CONNECTOR_BOUNDARIES.md).
