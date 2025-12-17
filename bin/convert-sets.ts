/**
 * Convert Pokémon TCG set logos and symbols from PNG to AVIF format
 *
 * This script processes cached set images (logos and symbols) and converts
 * them to optimized AVIF format. It also extracts logo dimensions for use
 * in the application.
 *
 * Features:
 * - Skips already converted files
 * - Extracts and saves logo dimensions to logodimensions.json
 * - Handles missing logos gracefully
 */

import * as fs from "fs";
import * as path from "path";
import { assetsPath, cachePath, outPath } from "./lib/paths";
import { convertToAvif, fileExists, getImageDimensions } from "./lib/convert";

const locale = "en-US";
const setsCachePath = path.join(cachePath, "sets", locale);

const dimensions: Record<string, { width: number; height: number }> = {};

// ============================================================================
// Process all set codes
// ============================================================================

const setCodes = fs.readdirSync(setsCachePath);

for (const code of setCodes) {
  if (code === ".DS_Store") continue;
  console.log(code);

  const logoFile = path.join(setsCachePath, code, "logo.png");
  const symbolFile = path.join(setsCachePath, code, "symbol.png");
  const outputDir = path.join(assetsPath, locale, code);
  const logoOutput = path.join(outputDir, "logo.avif");
  const symbolOutput = path.join(outputDir, "symbol.avif");

  await fs.promises.mkdir(outputDir, { recursive: true });

  // Convert logo if not already converted
  let logoSuccess = false;
  const hasLogoOutput = fileExists(logoOutput);
  if (!hasLogoOutput && fileExists(logoFile)) {
    console.log(logoFile);
    try {
      await convertToAvif(logoFile, logoOutput);
      logoSuccess = true;
    } catch (e) {
      console.error(e);
    }
  } else if (hasLogoOutput) {
    logoSuccess = true;
  }

  // Convert symbol if not already converted
  if (!fileExists(symbolOutput) && fileExists(symbolFile)) {
    console.log(symbolFile);
    try {
      await convertToAvif(symbolFile, symbolOutput);
    } catch (e) {
      console.error(e);
    }
  }

  // Extract logo dimensions for successfully converted logos
  if (logoSuccess && fileExists(logoFile)) {
    dimensions[code] = await getImageDimensions(logoFile);
  }
}

// ============================================================================
// Write logo dimensions to output
// ============================================================================

const outDir = path.join(outPath, locale);
await fs.promises.mkdir(outDir, { recursive: true });
const dimensionsFile = path.join(outDir, `logodimensions.json`);
await Bun.write(dimensionsFile, JSON.stringify(dimensions, null, 2));
