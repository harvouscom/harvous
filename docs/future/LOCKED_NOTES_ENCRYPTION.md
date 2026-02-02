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

## References

- [../LOCKED_NOTES_ENCRYPTION.md](../LOCKED_NOTES_ENCRYPTION.md) – Current implementation (account-level PIN, crypto, APIs)
- [../FEATURES.md](../FEATURES.md#-locked-notes--encryption--implemented) – User-facing feature summary
