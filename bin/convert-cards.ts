import * as fs from "fs";
import * as path from "path";
import { $ } from "zx";
import { locales } from "./locales";
import { cachePath, tmpPath } from "./paths.js";

await fs.promises.mkdir(tmpPath, { recursive: true });

const cardsDir = path.join(cachePath, "cards");
const alphalessFile = path.join(tmpPath, "alphaless.png");

for (const locale of locales) {
  const localeDir = path.join(cardsDir, locale);
  const setIds = await fs.promises.readdir(localeDir);

  for (const setId of setIds) {
    const setDir = path.join(localeDir, setId);
    const setFiles = await fs.promises.readdir(setDir);
    const outputDir = path.resolve("assets/", locale, setId);

    await fs.promises.mkdir(outputDir, { recursive: true });
    const filesOrdered = setFiles.sort(
      (a, b) => Number(a.replace(/[^\d]/g, "")) - Number(b.replace(/[^\d]/g, "")),
    );

    for (const file of filesOrdered) {
      const cardName = path.basename(file, ".png");

      const inputFile = path.join(setDir, file);
      const outputFile = path.join(outputDir, `${cardName}.avif`);

      // Noop if file already exists
      try {
        await fs.promises.access(outputFile);
        continue;
      } catch {}

      console.log(`[${locale}] ${setId} ${cardName}`);
      // Remove alpha layer from input file, then encode to AVIF
      // avifenc only supports piping in from stdin if the file is .y4m (a video format)
      // mkfifo doesn't work. tmpfs recommended so everything still runs in memory
      await $`magick convert ${inputFile} -alpha off ${alphalessFile}`.quiet();
      await $`avifenc --min 25 --max 63 --speed 1 --premultiply --jobs all -y 420 ${alphalessFile} ${outputFile}`
        .quiet();
    }
  }
}
