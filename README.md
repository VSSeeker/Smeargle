# Smeargle

Smeargle provides imagery from the Pokemon Trading Card Game.

Card images, set logos, and set symbols are available in optimized AVIF format.
Downloaded set PNG sources are stored in `src/sets`; the platform cache is used for card originals.

Powered by malie.io (which sources data from PTCGO and PTCGL), Bulbapedia, and [CardMavin](https://cardmavin.com/pokemon/pokemon-card-set-symbols).

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
