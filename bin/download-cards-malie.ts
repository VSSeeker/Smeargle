/**
 * Download Pokémon TCG card images from the Rotom image URL manifest.
 *
 * This script downloads regular card images and foil card images using
 * `imageurls.json`.
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
import { parseCardImageKinds } from "./lib/card-selection";
import { downloadFile } from "./lib/download";
import { parseImageUrlKey } from "./lib/image-keys";
import { assetsPath, cachePath } from "./lib/paths";

const OVERRIDE_CARDS = process.env.OVERRIDE_CARDS === "1";
const DOWNLOAD_EXISTING_CARDS = process.env.DOWNLOAD_EXISTING_CARDS === "1";
const DRY_RUN_CARDS = process.env.DRY_RUN_CARDS === "1";
const selectedCardPaths = parseCardFilter(process.env.CARD_FILTER);
const selectedCardImageKinds = parseCardImageKinds({
  args: Bun.argv.slice(2),
  command: "bun ./bin/download-cards-malie.ts",
});
const imageBuckets = await readImageBuckets();

for (const cardImageKind of selectedCardImageKinds) {
  if (cardImageKind === "cards") {
    await downloadCards(imageBuckets.cards, "cards");
  } else {
    await downloadCards(imageBuckets.foils, "foils");
  }
}

async function downloadCards(entries: CardDownloadEntry[], cacheSubdir: "cards" | "foils") {
  const cacheRoot = path.join(cachePath, cacheSubdir);
  const downloadMarker = path.join(cacheRoot, `.download-active.${process.pid}`);

  if (DRY_RUN_CARDS) {
    dryRunCards(entries, cacheRoot, cacheSubdir);
    return;
  }

  await fs.promises.mkdir(cacheRoot, { recursive: true });
  await Bun.write(downloadMarker, `${process.pid}\n`);

  try {
    for (const { imageKey, url } of entries) {
      if (selectedCardPaths && !selectedCardPaths.has(imageKey)) {
        continue;
      }
      const cardPathParts = parseImageUrlKey(imageKey);

      for (const locale of locales) {
        const outputFile = getAssetPath(cacheSubdir, locale, cardPathParts);
        if (!DOWNLOAD_EXISTING_CARDS && fs.existsSync(outputFile)) {
          console.log(`${imageKey} already formatted [${locale}] [Skipped]`);
          continue;
        }

        await fs.promises.mkdir(path.dirname(outputFile), { recursive: true });

        const setStatusText = `[${locale}] ${imageKey}`;
        const cacheFileName = getCachePath(cacheRoot, locale, cardPathParts);
        await fs.promises.mkdir(path.dirname(cacheFileName), { recursive: true });

        if (!OVERRIDE_CARDS && fs.existsSync(cacheFileName)) {
          console.log(`${setStatusText} already downloaded [Skipped]`);
          continue;
        }

        console.log(`${setStatusText}`);

        let attempt = 0;
        const maxAttempts = 3;
        const timeoutMs = 30000;
        while (attempt < maxAttempts) {
          attempt += 1;
          try {
            await downloadFile(url, cacheFileName, {
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

function dryRunCards(
  entries: CardDownloadEntry[],
  cacheRoot: string,
  cacheSubdir: "cards" | "foils",
): void {
  let alreadyFormatted = 0;
  let alreadyDownloaded = 0;
  let pendingDownload = 0;
  let selectedEntries = 0;

  for (const { imageKey } of entries) {
    if (selectedCardPaths && !selectedCardPaths.has(imageKey)) {
      continue;
    }
    selectedEntries += 1;
    const cardPathParts = parseImageUrlKey(imageKey);

    for (const locale of locales) {
      const outputFile = getAssetPath(cacheSubdir, locale, cardPathParts);
      const cacheFileName = getCachePath(cacheRoot, locale, cardPathParts);

      if (fs.existsSync(outputFile)) {
        alreadyFormatted += 1;
      } else if (fs.existsSync(cacheFileName)) {
        alreadyDownloaded += 1;
      } else {
        pendingDownload += 1;
      }
    }
  }

  console.log(
    [
      `${cacheSubdir} dry run: ${selectedEntries} manifest entries across ${locales.length} locale(s)`,
      `${alreadyFormatted} already formatted`,
      `${alreadyDownloaded} already downloaded`,
      `${pendingDownload} pending download`,
    ].join(", "),
  );
}

type CardDownloadEntry = {
  imageKey: string;
  url: string;
};

type ImageUrlManifest = {
  cards: Record<string, string>;
  foils: Record<string, string>;
};

type ImageBuckets = Record<"cards" | "foils", CardDownloadEntry[]>;

async function readImageBuckets(): Promise<ImageBuckets> {
  const manifestPath = path.join(import.meta.dir, "imageurls.json");
  const manifest = (await Bun.file(manifestPath).json()) as Partial<ImageUrlManifest>;

  return {
    cards: entriesFromBucket("imageurls.json", "cards", manifest.cards),
    foils: entriesFromBucket("imageurls.json", "foils", manifest.foils),
  };
}

function entriesFromBucket(
  fileName: string,
  bucketName: keyof ImageUrlManifest,
  bucket: unknown,
): CardDownloadEntry[] {
  if (!isRecord(bucket)) {
    throw new Error(`${fileName}.${bucketName} must contain a JSON object`);
  }

  return Object.entries(bucket).map(([imageKey, url]) => {
    if (typeof url !== "string" || !url) {
      throw new Error(`${fileName}.${bucketName}.${imageKey} must be a non-empty URL string`);
    }

    parseImageUrlKey(imageKey);
    assertHttpUrl(url, `${fileName}.${bucketName}.${imageKey}`);
    return { imageKey, url };
  });
}

function parseCardFilter(value: string | undefined): Set<string> | undefined {
  const cardPaths = value
    ?.split(",")
    .map((cardPath) => cardPath.trim())
    .filter(Boolean);
  if (!cardPaths?.length) return undefined;

  for (const cardPath of cardPaths) {
    parseImageUrlKey(cardPath);
  }
  return new Set(cardPaths);
}

function getCachePath(cacheRoot: string, locale: string, cardPathParts: string[]): string {
  const cardName = cardPathParts.at(-1);
  if (!cardName) {
    throw new Error(`Invalid card path: ${cardPathParts.join("/")}`);
  }

  return path.join(cacheRoot, locale, ...cardPathParts.slice(0, -1), `${cardName}.png`);
}

function getAssetPath(
  cacheSubdir: "cards" | "foils",
  locale: string,
  cardPathParts: string[],
): string {
  const cardName = cardPathParts.at(-1);
  if (!cardName) {
    throw new Error(`Invalid card path: ${cardPathParts.join("/")}`);
  }

  const parentPathParts = cardPathParts.slice(0, -1);
  if (cacheSubdir === "foils") {
    return path.join(assetsPath, locale, ...parentPathParts, "foils", `${cardName}.avif`);
  }
  return path.join(assetsPath, locale, ...parentPathParts, `${cardName}.avif`);
}

function assertHttpUrl(url: string, label: string): void {
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    throw new Error(`${label} must be an HTTP(S) URL`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
