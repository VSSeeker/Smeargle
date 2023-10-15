import { assetsPath, cachePath, outPath } from "./paths";

import * as fs from "fs";
import * as path from "path";
import { $ } from "zx";

const locale = "en-US";

const setsCachePath = path.join(cachePath, "sets", locale);

const dimensions: Record<string, { width: number; height: number }> = {};

const setCodes = fs.readdirSync(setsCachePath);
for (const code of setCodes) {
  const inputFile = path.join(setsCachePath, code, "logo.png");
  const outputDir = path.join(assetsPath, locale, code);
  const outputFile = path.join(outputDir, "logo.avif");
  if (!fs.existsSync(outputFile)) {
    await fs.promises.mkdir(outputDir, { recursive: true });
    await $`avifenc --min 25 --max 63 --speed 1 --premultiply --jobs all -y 420 ${inputFile} ${outputFile}`.quiet();
  }
  const dim = await $`magick identify -format "%wx%h" ${inputFile}`.quiet();
  const [width, height] = dim.stdout.trim().split("x").map(Number);
  dimensions[code] = { width, height };
}

const outDir = path.join(outPath, locale);
await fs.promises.mkdir(outDir, { recursive: true });
const dimensionsFile = path.join(outDir, `logodimensions.json`);
await Bun.write(dimensionsFile, JSON.stringify(dimensions, null, 2));
