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
| `topics.sample.json` / `topic-verses.sample.json` | yes | Small fixtures (one verse's themes) |
| `topics.json` / `topic-verses.json` | no (gitignored) | Full topic registry + verse edges — regenerate |
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

## Regenerate topics

```bash
# 1. Download the OpenBible topical dataset (CC-BY)
mkdir -p server/data/scripture-knowledge/raw
curl -sL https://a.openbible.info/data/topic-votes.txt -o server/data/scripture-knowledge/raw/topic-votes.txt

# 2. Normalize → topics.json + topic-verses.json
npm run skl:import:topics                # or: npx tsx server/scripts/import-topics.ts
#   options: [inputPath] [--min-votes N] [--max-span N]
#   (short same-chapter ranges up to --max-span verses are expanded to per-verse edges)
```

## Seed into Supabase

Requires the canonical tables to exist (`npm run db:push`) and DB env vars set. This writes to
shared reference tables with the service-role key.

```bash
npm run skl:seed                        # both cross-references and topics
# selective:
npx tsx server/scripts/seed-scripture-knowledge.ts topics
npx tsx server/scripts/seed-scripture-knowledge.ts crossrefs
```

If a full file is absent, the seed falls back to the matching `*.sample.json` for a smoke run.
