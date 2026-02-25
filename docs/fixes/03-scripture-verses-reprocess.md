# Fix: Scripture verses reprocess (data repair)

## Problem

Some scripture notes were created with only the reference text (e.g. "John 3:16") in the note content and in `ScriptureMetadata.originalText`, instead of the actual verse text fetched from the Bible.org API. That happened when the fetch timed out or failed (e.g. on mobile before the timeout fix). Those notes are correct as references but lack the verse body.

## Root cause

- The API that fetches verse text did not have appropriate timeouts or error handling in all code paths, so on slow or flaky networks the note could be saved before the verse content was available.
- A separate fix addressed the timeout/retry behavior so **new** scripture notes get the verse content reliably. This fix addresses **existing** notes that were already saved without it.

## Solution

A one-off data repair: reprocess scripture notes for a user (or all users) by re-fetching verse text from the Bible.org API and updating both `Note.content` and `ScriptureMetadata.originalText`.

Implementation lives in the **scripts/fixes** folder and as an API endpoint for logged-in use:

- **Script**: [scripts/fixes/reprocess-scripture-verses.ts](../../scripts/fixes/reprocess-scripture-verses.ts)
- **API endpoint**: [src/pages/api/fixes/reprocess-scripture-verses.ts](../../src/pages/api/fixes/reprocess-scripture-verses.ts)
- **Usage and behavior**: [scripts/fixes/README.md](../../scripts/fixes/README.md) (run with `--dry-run` first; API can be used from the browser when logged in).

The script/endpoint:

1. Finds scripture notes for the given user(s).
2. Detects notes where `ScriptureMetadata.originalText` is missing or only contains the reference.
3. Fetches the verse text using timeout-enabled fetch.
4. Updates `Note.content` and `ScriptureMetadata.originalText`.

## Files to reference

- **scripts/fixes/README.md** – Full usage (CLI and API), guidelines, and idempotency.
- **scripts/fixes/reprocess-scripture-verses.ts** – CLI script.
- **src/pages/api/fixes/reprocess-scripture-verses.ts** – API endpoint for in-browser reprocessing.

## Prevention

- Ensure any external fetch used when creating or updating content (e.g. verse API) has timeouts and clear error handling so we don’t persist incomplete data. Use the same timeout/retry approach in both the main create flow and any reprocess scripts.
