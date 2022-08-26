import fs from "node:fs";
import ora from "ora";
import sharp from "sharp";
import path from "node:path";
import paths from "./src/paths.js";
import { locales } from "./src/locales.js";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const cardsStatus = ora("Converting cards....").start();

const cardsDir = path.join(paths.cache, "cards");
const outputFormats = {
  // effort 9 makes no difference
  avif: { quality: 37, effort: 8 },
  webp: { quality: 37, effort: 6, smartSubsample: true },
};
const outputFormatKeys = Object.keys(outputFormats);

for (const locale of locales) {
  const localeDir = path.join(cardsDir, locale);
  const setIds = await fs.promises.readdir(localeDir);
  for (const setId of setIds) {
    const setDir = path.join(localeDir, setId);
    const setFiles = await fs.promises.readdir(setDir);
    const outputDir = path.join(__dirname, "../assets/", locale, setId);

    await fs.promises.mkdir(outputDir, { recursive: true });
    await Promise.all(
      setFiles
        .sort((a, b) => Number(a) - Number(b))
        .map((setFile) => {
          cardsStatus.text = `[${locale}] ${setId}`;
          const inputFile = path.join(setDir, setFile);
          const cardName = path.basename(setFile, ".png");
          return convertCard({ outputDir, inputFile, cardName });
        })
    );
  }
}

cardsStatus.succeed("Converted all cards");

async function convertCard({ outputDir, inputFile, cardName }) {
  for (const outputFormat of outputFormatKeys) {
    let convertedInput;
    const outputFile = path.join(outputDir, `${cardName}.${outputFormat}`);
    try {
      await fs.promises.access(outputFile);
    } catch {
      // Border color used by most cards. The application should cut off these corners with a border radius or overlay.
      // Removing this alpha layer decreases file size significantly
      convertedInput ??= await sharp(inputFile)
        .flatten({
          background: "#ffe557",
        })
        .raw()
        .toBuffer({ resolveWithObject: true });

      const pixelArray = new Uint8ClampedArray(convertedInput.data.buffer);

      const { width, height, channels } = convertedInput.info;
      await sharp(pixelArray, { raw: { width, height, channels } })
        [outputFormat](outputFormats[outputFormat])
        .toFile(outputFile);
    }
  }
}
