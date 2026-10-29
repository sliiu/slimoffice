# Negative fixtures (expected FAIL)

These are on-disk QA cases. Opening / running them through deckgen should **fail** the named gate. Positive samples stay in the parent folder.

| File | Gate | Expected fail |
|---|---|---|
| `fail-pairing-editorial-ikb.json` | ColorTheme pairing | `ikb` is swiss-only; cannot lock on `editorial` |
| `fail-pairing-swiss-ink.json` | ColorTheme pairing | `ink` is editorial-only; cannot lock on `swiss` |
| `fail-invented-layout-masonry.json` | Layout whitelist | `masonry` is not one of the locked layouts |
| `fail-invented-variant-bullets-stacked.json` | Variant whitelist | `bullets` only allows `title-5`, not `stacked` |

How to replay:

```bash
pnpm exec tsx --test packages/ai/src/deckgen
# the "negative fixtures on disk" test loads this folder
```

Each JSON has `expect: "fail"`, `gate`, `reason`, and either `input` (full generate) or `plan` (layout/variant resolve).
