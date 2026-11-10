# Polar → Clerk and Audienceful subscription reporting

Polar remains the billing authority. Harvous access checks still use existing entitlements.
The subscription webhook now optionally copies personal billing information to Clerk private
metadata (`harvous_billing`) and Audienceful custom fields. No founding member fields are copied.
Church events stay in the existing organization billing branch and never label the buyer Plus.

## Fields

Create these optional custom fields in Audienceful before enabling the sync. Clerk metadata
needs no field setup. Dates are ISO 8601 strings (empty string when unavailable).

| Data name | Audienceful type | Meaning |
| --- | --- | --- |
| billing_plan | string | `free` or `plus`; personal subscription only |
| billing_subscription_status | string | Polar status, or `none` for no personal subscription |
| billing_interval | string | `month`, `year`, or empty |
| billing_current_period_end | string | End of current/latest personal subscription period |
| billing_renews_at | string | Period end only while active and not scheduled to cancel |
| billing_cancel_at_period_end | boolean | Scheduled cancellation |

`active`, `trialing`, and `past_due` retain Plus for consistency with existing Harvous access
policy. Use status as well as plan to distinguish paying, trial, and payment-recovery segments.
An active subscription scheduled to cancel remains Plus until it ends. Historical canceled
subscriptions never override another active Plus subscription. Canceled users report Free
with their last Polar status. A church-only buyer reports no personal subscription.

## Configuration and rollout

1. Supply matching-environment `POLAR_ACCESS_TOKEN`, `POLAR_ENV`, both
   `POLAR_PLUS_PRODUCT_MONTHLY` and `POLAR_PLUS_PRODUCT_ANNUAL`, `CLERK_SECRET_KEY`, and
   `AUDIENCEFUL_API_KEY`. Keep production and sandbox contacts in separate Audienceful workspaces.
2. Create the six Audienceful fields above. Existing Audienceful v1 transport is reused; no
   account-wide API migration is included. Confirm field acceptance with one test contact.
3. Run `npm run billing:verify` against the intended Polar environment.
4. Preview a small batch (no external writes):
   `npm run billing:sync-contacts -- --environment=production --limit=5`
5. Review the output; add `--apply` to write that batch. Increase `--limit` (maximum 100)
   and use `--offset` / the reported `nextOffset` until all Clerk users have been processed.
   Failed batches exit nonzero; rerun their offset before advancing. Preview logs user IDs and billing fields. Apply also uses the existing Audienceful integration
   logging, which includes contact emails. Preview reads Clerk and Polar but does not read Audienceful.
6. Deploy the API with `BILLING_CONTACT_SYNC_ENABLED=true`. Existing Polar subscription webhooks
   should include created, active, updated, canceled, uncanceled, past_due, and revoked events.
7. Confirm a sandbox upgrade, annual/monthly switch, scheduled cancellation, uncancel,
   past-due event, final cancellation, and church purchase in both destinations. Then repeat a
   production contact check and finish the backfill after activation to cover rollout changes.

The batch command requires an explicit Polar environment and a matching Clerk live/test key.
It is preview-only unless `--apply` is supplied, independent of the webhook feature switch.
No database schema changes are required. Enabling the switch with missing destination credentials
fails the webhook rather than silently losing reporting updates.

## Delivery and recovery

Each event re-reads all current Polar subscriptions, so delayed/replayed events do not simply
copy an obsolete event payload. Both destination writes are awaited before webhook acknowledgement;
a failure returns 500 for Polar retry. A successful Clerk write is not repeated when its metadata
already matches. Audienceful updates merge billing fields with existing contact data, including
explicit false/empty values to clear cancellation and renewal fields. Existing-contact marketing
subscription/consent settings are not changed. Missing contacts use the existing app-user creation
behavior (no automation triggered on creation).

Clerk metadata changes may produce `user.updated`, but that handler only syncs identity/activity
and never calls billing sync, so there is no billing feedback loop. Audienceful identity/activity
writes preserve the billing keys. Because the existing v1 integration merges a fetched contact,
concurrent contact writes can still race; rerunning the batch repairs drift. Concurrent Polar
webhooks can likewise overlap; this is reporting, not an access-control mechanism. Rerun a preview
and apply reconciliation after delivery failures or suspected drift. Set the feature switch to
`false` to stop webhook copies without affecting billing or access.

References: [Clerk metadata](https://clerk.com/docs/reference/backend/user/update-user-metadata),
[Audienceful fields](https://developer.audienceful.com/api-reference/fields/create).
