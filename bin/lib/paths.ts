/**
 * Path configuration for Smeargle
 *
 * Defines standard paths for output, assets, cache, and temporary files.
 */

import envPaths from "env-paths";
import * as path from "path";

/** Output directory for generated files */
export const outPath = path.resolve(import.meta.dir, "../../out");

/** Assets directory for processed images */
export const assetsPath = path.resolve(import.meta.dir, "../../assets");

/** Source directory for downloaded image files */
export const srcPath = path.resolve(import.meta.dir, "../../src");

/** Environment-specific paths (cache, temp, etc.) */
export const paths = envPaths("smeargle");

/** Cache directory for downloaded files */
export const cachePath = paths.cache;

/** Temporary directory for intermediate files */
export const tmpPath = paths.temp;
