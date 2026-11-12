# KWS branding for child notebooks

Epic's Kids Web Services (KWS) sends the parent verification emails and hosts the verification
screens a parent sees while setting up a child notebook (`docs/CHILD_ACCOUNTS.md`, on the child
notebook branch until it merges). This page covers what Harvous can brand there, the values to
use, and the portal steps. Every branding setting is in the Epic Developer Portal. None of them
is sent through the API, so no Harvous code carries branding.

Docs read 2026-11-12: [Branding](https://dev.epicgames.com/docs/kids-web-services/kws-branding),
[Configuration Inheritance](https://dev.epicgames.com/docs/kids-web-services/kws-inheritance),
[PV flow](https://dev.epicgames.com/docs/kids-web-services/parent-verification-service/pv-service-flow),
[PV set-up](https://dev.epicgames.com/docs/kids-web-services/parent-verification-service/set-up/pv-service-set-up),
[PV integration](https://dev.epicgames.com/docs/kids-web-services/parent-verification-service/pv-service-integration),
[Verification Response](https://dev.epicgames.com/docs/kids-web-services/parent-verification-service/set-up/pv-service-configure-verification-response),
[Go Live](https://dev.epicgames.com/docs/kids-web-services/kws-go-live),
[Localization](https://dev.epicgames.com/docs/kids-web-services/kws-localization).

## What can be customised

| Setting | Where it shows | Constraint | Where it is set |
|---|---|---|---|
| Brand name | Emails and web screens | Required, max 50 characters | Portal → Branding |
| Privacy policy URL | KWS flows, publicly | Required, HTTPS, must exist and be a real policy | Portal → Branding |
| Support / FAQ URL | KWS emails | Optional, must exist | Portal → Branding |
| Banner image | Top of the first verification email only | Exactly 720 × 250 px, JPG or PNG; no banner if unset | Portal → Branding |
| App icon | User Permissions service only (Harvous doesn't use it) | Exactly 512 × 512 px, JPG or PNG | Portal → Branding |
| Accent colour | The button in the first verification email | One hex value; default `#0070E0` | Portal → Branding |
| Redirect URL | Where the parent lands after verifying, instead of KWS's success screen | Optional, `https://host/path`, no special characters, must resolve | Portal → Parent Verification → Configuration → Verification Response |
| Language | All KWS emails and screens | One of the KWS language codes | API `language` field (`server/family/kws.ts` sends `en`) |

**Not customisable** (the docs don't offer these): email wording or templates, the sender name or
address, fonts, colours other than the one button, a custom domain for KWS pages or email, and
the verification-method screen layout. If any of these matters, ask the KWS Technical Account
Manager, because the self-serve portal doesn't expose them.

KWS applies one branding record to every KWS service. It can be set for the whole organization
(**Kids Web Services → Branding**) or for one product (**Your Products → product → Kids Web
Services → Product branding**). A product with no branding of its own inherits the organization's.
Once a product's branding is edited and published, it stops following the organization.

## Proposed values

Harvous's accent is a gradient, and KWS takes one flat hex for a button it draws itself. So the
gradient fills the banner, with white on it, and the button uses the flat accent that was tuned
to sit beside the gradient.

| Field | Value | Why |
|---|---|---|
| Brand name | `Harvous` | The name parents already signed up with |
| Privacy policy URL | The same URL as `HARVOUS_CHILD_PRIVACY_URL` in that environment | The parent notice and KWS must point at one reviewed policy. `https://harvous.com/privacy/` is live but has no children's section yet, so production waits for the published child policy (`docs/privacy/CHILD_PRIVACY_PUBLICATION_CHECKLIST.md`) |
| Support / FAQ URL | `https://harvous.com/support/` | Public and live. `app.harvous.com/settings/support` needs sign-in, which a KWS reviewer can't do |
| Banner image | [`docs/brand/kws/kws-banner-720x250.png`](brand/kws/kws-banner-720x250.png) | The accent gradient edge to edge (`171deg, #2bb5ff 7%, #006eff 93%`) with the Harvous mark and name in white Google Sans Flex 600. No caption: the email already says what it is for |
| App icon | `public/images/icons/icon-512.png` | 512 × 512 PNG, the gradient icon. Unused by Parent Verification, but this fills the field |
| Accent colour | `#3869E6` | The brand's flat accent (`--pds-accent`, `--site-accent`, native `Color(0.22, 0.41, 0.90)`). White text on it is 4.85:1, which passes AA. The gradient's end colour `#006EFF` is 4.49:1, just under AA for button-size text |
| Redirect URL (Test) | `https://family-test.harvous.com/settings/child-accounts` | Brings the parent back to Harvous instead of KWS's generic success screen |
| Redirect URL (Production) | `https://app.harvous.com/settings/child-accounts` | Same, for production |
| Language | `en` (unchanged) | The pilot is US-only. Pass the parent's language if enrollment opens elsewhere |

The redirect is navigation only. Consent still comes from the signed webhook alone. When the
parent lands, the Child notebooks page may still say pending until they press "Check
verification status".

To change the banner, edit `docs/brand/kws/banner.html` and run `node docs/brand/kws/render.mjs`.
That needs Playwright from the repo's `node_modules`. The script always writes exactly 720 × 250.

## Test and production

KWS gives every organization a **test** and a **production** environment, each with its own
configuration and credentials. The redirect URL, webhook and secrets are set per environment
(Go Live: "Follow the same procedure used to set up your product in the test environment").
The docs don't say whether the Branding page is per environment. If the page has a Test /
Production switch, enter the same values in both.

Production goes through a KWS review of up to seven business days. It checks the brand name,
privacy URL, support URL, redirect URL and banner: each URL must exist and make sense, and the
banner must relate to Harvous. Use the **Readiness** tab on the Parent Verification page to see
what's still missing.

## Portal checklist (Derek)

These need the Epic account. Nothing here has been changed by an agent.

1. Sign in at dev.epicgames.com/portal and choose the Harvous organization.
2. Under **Your Products**, select the product whose ID is `KWS_PRODUCT_ID`, then **Kids Web
   Services → Product branding**. (Or use organization-level **Kids Web Services → Branding** if
   Harvous will only ever have this one KWS product.) If you see the inheritance notice, the
   product is using the organization's values. Editing and publishing here gives the product its
   own copy.
3. Fill in the fields:
   - Product brand name: `Harvous`
   - Product Privacy Policy: the environment's `HARVOUS_CHILD_PRIVACY_URL`
   - Support / FAQ URL: `https://harvous.com/support/`
   - Banner image: upload `docs/brand/kws/kws-banner-720x250.png`
   - App icon: upload `public/images/icons/icon-512.png`
   - Accent color: `#3869E6`
4. Check the live email preview on the right: the banner sits at the top, and the button is blue
   with white text. Publish.
5. **Kids Web Services → Parent Verification → Configuration → Verification Response**: set the
   Redirect URL for Test to `https://family-test.harvous.com/settings/child-accounts`, then click
   **Publish to Test**.
6. Send a test verification from family-test.harvous.com to an org-member address (or a
   `+alias` of one). Check the email's banner, name, button colour and support link, and that
   verifying lands you on Child notebooks.
7. For production, repeat steps 3–5 with Production selected, using the production privacy URL
   and the Redirect URL `https://app.harvous.com/settings/child-accounts`. Then submit for review
   and allow seven business days.
