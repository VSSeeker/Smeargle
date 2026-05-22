/**
 * Download Pokémon TCG card images from Malie's CDN
 *
 * This script downloads regular card images and foil card images using
 * malieimages.json and maliefoils.json respectively.
 *
 * Environment variables:
 * - OVERRIDE_CARDS=1: Re-download cards even if already in cache
 * - DOWNLOAD_EXISTING_CARDS=1: Download cards even if already in assets
 *
 * Options:
 * - --cards: Download regular cards only
 * - --foils: Download foils only
 */

import * as fs from "fs";
import * as path from "path";

import { locales } from "./locales";
import imageUrls from "./malieimages.json";
import foilUrls from "./maliefoils.json";
import { parseCardImageKinds } from "./lib/card-selection";
import { assetsPath, cachePath } from "./lib/paths";
import { downloadFile } from "./lib/download";

const OVERRIDE_CARDS = process.env.OVERRIDE_CARDS === "1";
const DOWNLOAD_EXISTING_CARDS = process.env.DOWNLOAD_EXISTING_CARDS === "1";
const selectedCardImageKinds = parseCardImageKinds({
  args: Bun.argv.slice(2),
  command: "bun ./bin/download-cards-malie.ts",
});

for (const cardImageKind of selectedCardImageKinds) {
  if (cardImageKind === "cards") {
    await downloadCards(imageUrls, "cards");
  } else {
    await downloadCards(foilUrls, "foils");
  }
}

// ============================================================================
// Helper functions
// ============================================================================

/**
 * Download card images from a URL mapping
 *
 * @param urlMap - Mapping of "set/cardNum" => "downloadUrl"
 * @param cacheSubdir - Cache subdirectory (e.g., "cards" or "foils")
 */
async function downloadCards(urlMap: Record<string, string>, cacheSubdir: "cards" | "foils") {
  const cacheRoot = path.join(cachePath, cacheSubdir);
  const downloadMarker = path.join(cacheRoot, `.download-active.${process.pid}`);

  await fs.promises.mkdir(cacheRoot, { recursive: true });
  await Bun.write(downloadMarker, `${process.pid}\n`);

  try {
    for (const [cardPath, downloadUrl] of Object.entries(urlMap)) {
      const [set, cardNum] = cardPath.split("/");
      if (!set || !cardNum) {
        throw new Error(`Invalid card path: ${cardPath}`);
      }

      for (const locale of locales) {
        const setCachePath = path.join(cacheRoot, locale, set);
        const outputFile = getAssetPath(cacheSubdir, locale, set, cardNum);

        // Skip if already formatted in assets (unless DOWNLOAD_EXISTING_CARDS is set)
        if (!DOWNLOAD_EXISTING_CARDS && fs.existsSync(outputFile)) {
          console.log(`${cardPath} already formatted [${locale}] [Skipped]`);
          continue;
        }

        await fs.promises.mkdir(setCachePath, { recursive: true });
        await fs.promises.mkdir(path.dirname(outputFile), { recursive: true });

        const setStatusText = `[${locale}] ${cardPath}`;
        const cacheFileName = path.join(setCachePath, `${cardNum}.png`);

        // Skip if already in cache (unless OVERRIDE_CARDS is set)
        if (!OVERRIDE_CARDS && fs.existsSync(cacheFileName)) {
          console.log(`${setStatusText} already downloaded [Skipped]`);
          continue;
        }

        console.log(`${setStatusText}`);

        // Retry logic for network failures (30s timeout, 3 retries)
        let attempt = 0;
        const maxAttempts = 3;
        const timeoutMs = 30000;
        while (attempt < maxAttempts) {
          attempt += 1;
          try {
            await downloadFile(downloadUrl, cacheFileName, {
              signal: AbortSignal.timeout(timeoutMs),
            });
            break;
          } catch (e) {
            if (attempt === maxAttempts) throw e;
          }
        }
      }
    }
  } finally {
    await fs.promises.unlink(downloadMarker).catch(() => {});
  }
}

function getAssetPath(
  cacheSubdir: "cards" | "foils",
  locale: string,
  set: string,
  cardNum: string,
): string {
  const setAssetsPath = path.join(assetsPath, locale, set);
  if (cacheSubdir === "foils") {
    return path.join(setAssetsPath, "foils", `${cardNum}.avif`);
  }
  return path.join(setAssetsPath, `${cardNum}.avif`);
}
