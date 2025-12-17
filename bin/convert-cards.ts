/**
 * Convert Pokémon TCG card images from PNG to AVIF format
 *
 * This script processes cached card images and converts them to optimized AVIF
 * format for use in the application. It removes alpha channels and applies
 * compression to reduce file size while maintaining quality.
 *
 * Features:
 * - Skips already converted files
 * - Waits for source files to exist (supports simultaneous download + convert)
 * - Retries failed conversions once with delay
 * - Processes cards in numerical order
 */

import * as fs from "fs";
import * as path from "path";
import { $ } from "zx";
import { locales } from "./locales";
import { cachePath, tmpPath } from "./lib/paths";
import { waitForFile } from "./lib/convert";

const cardsDir = path.join(cachePath, "cards");
const alphalessFile = path.join(tmpPath, "alphaless.png");

await fs.promises.mkdir(tmpPath, { recursive: true });

// ============================================================================
// Process all locales and sets
// ============================================================================

for (const locale of locales) {
  const localeDir = path.join(cardsDir, locale);
  const setIds = await fs.promises.readdir(localeDir);

  for (const setId of setIds) {
    const setDir = path.join(localeDir, setId);
    const setFiles = await fs.promises.readdir(setDir);
    const outputDir = path.resolve("assets/", locale, setId);

    await fs.promises.mkdir(outputDir, { recursive: true });

    // Sort files numerically by card number
    const filesOrdered = setFiles.sort(
      (a, b) => Number(a.replace(/[^\d]/g, "")) - Number(b.replace(/[^\d]/g, "")),
    );

    for (const file of filesOrdered) {
      const cardName = path.basename(file, ".png");
      const inputFile = path.join(setDir, file);
      const outputFile = path.join(outputDir, `${cardName}.avif`);

      // Skip if already converted
      try {
        await fs.promises.access(outputFile);
        continue;
      } catch {}

      console.log(`[${locale}] ${setId} ${cardName}`);

      // Wait for source file and convert with retry
      await convertCardWithRetry(inputFile, outputFile);
    }
  }
}

// ============================================================================
// Helper functions
// ============================================================================

/**
 * Convert a card from PNG to AVIF with retry logic
 *
 * Waits for the source file to exist (up to 5s) to support simultaneous
 * download + convert operations. Retries once after 5s delay on failure.
 *
 * @param inputFile - Path to source PNG file
 * @param outputFile - Path to output AVIF file
 */
async function convertCardWithRetry(inputFile: string, outputFile: string): Promise<void> {
  const maxAttempts = 2;
  const retryDelayMs = 5000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Wait for source file to exist (supports simultaneous download + convert)
      const fileExists = await waitForFile(inputFile);
      if (!fileExists) {
        throw new Error(`Source file does not exist: ${inputFile}`);
      }

      // Remove alpha layer from input file, then encode to AVIF
      // avifenc only supports piping from stdin for .y4m files, so we use a temp file
      await $`magick convert ${inputFile} -alpha off ${alphalessFile}`.quiet();
      await $`avifenc -q 30 --speed 1 --premultiply --jobs all -y 420 ${alphalessFile} ${outputFile}`.quiet();

      return;
    } catch (e) {
      if (attempt < maxAttempts) {
        console.error(`Failed, retrying in ${retryDelayMs}ms...`);
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      } else {
        throw e;
      }
    }
  }
}
