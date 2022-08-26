import fs from "node:fs";
import fetch from "node-fetch";
import ora from "ora";
import getSetsData from "./src/getSetsData.js";
import path from "node:path";
import paths from "./src/paths.js";
import { cacheDownload } from "./src/cacheDownload.js";
import { locales } from "./src/locales.js";

const setsStatus = ora("Downloading sets...").start();
const setsData = await getSetsData();
setsStatus.succeed("Downloaded sets data");

const cheatsheetsDir = path.join(paths.cache, "cheatsheets");
const cardsDir = path.join(paths.cache, "cards");
for (const locale of locales) {
  await fs.promises.mkdir(path.join(cheatsheetsDir, locale), {
    recursive: true,
  });
}

const cheatsheetsStatus = ora("Downloading cheatsheets...").start();
const cheatsheets = {};
for (const locale of locales) {
  for (const set in setsData) {
    const dest = path.join(cheatsheetsDir, locale, `${set}.json`);
    cheatsheetsStatus.text = `[${locale}] ${set}`;
    await cacheDownload(
      `https://malie.io/static/cheatsheets/${locale}/json/${set}.json`,
      dest
    );
    cheatsheets[set] = JSON.parse(await fs.promises.readFile(dest, "utf8"));
  }
}

cheatsheetsStatus.succeed("Downloaded cheatsheets");

const cardsStatus = ora("Downloading cards...").start();

for (const locale of locales) {
  for (const set in cheatsheets) {
    const externalId = setsData[set];
    const setDirectory = path.join(cardsDir, locale, externalId);
    const setStatusText = `[${locale}] ${externalId}`;
    cardsStatus.text = setStatusText;
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
        /-(140op|op|es|fr|it|de|pt)\.png$/.test(img) ||
        // Dragon Vault alternative arts, Vivilon alternative art with the same card number
        (!yellowA && /-(xy|a)\.png$/.test(img))
      ) {
        false &&
          console.error(
            `Skipping ${card._title}:\n    Original ${
              self.find(
                (c) =>
                  c._title === card._title &&
                  c._cropped_url !== card._cropped_url
              )._cropped_url
            }\n    Variant ${img}`
          );

        return false;
      }
      return true;
    });

    // Verify that we aren't overwriting files
    const uniqueCards = new Set();
    for (const card of cards) {
      if (uniqueCards.has(card.card_number))
        throw new Error(
          `Not unique: ${set} ${externalId} ${JSON.stringify(card)}`
        );
      uniqueCards.add(card.card_number);
    }

    for (const card of cards) {
      let attempt = 0;
      const maxAttempts = 5;
      cardsStatus.text = `${setStatusText} - ${card._title} [${
        attempt + 1
      }/${maxAttempts}]`;
      while (attempt < maxAttempts) {
        attempt += 1;
        try {
          await cacheDownload(
            card._cropped_url,
            path.join(setDirectory, `${card.card_number}.png`)
          );
          break;
        } catch (e) {
          if (attempt === maxAttempts) throw e;
        }
      }
    }
  }
}

cardsStatus.succeed("Downloaded all cards");
