import { assetsPath, cachePath, outPath } from "./paths";

import * as fs from "fs";
import * as path from "path";
import { $ } from "zx";

const locale = "en-US";

const setsCachePath = path.join(cachePath, "sets", locale);

const dimensions: Record<string, { width: number; height: number }> = {};

const setCodes = fs.readdirSync(setsCachePath);
for (const code of setCodes) {
  console.log(code);
  const logoFile = path.join(setsCachePath, code, "logo.png");
  const symbolFile = path.join(setsCachePath, code, "symbol.png");
  const outputDir = path.join(assetsPath, locale, code);
  const logoOutput = path.join(outputDir, "logo.avif");
  const symbolOutput = path.join(outputDir, "symbol.avif");
  let logoSuccess = false;
  if (!fs.existsSync(logoOutput)) {
    console.log(logoFile);
    await fs.promises.mkdir(outputDir, { recursive: true });
    try {
      await $`avifenc --min 25 --max 63 --speed 1 --premultiply --jobs all -y 420 ${logoFile} ${logoOutput}`.quiet();
      logoSuccess = true;
    } catch (e) {
      console.error(e);
    }
  } else {
    logoSuccess = true;
  }

  if (!fs.existsSync(symbolOutput)) {
    console.log(symbolFile);
    await fs.promises.mkdir(outputDir, { recursive: true });
    try {
      await $`avifenc --min 25 --max 63 --speed 1 --premultiply --jobs all -y 420 ${symbolFile} ${symbolOutput}`
        .quiet();
    } catch (e) {
      console.error(e);
    }
  }

  if (logoSuccess) {
    const dim = await $`magick identify -format "%wx%h" ${logoFile}`.quiet();
    const [width, height] = dim.stdout.trim().split("x").map(Number);
    dimensions[code] = { width, height };
  }
}

const outDir = path.join(outPath, locale);
await fs.promises.mkdir(outDir, { recursive: true });
const dimensionsFile = path.join(outDir, `logodimensions.json`);
await Bun.write(dimensionsFile, JSON.stringify(dimensions, null, 2));
