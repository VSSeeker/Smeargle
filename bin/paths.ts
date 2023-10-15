import envPaths from "env-paths";
import * as path from "path";

export const outPath = path.resolve(import.meta.dir, "../out");
export const assetsPath = path.resolve(import.meta.dir, "../assets");
export const paths = envPaths("smeargle");
export const cachePath = paths.cache;
export const tmpPath = paths.temp;
