# Polar → Clerk and Audienceful: remaining rollout

Paused at the user's request on November 10, 2026. Implementation is prepared locally;
no live backfill or account configuration was performed in this work. Resume from this checklist.

## Decisions to preserve

- Polar owns billing; Clerk and Audienceful receive reporting copies only.
- Sync personal plan, subscription status, billing interval, period end, renewal date,
  and scheduled cancellation.
- Do not sync founding member status; that offer was retired.
- Church subscriptions belong to the church and must not label the purchaser personal Plus.
- Keep existing entitlement/access behavior unchanged.

## Already implemented

- `server/utils/billing-contact-sync.ts`: reads current Polar subscriptions and writes Clerk
  private metadata (`harvous_billing`) and Audienceful fields. Prefers live personal Plus over
  canceled history, ignores church products, and awaits delivery so failures trigger webhook retry.
- `server/routes/webhooks.ts`: invokes the sync after personal billing events only when
  `BILLING_CONTACT_SYNC_ENABLED=true` (off by default).
- `src/utils/audienceful.ts`: accepts mutable billing fields while preserving existing contact data.
- `server/scripts/sync-billing-contacts.ts`: preview-first, paginated backfill, available through
  `npm run billing:sync-contacts`. Requires explicit environment and matching Clerk live/test key.
- Tests cover billing mapping, destination delivery failures, preview behavior, duplicate Clerk
  updates, and preservation of Audienceful activity, product flags, tags, and existing consent settings.

Validation at handoff: 25 targeted tests passed, `npm run build:api` passed, and
`npm run typecheck:ratchet` passed with no new errors (124 existing errors in the baseline).
Generated function bundles were restored after build verification; rebuild for deployment.

See [the implementation and operations guide](../BILLING_CONTACT_SYNC.md) for field names,
commands, delivery limitations, and recovery details.

## Remaining work, in order

- [ ] Recheck the working tree and deployment state before resuming. This handoff does not
  establish that the new code is deployed or enabled.
- [ ] Obtain matching account access. At handoff, local `.env` had production Polar credentials,
  a test Clerk secret, and no Audienceful API key. Recheck rather than assuming this remains true.
  Supply the production Clerk secret and the correct Audienceful workspace key through local
  environment configuration, never chat or committed files. Use separate test contacts/workspace
  for sandbox verification.
- [ ] Verify the Polar products and IDs with `npm run billing:verify` against the intended environment.
- [ ] Create the six optional Audienceful custom fields listed in the operations guide. Clerk
  private metadata requires no field registration. Confirm the existing Audienceful v1 endpoints
  and custom-field types work with the account; the integration has not been verified live.
- [ ] Run the sync in sandbox against known test users. Verify Free, monthly Plus, annual Plus,
  trial, past due, scheduled cancellation, uncancel, and final cancellation.
- [ ] Verify a church-only purchaser remains personally Free and a purchaser with a separate
  personal Plus subscription retains their personal status.
- [ ] Verify unrelated Audienceful fields, existing tags, and unsubscribe/consent settings survive
  updates. Confirm an identity/activity sync does not remove billing fields or create a billing loop.
- [ ] Verify webhook replay/failure recovery and review concurrent-write limitations in the guide.
  There is no automatic reconciliation schedule added by this implementation; the batch tool is
  the manual repair path.
- [ ] Preview a small production batch without writes:
  `npm run billing:sync-contacts -- --environment=production --limit=5`.
- [ ] Review the preview, then apply the small batch with `--apply` and verify both destinations.
  Do not enable the webhook switch before destination fields and credentials are ready.
- [ ] Deploy the API with matching environment variables and `BILLING_CONTACT_SYNC_ENABLED=true`.
  Confirm Polar delivers the subscription events listed in the operations guide and check a real
  contact in both destinations.
- [ ] Backfill remaining Clerk users using `--limit` and `--offset`. Record offsets and failures;
  rerun failed batches before moving forward. Reconcile again after activation to catch changes
  made during rollout.
- [ ] Confirm production segmentation works in Audienceful. Distinguish `active`, `trialing`, and
  `past_due` using status as well as plan; all currently retain Plus under existing access policy.

To stop reporting copies, set `BILLING_CONTACT_SYNC_ENABLED=false`. This leaves existing
billing and access checks in place. Do not run database migrations for this feature; none are needed.
