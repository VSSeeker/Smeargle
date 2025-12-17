import { load as cheerioLoad } from "cheerio";
import * as fs from "fs";
import * as path from "path";
import { cachePath } from "./paths";

const setsPage = await fetch(
  "https://bulbapedia.bulbagarden.net/wiki/List_of_Pok%C3%A9mon_Trading_Card_Game_expansions",
).then((r) => r.text());

const $sets = cheerioLoad(setsPage);

const locale = "en-US";

const setsCachePath = path.join(cachePath, "sets", locale);

/** Name => Code */
const setCodes = new Map<string, string>();

const setRows = $sets(".mw-parser-output tr");
for (const row of setRows) {
  const cols = $sets(row).find("td").length;
  const abbr = $sets(row).find("td").last().text().trim();

  let setName = "";
  if (cols === 5) {
    setName = $sets(row).find("td:nth-child(2)").text().trim();
  } else if (cols === 6) {
    setName = $sets(row).find("td:nth-child(3)").text().trim();
  } else if (cols === 8) {
    setName = $sets(row).find("td:nth-child(4)").text().trim();
  }

  if (abbr.includes("Project TCG, a Bulbapedia project")) break;

  const dash = setName.indexOf("—");
  if (dash !== -1) setName = setName.slice(dash + 1).trim();
  if (!setName.includes("Trainer Kit")) {
    setName = setName
      .replace(/^EX /, "")
      .replace(/McDonald's Collection /, "McDonald's ")
      .replace("Pokémon TCG: ", "")
      .replace(/ Base Set$/, "");
  }

  if (setName && abbr) setCodes.set(setName, abbr);
  console.log(setName, abbr);

  // Skip rows that don't cover main sets for logos
  if (cols !== 8) continue;

  // 0 is setSymbol
  const setLogo = $sets(row).find("img").eq(1).attr("src");
  if (!setLogo) continue;

  const setCachePath = path.join(setsCachePath, abbr);
  await fs.promises.mkdir(setCachePath, { recursive: true });

  const setLogoDownloadUrl = convertMWThumb(setLogo);
  console.log(`${abbr} [${setLogoDownloadUrl}] => ${setCachePath}`);
  try {
    const setLogoPath = path.join(setCachePath, `logo.png`);
    await writeCache(setLogoDownloadUrl, setLogoPath);
  } catch (e) {
    console.error(e);
  }

  const setSymbol = $sets(row).find("img").eq(0).attr("src");
  const setSymbolDownloadUrl = convertMWThumb(setSymbol);
  console.log(`${abbr} [${setSymbolDownloadUrl}] => ${setCachePath}`);
  try {
    const setLogoPath = path.join(setCachePath, `symbol.png`);
    await writeCache(setSymbolDownloadUrl, setLogoPath);
  } catch (e) {
    console.error(e);
  }
}

const promoBase = path.join(setsCachePath, "NP");
const promoSets = ["HSP", "BWP", "XYP", "SMP", "SWSHP", "SVP"];

const inputFile = path.join(promoBase, `symbol.png`);
for (const set of promoSets) {
  const promoPath = path.join(setsCachePath, set);
  const outputFile = path.join(promoPath, "symbol.png");
  if (!fs.existsSync(outputFile)) {
    console.log("Clone", set, inputFile, outputFile);
    await fs.promises.mkdir(promoPath, { recursive: true });
    await fs.promises.copyFile(inputFile, outputFile);
  }
}

const tkSetSymbols = {
  TK5E: "https://archives.bulbagarden.net/media/upload/thumb/1/1f/SetSymbolExcadrill_Half_Deck.png/30px-SetSymbolExcadrill_Half_Deck.png",
  TK5Z: "https://archives.bulbagarden.net/media/upload/thumb/0/01/SetSymbolZoroark_Half_Deck.png/30px-SetSymbolZoroark_Half_Deck.png",
  TK6S: "https://archives.bulbagarden.net/media/upload/thumb/4/46/SetSymbolSylveon_Half_Deck.png/30px-SetSymbolSylveon_Half_Deck.png",
  TK6N: "https://archives.bulbagarden.net/media/upload/thumb/3/38/SetSymbolNoivern_Half_Deck.png/30px-SetSymbolNoivern_Half_Deck.png",
  TK7A: "https://archives.bulbagarden.net/media/upload/thumb/a/a5/SetSymbolBisharp_Half_Deck.png/30px-SetSymbolBisharp_Half_Deck.png",
  TK7B: "https://archives.bulbagarden.net/media/upload/thumb/3/3f/SetSymbolWigglytuff_Half_Deck.png/30px-SetSymbolWigglytuff_Half_Deck.png",
  TK8A: "https://archives.bulbagarden.net/media/upload/thumb/c/cf/SetSymbolLatias_XY_Half_Deck.png/30px-SetSymbolLatias_XY_Half_Deck.png",
  TK8O: "https://archives.bulbagarden.net/media/upload/thumb/8/8a/SetSymbolLatios_XY_Half_Deck.png/30px-SetSymbolLatios_XY_Half_Deck.png",
  TK9P: "https://archives.bulbagarden.net/media/upload/thumb/7/79/SetSymbolPikachu_Libre_Half_Deck.png/30px-SetSymbolPikachu_Libre_Half_Deck.png",
  TK9S: "https://archives.bulbagarden.net/media/upload/thumb/9/90/SetSymbolSuicune_Half_Deck.png/30px-SetSymbolSuicune_Half_Deck.png",
  TK10A:
    "https://archives.bulbagarden.net/media/upload/thumb/b/ba/SetSymbolAlolan_Raichu_Half_Deck.png/30px-SetSymbolAlolan_Raichu_Half_Deck.png",
  TK10L:
    "https://archives.bulbagarden.net/media/upload/thumb/a/a7/SetSymbolLycanroc_Half_Deck.png/30px-SetSymbolLycanroc_Half_Deck.png",
};

for (const [code, url] of Object.entries(tkSetSymbols)) {
  const setCachePath = path.join(setsCachePath, code);
  await fs.promises.mkdir(setCachePath, { recursive: true });
  const setSymbolDownloadUrl = convertMWThumb(url);
  console.log(`${code} [${setSymbolDownloadUrl}] => ${setCachePath}`);
  try {
    const setLogoPath = path.join(setCachePath, `symbol.png`);
    await writeCache(setSymbolDownloadUrl, setLogoPath);
  } catch (e) {
    console.error(e);
  }
}

async function writeCache(from: string, to: string) {
  if (fs.existsSync(to)) return;
  console.log(to);
  await Bun.write(to, await fetch(from).then((r) => r.arrayBuffer()));
}

function convertMWThumb(url: string) {
  if (!url.startsWith("https:")) {
    url = "https:" + url;
  }

  return url.replace(/\/thumb\//, "/").replace(/\/\d+px-.+$/, "");
}
