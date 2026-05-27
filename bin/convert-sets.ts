/**
 * Convert Pokémon TCG set logos and symbols from PNG to AVIF format
 *
 * This script processes cached set images (logos and symbols) and converts
 * them to optimized AVIF format. It also extracts logo dimensions for use
 * in the application.
 *
 * Features:
 * - Skips already converted files
 * - Polls for newly downloaded files (supports simultaneous download + convert)
 * - Extracts and saves logo dimensions to logodimensions.json
 * - Handles missing logos gracefully
 */

import * as fs from "fs";
import * as path from "path";
import {
  convertToAvif,
  fileExists,
  getImageDimensions,
  transparentAssetAvifOptions,
} from "./lib/convert";
import { assetsPath, cachePath, outPath } from "./lib/paths";

type SetAssetPaths = {
  code: string;
  logoFile: string;
  symbolFile: string;
  outputDir: string;
  logoOutput: string;
  symbolOutput: string;
};

const locale = "en-US";
const setsCachePath = path.join(cachePath, "sets", locale);
const initialCacheWaitMs = 5000;
const idleTimeoutMs = 5000;
const pollIntervalMs = 500;
const activeDownloadMarkerMaxAgeMs = 2 * 60 * 60 * 1000;

const dimensions: Record<string, { width: number; height: number }> = {};

// ============================================================================
// Process set logos and symbols
// ============================================================================

await convertCachedSets();

// ============================================================================
// Write logo dimensions to output
// ============================================================================

const outDir = path.join(outPath, locale);
await fs.promises.mkdir(outDir, { recursive: true });
const dimensionsFile = path.join(outDir, `logodimensions.json`);
await Bun.write(dimensionsFile, JSON.stringify(dimensions, null, 2));

// ============================================================================
// Helper functions
// ============================================================================

async function convertCachedSets(): Promise<void> {
  const hasCacheRoot = await waitForDirectory(setsCachePath, initialCacheWaitMs);
  if (!hasCacheRoot) {
    console.warn(`No set cache directory found: ${setsCachePath}`);
    return;
  }

  const processedLogos = new Set<string>();
  const processedSymbols = new Set<string>();
  let lastActivityAt = Date.now();

  while (true) {
    let convertedInPass = false;
    const setCodes = await listSetCodes();

    for (const code of setCodes) {
      const assetPaths = getSetAssetPaths(code);

      await fs.promises.mkdir(assetPaths.outputDir, { recursive: true });
      convertedInPass = (await processLogo(assetPaths, processedLogos)) || convertedInPass;
      convertedInPass = (await processSymbol(assetPaths, processedSymbols)) || convertedInPass;
    }

    if (convertedInPass) {
      lastActivityAt = Date.now();
      continue;
    }

    if (await hasActiveDownload()) {
      lastActivityAt = Date.now();
      await sleep(pollIntervalMs);
      continue;
    }

    if (Date.now() - lastActivityAt >= idleTimeoutMs) break;

    await sleep(pollIntervalMs);
  }
}

async function processLogo(
  assetPaths: SetAssetPaths,
  processedLogos: Set<string>,
): Promise<boolean> {
  if (processedLogos.has(assetPaths.code)) return false;

  let converted = false;
  let logoSuccess = false;
  const hasLogoOutput = fileExists(assetPaths.logoOutput);

  if (!hasLogoOutput && fileExists(assetPaths.logoFile)) {
    console.log(assetPaths.logoFile);
    try {
      await convertSetAsset(assetPaths.logoFile, assetPaths.logoOutput);
      logoSuccess = true;
      converted = true;
    } catch (e) {
      console.error(e);
    }
  } else if (hasLogoOutput) {
    logoSuccess = true;
  }

  if (logoSuccess && fileExists(assetPaths.logoFile)) {
    dimensions[assetPaths.code] = await getImageDimensions(assetPaths.logoFile);
    processedLogos.add(assetPaths.code);
  }

  return converted;
}

async function processSymbol(
  assetPaths: SetAssetPaths,
  processedSymbols: Set<string>,
): Promise<boolean> {
  if (processedSymbols.has(assetPaths.code)) return false;

  if (fileExists(assetPaths.symbolOutput)) {
    processedSymbols.add(assetPaths.code);
    return false;
  }

  if (!fileExists(assetPaths.symbolFile)) return false;

  console.log(assetPaths.symbolFile);
  try {
    await convertSetAsset(assetPaths.symbolFile, assetPaths.symbolOutput);
    processedSymbols.add(assetPaths.code);
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
}

async function convertSetAsset(inputFile: string, outputFile: string): Promise<void> {
  const temporaryOutputFile = getTempFile(outputFile);

  try {
    await convertToAvif(inputFile, temporaryOutputFile, transparentAssetAvifOptions);
    await fs.promises.rename(temporaryOutputFile, outputFile);
  } finally {
    await fs.promises.unlink(temporaryOutputFile).catch(() => {});
  }
}

async function listSetCodes(): Promise<string[]> {
  const entries = await readDirEntries(setsCachePath);
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((code) => code !== ".DS_Store")
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

async function readDirEntries(dir: string): Promise<fs.Dirent[]> {
  try {
    return await fs.promises.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return [];
    throw error;
  }
}

function getSetAssetPaths(code: string): SetAssetPaths {
  const logoFile = path.join(setsCachePath, code, "logo.png");
  const symbolFile = path.join(setsCachePath, code, "symbol.png");
  const outputDir = path.join(assetsPath, locale, code);

  return {
    code,
    logoFile,
    symbolFile,
    outputDir,
    logoOutput: path.join(outputDir, "logo.avif"),
    symbolOutput: path.join(outputDir, "symbol.avif"),
  };
}

function getTempFile(outputFile: string): string {
  const randomPart = Math.random().toString(36).slice(2);
  return path.join(
    path.dirname(outputFile),
    `.${path.basename(outputFile, ".avif")}.${randomPart}.avif`,
  );
}

async function hasActiveDownload(): Promise<boolean> {
  const entries = await readDirEntries(setsCachePath);

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.startsWith(".download-active.")) continue;

    const markerPath = path.join(setsCachePath, entry.name);
    const markerAgeMs = await fs.promises
      .stat(markerPath)
      .then((stat) => Date.now() - stat.mtimeMs)
      .catch(() => Number.POSITIVE_INFINITY);

    if (markerAgeMs < activeDownloadMarkerMaxAgeMs) return true;
  }

  return false;
}

async function waitForDirectory(dir: string, timeoutMs: number): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const isDirectory = await fs.promises
      .stat(dir)
      .then((stat) => stat.isDirectory())
      .catch(() => false);

    if (isDirectory) return true;
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
