# Scripture Knowledge Layer — Data

Shared, canonical scripture-knowledge data (cross-references today; topics / people / places
to follow), authored from open datasets and seeded into Supabase. See the design doc:
[docs/future/SCRIPTURE_KNOWLEDGE_LAYER.md](../../../docs/future/SCRIPTURE_KNOWLEDGE_LAYER.md).
Licensing/attribution: [ATTRIBUTION.md](./ATTRIBUTION.md).

## Files

| File | Committed? | What |
|---|---|---|
| `ATTRIBUTION.md` | yes | Data sources + licenses |
| `cross-references.sample.json` | yes | Small fixture (one verse's refs) for demos/tests |
| `cross-references.json` | no (gitignored) | Full normalized output — regenerate, don't commit (~tens of MB) |
| `raw/` | no (gitignored) | Raw dataset downloads (build inputs) |

The full `cross-references.json` is a deterministic derivative of a CC-BY public dataset, so it
is regenerated rather than committed.

## Regenerate cross-references

```bash
# 1. Download + unzip the TSK dataset (CC-BY, OpenBible.info)
mkdir -p server/data/scripture-knowledge/raw
curl -sL https://a.openbible.info/data/cross-references.zip -o /tmp/cr.zip
unzip -o /tmp/cr.zip -d server/data/scripture-knowledge/raw

# 2. Normalize → server/data/scripture-knowledge/cross-references.json
npm run skl:import:crossrefs            # or: npx tsx server/scripts/import-cross-references.ts
#   options: [inputPath] [--min-votes N]   (default min-votes 1 drops downvoted/rejected refs)
```

## Seed into Supabase

Requires the canonical tables to exist (`npm run db:push`) and DB env vars set. This writes to
shared reference tables with the service-role key.

```bash
npm run skl:seed                        # or: npx tsx server/scripts/seed-scripture-knowledge.ts
```

If the full `cross-references.json` is absent, the seed falls back to
`cross-references.sample.json` for a smoke run.
