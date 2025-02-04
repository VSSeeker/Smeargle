import "zx/globals";
import * as fs from "fs";

import { locales } from "./locales";
import imageUrls from "./malieimages.json";
import { assetsPath, cachePath } from "./paths";

const OVERRIDE_CARDS = process.env.OVERRIDE_CARDS === "1";
// Files that are already present in assets/ will be skipped by default
const DOWNLOAD_EXISTING_CARDS = process.env.DOWNLOAD_EXISTING_CARDS === "1";

const sets = new Set();
for (const locale of locales) {
  for (const [cardPath, downloadUrl] of Object.entries(imageUrls)) {
    const [set, cardNum] = cardPath.split("/");
    const setCachePath = path.join(cachePath, "cards", locale, set);
    const setAssetsPath = path.join(assetsPath, locale, set);

    if (!sets.has(set)) {
      await fs.promises.mkdir(setCachePath, { recursive: true });
      await fs.promises.mkdir(setAssetsPath, { recursive: true });
      sets.add(set);
    }

    const setStatusText = `[${locale}] ${cardPath}`;

    const cacheFileName = path.join(setCachePath, `${cardNum}.png`);

    if (!OVERRIDE_CARDS) {
      if (fs.existsSync(cacheFileName)) {
        console.log(`${setStatusText} already downloaded [Skipped]`);
        continue;
      }
    }

    if (!DOWNLOAD_EXISTING_CARDS) {
      const assetFileName = path.join(setAssetsPath, `${cardNum}.avif`);
      if (fs.existsSync(assetFileName)) {
        console.log(`${setStatusText} already formatted [Skipped]`);
        continue;
      }
    }

    console.log(`${setStatusText}`);

    let attempt = 0;
    const maxAttempts = 5;
    while (attempt < maxAttempts) {
      attempt += 1;
      try {
        await Bun.write(cacheFileName, await fetch(downloadUrl as string).then(r => r.arrayBuffer()));
        break;
      } catch (e) {
        if (attempt === maxAttempts) throw e;
      }
    }
  }
}
