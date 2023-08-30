import "zx/globals";
import * as fs from "fs";
import { spinner } from "zx/experimental";

import getSetsData from "./src/getSetsData";
import { locales } from "./src/locales";
import paths from "./src/paths";

const OVERRIDE_SHEETS = process.env.OVERRIDE_SHEETS === "1";
const OVERRIDE_CARDS = process.env.OVERRIDE_CARDS === "1";
// Files that are already present in assets/ will be skipped by default
const DOWNLOAD_EXISTING_CARDS = process.env.DOWNLOAD_EXISTING_CARDS === "1";

const setsData = await spinner("Downloading sets...", () => getSetsData());

const cheatsheetsDir = path.join(paths.cache, "cheatsheets");
const cardsDir = path.join(paths.cache, "cards");
for (const locale of locales) {
  await fs.promises.mkdir(path.join(cheatsheetsDir, locale), {
    recursive: true,
  });
}

const cheatsheets = await spinner("Downloading cheatsheets...", () => downloadCheatsheets(setsData));

await spinner("Downloading cards...", () => downloadCards(cheatsheets));

async function downloadCheatsheets(setsData) {
  const cheatsheets = {};

  for (const locale of locales) {
    for (const set in setsData) {
      const dest = path.join(cheatsheetsDir, locale, `${set}.json`);

      if (OVERRIDE_SHEETS || !fs.existsSync(dest)) {
        const from = `https://malie.io/static/cheatsheets/${locale}/json/${set}.json`;
        await Bun.write(dest, await fetch(from).then(r => r.arrayBuffer()));
        console.log(`${from} => ${dest}`);
      } else {
        console.log(`${dest} already exists [Skipped]`);
      }

      cheatsheets[set] = await Bun.file(dest).json();
    }
  }

  return cheatsheets;
}

async function downloadCards(cheatsheets) {
  for (const locale of locales) {
    for (const set in cheatsheets) {
      const externalId = setsData[set];
      const setDirectory = path.join(cardsDir, locale, externalId);
      const setStatusText = `[${locale}] ${externalId}`;
      await fs.promises.mkdir(setDirectory, {
        recursive: true,
      });

      const cards = cheatsheets[set].filter((card, _, self) => {
        const yellowA = /(a|b)$/.test(card.card_number); // Delinquent has a b art

        const img = card._cropped_url;

        // Select XY promos are only available as POP promos, and have unique sorting numbers
        if (card._key === "Promo_XY" && card.sorting_number >= 202) return true;

        // Use the stamped art for Detective Pikachu promo
        if (card._key === "Promo_SM" && card.sorting_number === 170) {
          return img.endsWith("-a.png");
        }

        // Ignore:

        if (
          // Organized play cards, Champion's Festivals alt arts
          /-(140op|op|es|fr|it|de|pt)\.png$/.test(img)
          // Dragon Vault alternative arts, Vivilon alternative art with the same card number
          || (!yellowA && /-(xy|a)\.png$/.test(img))
        ) {
          console.error(
            `Skipping ${card._title}:\n    Original ${
              self.find(
                (c) =>
                  c._title === card._title
                  && c._cropped_url !== card._cropped_url,
              )._cropped_url
            }\n    Variant ${img}`,
          );

          return false;
        }
        return true;
      });

      // Verify that we aren't overwriting files
      const uniqueCards = new Set();
      for (const card of cards) {
        if (uniqueCards.has(card.card_number)) {
          throw new Error(
            `Not unique: ${set} ${externalId} ${JSON.stringify(card)}`,
          );
        }
        uniqueCards.add(card.card_number);
      }

      for (const card of cards) {
        const cacheFileName = path.join(setDirectory, `${card.card_number}.png`);

        if (!OVERRIDE_CARDS) {
          if (fs.existsSync(cacheFileName)) {
            // console.log(`${setStatusText} ${card.card_number} already downloaded [Skipped]`);
            continue;
          }
        }

        if (!DOWNLOAD_EXISTING_CARDS) {
          const assetFileName = path.join(import.meta.dir, "../assets", locale, externalId, `${card.card_number}.avif`);
          if (fs.existsSync(assetFileName)) {
            // console.log(`${setStatusText} ${card.card_number} already formatted [Skipped]`);
            continue;
          }
        }

        console.log(`${setStatusText} ${card.card_number} ${card._title}`);

        let attempt = 0;
        const maxAttempts = 5;
        while (attempt < maxAttempts) {
          attempt += 1;
          try {
            await Bun.write(cacheFileName, await fetch(card._cropped_url).then(r => r.arrayBuffer()));
            break;
          } catch (e) {
            if (attempt === maxAttempts) throw e;
          }
        }
      }
    }
  }
}
