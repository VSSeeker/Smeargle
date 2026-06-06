/**
 * Convert Pokémon TCG card images from PNG to AVIF format
 *
 * This script processes cached regular card and foil images and converts them
 * to optimized AVIF format for use in the application. Regular cards are
 * encoded as card faces, while foils are converted to grayscale masks from
 * their green-channel texture.
 *
 * Features:
 * - Skips already converted files
 * - Polls for newly downloaded files (supports simultaneous download + convert)
 * - Retries failed conversions once with delay
 * - Processes cards in numerical order
 *
 * Options:
 * - --cards: Convert regular cards only
 * - --foils: Convert foils only
 */

import * as fs from "fs";
import * as path from "path";
import { parseCardImageKinds } from "./lib/card-selection";
import {
  cardAvifOptions,
  convertToAvif,
  extractFoilMask,
  fileExists,
  foilMaskAvifOptions,
  removeAlpha,
  waitForFile,
} from "./lib/convert";
import { formatImageUrlKey, parseImageUrlKey } from "./lib/image-keys";
import { writeSmeargleManifest } from "./lib/manifest";
import { assetsPath, cachePath } from "./lib/paths";

type CardCacheKind = {
  cacheSubdir: "cards" | "foils";
  label: string;
  outputSubdir?: string;
};

type CachedCardFile = {
  inputFile: string;
  locale: string;
  pathParts: string[];
  displayPath: string;
};

const cardCacheKinds: CardCacheKind[] = [
  { cacheSubdir: "cards", label: "card" },
  { cacheSubdir: "foils", label: "foil", outputSubdir: "foils" },
];
const selectedCardImageKinds = parseCardImageKinds({
  args: Bun.argv.slice(2),
  command: "bun ./bin/convert-cards.ts",
});
const selectedCardPaths = parseCardFilter(process.env.CARD_FILTER);
const selectedCardCacheKinds = cardCacheKinds.filter((cacheKind) =>
  selectedCardImageKinds.includes(cacheKind.cacheSubdir),
);

const initialCacheWaitMs = 5000;
const idleTimeoutMs = 5000;
const pollIntervalMs = 500;
const activeDownloadMarkerMaxAgeMs = 2 * 60 * 60 * 1000;

// ============================================================================
// Process cached regular and foil images
// ============================================================================

await convertCachedCards();
await writeSmeargleManifest();

// ============================================================================
// Helper functions
// ============================================================================

async function convertCachedCards(): Promise<void> {
  const cacheRoots = selectedCardCacheKinds.map((cacheKind) => getCacheRoot(cacheKind));
  const hasCacheRoot = await waitForAnyDirectory(cacheRoots, initialCacheWaitMs);
  if (!hasCacheRoot) {
    console.warn(`No card cache directories found in ${cachePath}`);
    return;
  }

  const processedFiles = new Set<string>();
  let lastActivityAt = Date.now();

  while (true) {
    let convertedInPass = false;

    for (const cacheKind of selectedCardCacheKinds) {
      const cachedFiles = await listCachedCardFiles(getCacheRoot(cacheKind));

      for (const cachedFile of cachedFiles) {
        const processedKey = `${cacheKind.cacheSubdir}:${cachedFile.inputFile}`;
        if (processedFiles.has(processedKey)) continue;

        const outputFile = getOutputFile(cacheKind, cachedFile);
        if (selectedCardPaths && !selectedCardPaths.has(cachedFile.displayPath)) {
          processedFiles.add(processedKey);
          continue;
        }
        if (fileExists(outputFile)) {
          processedFiles.add(processedKey);
          continue;
        }

        await fs.promises.mkdir(path.dirname(outputFile), { recursive: true });
        console.log(`[${cachedFile.locale}] ${cachedFile.displayPath} ${cacheKind.label}`);

        await convertCardWithRetry(cacheKind, cachedFile.inputFile, outputFile);
        processedFiles.add(processedKey);
        convertedInPass = true;
      }
    }

    if (convertedInPass) {
      lastActivityAt = Date.now();
      continue;
    }

    if (await hasActiveDownloads()) {
      lastActivityAt = Date.now();
      await sleep(pollIntervalMs);
      continue;
    }

    if (Date.now() - lastActivityAt >= idleTimeoutMs) break;

    await sleep(pollIntervalMs);
  }
}

async function listCachedCardFiles(cacheRoot: string): Promise<CachedCardFile[]> {
  const cachedFiles: CachedCardFile[] = [];
  const localeEntries = await readDirEntries(cacheRoot);

  for (const localeEntry of localeEntries) {
    if (!localeEntry.isDirectory()) continue;

    const locale = localeEntry.name;
    await collectCachedCardFiles(path.join(cacheRoot, locale), locale, [], cachedFiles);
  }

  return cachedFiles.sort(compareCachedCards);
}

