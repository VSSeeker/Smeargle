/**
 * Shared conversion utilities for image processing
 */

import { $ } from "zx";
import * as fs from "fs";

/**
 * Convert an image to AVIF format
 *
 * @param inputFile - Path to source image file
 * @param outputFile - Path to output AVIF file
 * @param quality - AVIF quality (0-100, default 30)
 * @throws Error if conversion fails
 */
export async function convertToAvif(
  inputFile: string,
  outputFile: string,
  quality: number = 30,
): Promise<void> {
  await $`avifenc -q ${quality} --speed 1 --premultiply --jobs all -y 420 ${inputFile} ${outputFile}`.quiet();
}

/**
 * Get image dimensions using ImageMagick
 *
 * @param imagePath - Path to image file
 * @returns Object with width and height
 */
export async function getImageDimensions(
  imagePath: string,
): Promise<{ width: number; height: number }> {
  const dim = await $`magick identify -format "%wx%h" ${imagePath}`.quiet();
  const [width, height] = dim.stdout.trim().split("x").map(Number);
  return { width, height };
}

/**
 * Check if a file exists
 *
 * @param filePath - Path to check
 * @returns true if file exists, false otherwise
 */
export function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

/**
 * Wait for a file to exist, with timeout
 *
 * @param filePath - Path to the file
 * @param timeoutMs - Maximum time to wait in milliseconds
 * @param checkIntervalMs - How often to check for the file
 * @returns true if file exists, false if timeout
 */
export async function waitForFile(
  filePath: string,
  timeoutMs: number = 5000,
  checkIntervalMs: number = 100,
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      await fs.promises.access(filePath);
      return true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, checkIntervalMs));
    }
  }

  return false;
}
