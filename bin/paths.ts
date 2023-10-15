import envPaths from "env-paths";

export const assetsPath = path.resolve(import.meta.dir, "../assets");
export const paths = envPaths("smeargle");
export const cachePath = paths.cache;
export const tmpPath = paths.temp;
