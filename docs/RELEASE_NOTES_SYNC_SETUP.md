# Release notes sync — credential setup

`.github/workflows/sync-release-notes.yml` pushes changelog rows into
`harvouscom/harvous.com` (`data/webflow-changelog.csv`), which the marketing site renders at
`/release-notes/`. Pushing into a second repository needs a credential of its own, because the
default `GITHUB_TOKEN` is scoped to this repository only.

That credential is an **SSH deploy key**, stored here as the secret
`HARVOUS_COM_SYNC_DEPLOY_KEY`.

## Why a deploy key and not a token

It was a personal access token until August 2026. The token was minted on July 6th, expired
about thirty days later, and the sync went down silently — the workflow turned red on every run
from August 5th, and versions 2.54.5 through 2.54.10 never reached the site. Nobody was looking
at a workflow that had always been green.

A deploy key does not expire, so that particular failure cannot happen again. It is also scoped
to one repository rather than carrying the whole account of whoever minted it, so it is a
smaller thing to lose.

## Setting it up

Run these yourself — the private key should never be pasted into a chat, a file in this repo, or
anywhere but the secret.

**1. Generate the key pair.** No passphrase: an unattended workflow has nobody to type one.

```bash
ssh-keygen -t ed25519 -N "" -C "harvous release-notes sync" -f ~/.ssh/harvous_com_sync
```

**2. Add the public half to the marketing site**, at
`https://github.com/harvouscom/harvous.com/settings/keys/new`. Title it "release notes sync", and
**tick "Allow write access"** — the workflow commits and pushes, so a read-only key fails at the
last step rather than the first.

```bash
pbcopy < ~/.ssh/harvous_com_sync.pub
```

**3. Store the private half as a secret on this repository.**

```bash
gh secret set HARVOUS_COM_SYNC_DEPLOY_KEY --repo harvouscom/harvous < ~/.ssh/harvous_com_sync
```

**4. Remove the dead token and the local private key.**

```bash
gh secret delete HARVOUS_COM_SYNC_TOKEN --repo harvouscom/harvous
rm ~/.ssh/harvous_com_sync
```

Deleting the local copy is safe: GitHub holds the public half and this repository holds the
private half, and neither can be read back out. If the key is ever lost or needs rotating,
generate a new pair and repeat — there is nothing to recover.

**5. Confirm it works.** The workflow triggers on pushes to `main` that touch `Changelog/**`, so
the next release runs it. To check without waiting:

```bash
gh workflow run "Sync release notes to marketing site" --repo harvouscom/harvous
gh run watch --repo harvouscom/harvous
```

## Catching up a backlog

`npm run changelog:export:backfill` exports every `Changelog/*.md` at or above the CSV's highest
version and skips rows already present, matching on version plus title. So a sync that has been
down for a while catches up on its own the next time it runs — there is no manual replay, and
running it twice is harmless.

One consequence worth knowing: the fingerprint includes the **title**. Rewriting a changelog
bullet after it has been exported produces a *new* row rather than updating the old one, and the
site then shows both. Delete the stale row from the CSV before re-exporting.

## Gotchas

- **A deploy key belongs to exactly one repository.** GitHub rejects a public key that is already
  registered elsewhere, so generate a fresh pair rather than reusing an existing one.
- **`actions/checkout` with `ssh-key` sets the remote to SSH and keeps the credential**
  (`persist-credentials` defaults to true), which is what lets the `git push` step at the end of
  the job work without any further setup.
- **The workflow only fires on `Changelog/**` and the export script.** Editing a file under
  `release-notes/` does not trigger it — those are the human-written notes and are not what the
  marketing site reads.
