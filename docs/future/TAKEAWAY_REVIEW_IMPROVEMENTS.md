# Takeaway review: future improvements

The Takeaway card ("What did you take from {note}?") is self-rated. It shows the question,
opens the note, then offers three verdicts. It has no writing box.

## Why the writing box was removed (Oct 12 2026)

A box was added on Oct 12 and removed the same day. Nothing read what was typed, so it was
decoration, and the result card read the same whatever the reader wrote or chose.

The goal Derek stated: Takeaway should be about recalling what you wrote or noted, not about
producing new prose.

## Ideas, in rough order of worth

1. **Compare against the note.** After the reader writes, show their words beside the note's own
   takeaway lines. Needs a way to find the note's takeaway (a heading, a last paragraph, a marked
   line) without a generative model, which the product has ruled out.
2. **Recall the note's own words.** Ask for a phrase or a theme from the note and mark it with
   the keyword machinery that already exists for Scripture (`verse.keywords`).
3. **Persist what was written.** Store the reader's takeaway so a later sitting can show how it
   changed. Needs a column and a decision on whether it belongs on the note or the review item.
4. **Result card honesty.** The result card says "Not this time." for the `revealed` verdict. A
   self-rated card should say the verdict the reader chose, in its own words.

## Open question

The result message reportedly reads like a miss whatever verdict is picked. The server returns
the picked verdict (`verdict ?? outcome` in `server/routes/review.ts`) and the dock shows
`REVIEW_OUTCOME_ACK_COPY[outcome]`, so this was not reproduced from the code alone. Re-check in
the browser with a throwaway note before building on it.
