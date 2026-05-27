/**
 * Shared conversion utilities for image processing
 */

import { $ } from "bun";
import * as fs from "fs";

type AvifYuvFormat = "auto" | "444" | "422" | "420" | "400";

export type AvifOptions = {
  quality?: number;
  alphaQuality?: number;
  speed?: number;
  yuv?: AvifYuvFormat;
  premultiply?: boolean;
  sharpYuv?: boolean;
  stripMetadata?: boolean;
};

export const cardAvifOptions: AvifOptions = {
  quality: 40,
  speed: 4,
  yuv: "420",
  sharpYuv: true,
  stripMetadata: true,
};

export const transparentAssetAvifOptions: AvifOptions = {
  quality: 55,
  alphaQuality: 95,
  speed: 4,
  yuv: "444",
  premultiply: true,
  stripMetadata: true,
};

export const foilMaskAvifOptions: AvifOptions = {
  quality: 55,
  speed: 4,
  yuv: "400",
  stripMetadata: true,
};

/**
 * Convert an image to AVIF format
 *
 * @param inputFile - Path to source image file
 * @param outputFile - Path to output AVIF file
 * @param options - AVIF encoder options
 * @throws Error if conversion fails
 */
export async function convertToAvif(
  inputFile: string,
  outputFile: string,
  options: AvifOptions = {},
): Promise<void> {
  const {
    quality = 40,
    alphaQuality,
    speed = 4,
    yuv = "auto",
    premultiply = false,
    sharpYuv = false,
    stripMetadata = false,
  } = options;

  const args = ["avifenc", "-q", String(quality), "--speed", String(speed), "-y", yuv];

  if (alphaQuality !== undefined) {
    args.push("--qalpha", String(alphaQuality));
  }

  if (premultiply) {
    args.push("--premultiply");
  }

  if (sharpYuv && yuv === "420") {
    args.push("--sharpyuv");
  }

  if (stripMetadata) {
    args.push("--ignore-exif", "--ignore-xmp");
  }

  args.push(inputFile, outputFile);

  await runCommand(args);
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
  const dim = await $`magick identify -format "%wx%h" ${imagePath}`.quiet().text();
  const [width, height] = dim.trim().split("x").map(Number);
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

/**
 * Remove alpha channel from an image using ImageMagick
 *
 * @param inputFile - Path to source image file
 * @param outputFile - Path to output image file
 */
export async function removeAlpha(inputFile: string, outputFile: string): Promise<void> {
  await $`magick convert ${inputFile} -alpha off ${outputFile}`.quiet();
}

/**
 * Extract the green-channel foil texture into a single-channel PNG mask.
 *
 * @param inputFile - Path to source foil PNG file
 * @param outputFile - Path to output grayscale PNG file
 */
export async function extractFoilMask(inputFile: string, outputFile: string): Promise<void> {
  await $`magick ${inputFile} -alpha off -channel G -separate ${outputFile}`.quiet();
}

async function runCommand(args: string[]): Promise<void> {
  const proc = Bun.spawn(args, {
    stdout: "ignore",
    stderr: "pipe",
  });

  const [exitCode, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()]);

  if (exitCode !== 0) {
    throw new Error(`${args[0]} failed with exit code ${exitCode}: ${stderr.trim()}`);
  }
}
