# AGENTS.md

## Project Overview

Smeargle is a Pokémon TCG image asset pipeline that downloads card images, set logos, and set symbols from various sources (malie.io, Bulbapedia, CardMavin), then converts them to optimized AVIF format.

## Tech Stack

- **Runtime**: Bun
- **Language**: TypeScript (ESNext modules)
- **Formatter/Linter**: Biome
- **External Tools**: ImageMagick, libavif (avifenc)

## Project Structure

```
bin/                    # CLI scripts (run with `bun ./bin/<script>.ts`)
  download-cards-malie.ts  # Downloads card images from Rotom's imageurls.json
  download-sets.ts         # Downloads set logos and symbols
  convert-cards.ts         # Converts card PNGs to AVIF
  convert-sets.ts          # Converts set asset PNGs to AVIF
  lib/                     # Shared utilities
    paths.ts               # Cache and asset path definitions
    convert.ts             # Image conversion helpers
  locales.ts               # Supported locale list
  imageurls.json           # Card/foil image URL mappings from Rotom
assets/                 # Output AVIF images (by locale/set)
src/                    # Downloaded set PNG source images mirrored from cache
out/                    # Additional output
```

## Common Commands

```bash
bun run download-cards   # Download card images to cache
bun run download-sets    # Download set logos/symbols to cache
bun run convert-cards    # Convert cached cards to AVIF
bun run convert-sets     # Convert cached sets to AVIF
bun run format           # Format code with Biome
bun run check            # Check code with Biome
```

## Code Style

- 2-space indentation
- Double quotes, semicolons, trailing commas
- Line width: 100 characters
- Follow existing patterns in `bin/` scripts

## Environment Variables

- `OVERRIDE_CARDS=1`: Re-download cards even if cached
- `DOWNLOAD_EXISTING_CARDS=1`: Download even if already in assets
- `DRY_RUN_CARDS=1`: Validate card manifest paths without fetching images
- `CARD_FILTER=BS#4,PKT/A1#001`: Process only specific canonical print IDs

## Notes

- Download and convert scripts can run simultaneously (convert waits for files)
- Downloaded set PNG sources are mirrored to `src/sets` and cached via `env-paths`
- Assets are organized by locale, then by set ID
