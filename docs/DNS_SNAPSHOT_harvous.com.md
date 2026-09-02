# DNS snapshot — harvous.com (pre-Cloudflare)

**Captured 2026-09-02 UTC**, before Phase A stage 3 (moving the zone to Cloudflare).
This is the recovery record. Diff Cloudflare's imported zone against it **before** touching
nameservers at Hover.

Current nameservers: `ns1.hover.com`, `ns2.hover.com`
SOA serial at capture: `1788064358`
CAA: **none** — nothing restricts which CA may issue, so Cloudflare certs are unblocked.

## Records

| Name | Type | Value | Cloudflare proxy | Notes |
|---|---|---|---|---|
| `@` | A | `75.2.60.5` | **grey** | Netlify load balancer — marketing site |
| `www` | CNAME | `harvousdotcom.netlify.app` | **grey** | Marketing site, separate repo, **stays on Netlify** |
| `app` | CNAME | `harvouscom.netlify.app` | **grey**, then replaced | Becomes a Worker custom domain at stage 4 |
| `new` | CNAME | `harvous-new.netlify.app` | **grey**, then replaced | Worker `--env staging` at stage 4 |
| `status` | CNAME | `harvouscom.netlify.app` | **grey**, then replaced | Worker (production) at stage 4 |
| `clerk` | CNAME | `frontend-api.clerk.services` | **GREY — MANDATORY** | See below |
| `accounts` | CNAME | `accounts.clerk.services` | **GREY — MANDATORY** | See below |
| `clkmail` | CNAME | `mail.afn1kb8xgpgh.clerk.services` | **grey** | Clerk transactional mail (SendGrid) |
| `clk._domainkey` | CNAME | `dkim1.afn1kb8xgpgh.clerk.services` | **grey** | Clerk DKIM |
| `clk2._domainkey` | CNAME | `dkim2.afn1kb8xgpgh.clerk.services` | **grey** | Clerk DKIM |
| `mail` | CNAME | `mail.hover.com.cust.hostedemail.com` | **grey** | Hover hosted email — verify still in use |

## Email — the part that breaks silently

| Name | Type | Value |
|---|---|---|
| `@` | MX 10 | `work-mx.app.hey.com` |
| `@` | TXT | `v=spf1 include:_spf.hey.com ~all` |
| `@` | TXT | `hey-verification:RyipH6toMcmCKjBzte1wkdd8` |
| `_dmarc` | TXT | `v=DMARC1; p=none;` |

Mail is **HEY for Work**. No `hey1`/`hey2` DKIM selectors exist — HEY signs via the SPF
include. If MX or that SPF record fails to import, inbound mail dies with no error anywhere.

## Other TXT at apex (domain verifications — losing one silently un-verifies a service)

```
openai-domain-verification=dv-Xiz7N5xXlXJ3ZWzUA0t3yYxl
pinterest-site-verification=e517285f57887cd775f96418798ceee1
google-site-verification=wJ9hRieP1eXaDNXIHySuOne8OED7GZS46pcFHHkpoLc
```

## Why `clerk` and `accounts` must stay grey-cloud

`clerk.harvous.com` already answers with `server: cloudflare` and a `cf-ray` header — it is
proxied by **Clerk's own** Cloudflare (`worker.clerkprod-cloudflare.net`), not ours. Orange-
clouding it would proxy an already-proxied host through a second Cloudflare zone. Auth is the
blast radius. Leave both DNS-only.

## Confirmed absent

`smtp`, `ftp`, `help`, `docs`, `blog`, `api`, `cdn`, `hey1._domainkey`, `hey2._domainkey`,
and any CAA record.

## Limitation — read this before trusting the table

`dig` can only find record names that were **guessed**. There is no zone transfer, so this is
a safety net, not a complete dump. **The authoritative list is Hover's DNS panel.** Compare
Cloudflare's import against Hover's own record list; use this file to catch anything both of
them drop.
