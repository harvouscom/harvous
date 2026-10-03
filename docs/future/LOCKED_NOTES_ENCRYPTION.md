# Locked Notes – Future Options

**Status:** Optional enhancements (not in initial account-level PIN release)  
**Last Updated:** February 2026

The main locked notes implementation is documented in [../LOCKED_NOTES_ENCRYPTION.md](../LOCKED_NOTES_ENCRYPTION.md). This doc captures **optional future** enhancements for the account-level lock PIN and related UX.

---

## 1. Remove lock PIN from profile

**What it is:** A profile action to **turn off** the Harvous lock PIN (clear the stored hash so “no account PIN” is set).

**Why it’s optional:** The initial release focuses on **Set** and **Change** PIN in profile. “Remove” adds edge cases: if the user removes the PIN, notes that are already locked still need *some* PIN to unlock (the one that was used when they were locked). Implementation would need:

- Clear copy and possibly a confirmation step (e.g. “Existing locked notes will stay locked until you unlock them with your current PIN and optionally re-lock with a new PIN.”)
- Server: clear `lockPinSalt` and `lockPinHash` for the user; never delete or re-encrypt note content

**When to add:** If users ask for a way to stop using the account lock PIN without losing access to existing locked notes (unlock with current PIN first, then remove PIN).

---

## 2. Session PIN / auto-try unlock

**What it is:** After the user enters the account PIN once (e.g. to lock or unlock a note), “remember” it in the session (e.g. in memory or a short-lived token) and automatically try it when they open another locked note, so they don’t have to type the PIN every time.

**Why it’s optional:** Adds design and security work:

- Where to store the PIN or a derived value (memory only vs sessionStorage with clear lifecycle)
- How to know which notes were locked with the account PIN (e.g. a small “locked with account PIN” flag per note) so we only auto-try for those
- Clear UX when session PIN is no longer available (e.g. after tab close or timeout)

**When to add:** If users report re-entering the PIN for every note as friction and we’re comfortable with the security and lifecycle of session storage.

---

## Follow-ups from the Oct 2026 re-enable (open)

Found by an audit of spaces, church and the Connector when locked notes came back on web (PR #227). None leaks to another person; all are owner-only reads of data derived from a locked note's body, or ideas for making the feature stronger.

**Derived data survives locking.** Locking keeps `NoteScriptureReferences`, `ScriptureMetadata`, tags and `StudyThreadEntries` made from the plaintext. The fixes so far filter each read; the cleaner fix is to delete (or null) derived rows when a note is locked, and re-derive on unlock/remove-lock.

**Owner-only reads that still include locked notes** (filter `contentEncrypted = false`, or blank the body-derived field):
- `server/routes/spaces.ts` `study-threads/by-scripture`, personal branch (the sibling `study-thread-highlights` already filters).
- `server/routes/study-feed.ts` personal highlight rows: `anchorQuote` / `sourceSnippet` come from inside locked notes.
- `server/utils/crossref-gaps.ts`: the legacy-junction and `ScriptureMetadata` scans include locked notes (the pill half filters).

**Moving a Thread into a shared space.** `spaces.ts` add-thread / add-items (threads) and sync thread mutations set `Threads.spaceId` without checking the thread for locked members. Member note lists are safe (they join `SpaceNotes`); only counts were affected and are now filtered. Consider refusing the move while the thread holds a locked note.

**Open church submissions when a note is locked.** `refuseLockToggle` only looks at `SpaceNotes`. Locking should withdraw the note's open `ChurchContentSubmissions` (next to `clearAllCoEditForNote` in `note-version-service.ts`) instead of only hiding the title in the review list.

**Defense in depth.** `church-review-suggestions.ts` reads channel note titles and scripture refs with no lock filter, relying on the "never in a shared space" invariant. A test forbids the string `Notes.content` in that file, so a filter has to be written another way (a join on a locked-note subquery).

**Strength.** A 4-digit PIN can be guessed offline in minutes by anyone holding a note's ciphertext; a longer passphrase option is the real fix (see the trade-off in `../LOCKED_NOTES_ENCRYPTION.md`).

**Native.** Native syncs `contentEncrypted` but cannot open locked notes; a stop-gap "Locked" view is in progress, and full parity (CryptoKit AES-GCM + PBKDF2, PIN sheet, optional Face ID) is its own piece of work.

## References

- [../LOCKED_NOTES_ENCRYPTION.md](../LOCKED_NOTES_ENCRYPTION.md) – Current implementation (account-level PIN, crypto, APIs)
- [../FEATURES.md](../FEATURES.md#-locked-notes--encryption--implemented) – User-facing feature summary