async function collectCachedCardFiles(
  currentDir: string,
  locale: string,
  pathParts: string[],
  cachedFiles: CachedCardFile[],
): Promise<void> {
  const entries = await readDirEntries(currentDir);

  for (const entry of entries) {
    const entryPath = path.join(currentDir, entry.name);

    if (entry.isDirectory()) {
      await collectCachedCardFiles(entryPath, locale, [...pathParts, entry.name], cachedFiles);
      continue;
    }

    if (!entry.isFile() || !entry.name.endsWith(".png")) continue;

    const cachedPathParts = [...pathParts, path.basename(entry.name, ".png")];
    cachedFiles.push({
      inputFile: entryPath,
      locale,
      pathParts: cachedPathParts,
      displayPath: formatImageUrlKey(cachedPathParts),
    });
  }
}

async function readDirEntries(dir: string): Promise<fs.Dirent[]> {
  try {
    return await fs.promises.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return [];
    throw error;
  }
}

function compareCachedCards(a: CachedCardFile, b: CachedCardFile): number {
  return (
    a.locale.localeCompare(b.locale) ||
    a.displayPath.localeCompare(b.displayPath, undefined, { numeric: true })
  );
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

function getCacheRoot(cacheKind: CardCacheKind): string {
  return path.join(cachePath, cacheKind.cacheSubdir);
}

async function hasActiveDownloads(): Promise<boolean> {
  for (const cacheKind of selectedCardCacheKinds) {
    const cacheRoot = getCacheRoot(cacheKind);
    const rootEntries = await readDirEntries(cacheRoot);

    for (const rootEntry of rootEntries) {
      if (!rootEntry.isFile() || !rootEntry.name.startsWith(".download-active.")) continue;

      const markerPath = path.join(cacheRoot, rootEntry.name);
      const markerAgeMs = await fs.promises
        .stat(markerPath)
        .then((stat) => Date.now() - stat.mtimeMs)
        .catch(() => Number.POSITIVE_INFINITY);

      if (markerAgeMs < activeDownloadMarkerMaxAgeMs) return true;
    }
  }

  return false;
}

function getOutputFile(cacheKind: CardCacheKind, cachedFile: CachedCardFile): string {
  const cardName = cachedFile.pathParts.at(-1);
  if (!cardName) {
    throw new Error(`Invalid cached card path: ${cachedFile.inputFile}`);
  }

  const parentPathParts = cachedFile.pathParts.slice(0, -1);
  if (cacheKind.outputSubdir) {
    return path.join(
      assetsPath,
      cachedFile.locale,
      ...parentPathParts,
      cacheKind.outputSubdir,
      `${cardName}.avif`,
    );
  }

  return path.join(assetsPath, cachedFile.locale, ...parentPathParts, `${cardName}.avif`);
}

/**
 * Convert a card from PNG to AVIF with retry logic.
 *
 * Waits for the source file to exist (up to 5s) to support simultaneous
 * download + convert operations. Retries once after 5s delay on failure.
 *
 * @param inputFile - Path to source PNG file
 * @param outputFile - Path to output AVIF file
 */
async function convertCardWithRetry(
  cacheKind: CardCacheKind,
  inputFile: string,
  outputFile: string,
): Promise<void> {
  const maxAttempts = 2;
  const retryDelayMs = 5000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Wait for source file to exist (supports simultaneous download + convert)
      const sourceFileExists = await waitForFile(inputFile);
      if (!sourceFileExists) {
        throw new Error(`Source file does not exist: ${inputFile}`);
      }

      const intermediateFile = getTempFile(outputFile, ".png");
      const temporaryOutputFile = getTempFile(outputFile, ".avif");

      try {
        if (cacheKind.cacheSubdir === "foils") {
          await extractFoilMask(inputFile, intermediateFile);
          await convertToAvif(intermediateFile, temporaryOutputFile, foilMaskAvifOptions);
        } else {
          await removeAlpha(inputFile, intermediateFile);
          await convertToAvif(intermediateFile, temporaryOutputFile, cardAvifOptions);
        }

        await fs.promises.rename(temporaryOutputFile, outputFile);
      } finally {
        await fs.promises.unlink(intermediateFile).catch(() => {});
        await fs.promises.unlink(temporaryOutputFile).catch(() => {});
      }

      return;
    } catch (e) {
      if (attempt < maxAttempts) {
        console.error(`Failed, retrying in ${retryDelayMs}ms...`);
        await sleep(retryDelayMs);
      } else {
        throw e;
      }
    }
  }
}

function getTempFile(outputFile: string, extension: string): string {
  const randomPart = Math.random().toString(36).slice(2);
  return path.join(
    path.dirname(outputFile),
    `.${path.basename(outputFile, ".avif")}.${randomPart}${extension}`,
  );
}

async function waitForAnyDirectory(dirs: string[], timeoutMs: number): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    for (const dir of dirs) {
      const isDirectory = await fs.promises
        .stat(dir)
        .then((stat) => stat.isDirectory())
        .catch(() => false);

      if (isDirectory) return true;
    }

    await sleep(pollIntervalMs);
  }

  return false;
}

function isNodeError(error: unknown): error is Error & { code: string } {
  return error instanceof Error && "code" in error;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
