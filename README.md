# Smeargle

Smeargle provides imagery from the Pokemon Trading Card Game.

Card images, set logos, and set symbols are available in optimized AVIF format.
Downloaded set PNG sources are stored in `src/sets`; the platform cache is used for card originals.

Powered by VSSeeker's Rotom image manifest, malie.io (which sources data from PTCGO and
PTCGL), Bulbapedia, and [CardMavin](https://cardmavin.com/pokemon/pokemon-card-set-symbols).

Rotom syncs a single `bin/imageurls.json` manifest for modern physical, legacy physical, and
Pocket card masters. Physical keys use print refs such as `BS#4`; Pocket keys use
`PKT/A1#001`. Smeargle converts those keys into stable cache and `assets` paths.

## System dependencies

- Bun
- ImageMagick
- avifenc (libavif)

## Card image selectors

Card downloads and conversions process regular cards and foils by default. Pass a selector to
process only one kind:

```bash
bun run download-cards:cards
bun run download-cards:foils
bun run convert-cards:cards
bun run convert-cards:foils
```

The underlying scripts also accept `--cards` or `--foils` directly.

Use `DRY_RUN_CARDS=1 bun run download-cards:cards` to validate the current card manifest and cache
paths without fetching images.
Use `CARD_FILTER=BS/4,PKT/A1/001` with `download-cards` or `convert-cards` to process a small
set of canonical print IDs.
