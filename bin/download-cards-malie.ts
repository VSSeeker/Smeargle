/**
 * Download Pokémon TCG card images from Malie's CDN
 *
 * This script downloads regular card images and foil card images using
 * malieimages.json and maliefoils.json respectively.
 *
 * Environment variables:
 * - OVERRIDE_CARDS=1: Re-download cards even if already in cache
 * - DOWNLOAD_EXISTING_CARDS=1: Download cards even if already in assets
 */

import "zx/globals";
import * as fs from "fs";

import { locales } from "./locales";
import imageUrls from "./malieimages.json";
import foilUrls from "./maliefoils.json";
import { assetsPath, cachePath } from "./lib/paths";

const OVERRIDE_CARDS = process.env.OVERRIDE_CARDS === "1";
const DOWNLOAD_EXISTING_CARDS = process.env.DOWNLOAD_EXISTING_CARDS === "1";

// Download regular cards first, then foils
await downloadCards(imageUrls, "cards");
await downloadCards(foilUrls, "foils");

// ============================================================================
// Helper functions
// ============================================================================

/**
 * Download card images from a URL mapping
 *
 * @param urlMap - Mapping of "set/cardNum" => "downloadUrl"
 * @param cacheSubdir - Cache subdirectory (e.g., "cards" or "foils")
 */
async function downloadCards(urlMap: Record<string, unknown>, cacheSubdir: string) {
  const sets = new Set<string>();

  for (const [cardPath, downloadUrl] of Object.entries(urlMap)) {
    const [set, cardNum] = cardPath.split("/");

    // Skip if already formatted in assets (unless DOWNLOAD_EXISTING_CARDS is set)
    // Check only once per card, not per locale
    if (!DOWNLOAD_EXISTING_CARDS) {
      const firstLocaleAssetPath = path.join(assetsPath, locales[0], set, `${cardNum}.avif`);
      if (fs.existsSync(firstLocaleAssetPath)) {
        console.log(`${cardPath} already formatted [Skipped all locales]`);
        continue;
      }
    }

    for (const locale of locales) {
      const setCachePath = path.join(cachePath, cacheSubdir, locale, set);
      const setAssetsPath = path.join(assetsPath, locale, set);

      // Create directories on first encounter of each set
      if (!sets.has(set)) {
        await fs.promises.mkdir(setCachePath, { recursive: true });
        await fs.promises.mkdir(setAssetsPath, { recursive: true });
        sets.add(set);
      }

      const setStatusText = `[${locale}] ${cardPath}`;
      const cacheFileName = path.join(setCachePath, `${cardNum}.png`);

      // Skip if already in cache (unless OVERRIDE_CARDS is set)
      if (!OVERRIDE_CARDS && fs.existsSync(cacheFileName)) {
        console.log(`${setStatusText} already downloaded [Skipped]`);
        continue;
      }

      console.log(`${setStatusText}`);

      // Retry logic for network failures
      let attempt = 0;
      const maxAttempts = 5;
      while (attempt < maxAttempts) {
        attempt += 1;
        try {
          await Bun.write(
            cacheFileName,
            await fetch(downloadUrl as string).then((r) => r.arrayBuffer()),
          );
          break;
        } catch (e) {
          if (attempt === maxAttempts) throw e;
        }
      }
    }
  }
}
