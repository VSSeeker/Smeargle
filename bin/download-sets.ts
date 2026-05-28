/**
 * Download Pokémon TCG set logos and symbols from Bulbapedia
 *
 * This script scrapes the Bulbapedia expansions list page to download:
 * - Set logos (for main expansion sets)
 * - Set symbols (for all sets)
 *
 * Special handling:
 * - Promo sets (HSP, BWP, XYP, SMP, SWSHP, SVP) share the NP symbol
 * - Trainer Kit sets have hardcoded symbol URLs
 */

import { load as cheerioLoad } from "cheerio";
import * as fs from "fs";
import * as path from "path";
import { copyFileAtomic, downloadFile, fetchText } from "./lib/download";
import { srcPath } from "./lib/paths";

const locale = "en-US";
const setsSrcPath = path.join(srcPath, "sets", locale);
const downloadMarker = path.join(setsSrcPath, `.download-active.${process.pid}`);

await fs.promises.mkdir(setsSrcPath, { recursive: true });
await Bun.write(downloadMarker, `${process.pid}\n`);
process.on("exit", () => {
  fs.rmSync(downloadMarker, { force: true });
});

// ============================================================================
// Fetch and parse Bulbapedia expansions page
// ============================================================================

const setsPage = await fetchText(
  "https://bulbapedia.bulbagarden.net/wiki/List_of_Pok%C3%A9mon_Trading_Card_Game_expansions",
);

const $sets = cheerioLoad(setsPage);

/** Name => Code */
const setCodes = new Map<string, string>();

// ============================================================================
// Process table rows to extract set info and download assets
// ============================================================================

const setRows = $sets(".mw-parser-output tr");
for (const row of setRows) {
  const cols = $sets(row).find("td").length;
  const abbr = $sets(row).find("td").last().text().trim();

  // Extract set name from appropriate column based on table structure
  let setName = "";
  if (cols === 5) {
    setName = $sets(row).find("td:nth-child(2)").text().trim();
  } else if (cols === 6) {
    setName = $sets(row).find("td:nth-child(3)").text().trim();
  } else if (cols === 8) {
    setName = $sets(row).find("td:nth-child(4)").text().trim();
  }

  // Stop at the end of the main content
  if (abbr.includes("Project TCG, a Bulbapedia project")) break;

  // Clean up set names
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

  // Only rows with 8 columns contain logos and symbols for main sets
  if (cols !== 8) continue;

  const setSrcPath = path.join(setsSrcPath, abbr);

  // Download set logo (2nd image in row)
  const setLogo = $sets(row).find("img").eq(1).attr("src");
  if (setLogo) {
    const setLogoDownloadUrl = convertMWThumb(setLogo);
    console.log(`${abbr} [${setLogoDownloadUrl}] => ${setSrcPath}`);
    try {
      const setLogoPath = path.join(setSrcPath, "logo.png");
      await writeSetSource(setLogoDownloadUrl, setLogoPath);
    } catch (e) {
      console.error(e);
    }
  }

  // Download set symbol (1st image in row)
  const setSymbol = $sets(row).find("img").eq(0).attr("src");
  if (setSymbol) {
    const setSymbolDownloadUrl = convertMWThumb(setSymbol);
    console.log(`${abbr} [${setSymbolDownloadUrl}] => ${setSrcPath}`);
    try {
      const setSymbolPath = path.join(setSrcPath, "symbol.png");
      await writeSetSource(setSymbolDownloadUrl, setSymbolPath);
    } catch (e) {
      console.error(e);
    }
  }
}

// ============================================================================
// Promo sets: Download NP symbol and clone to generation-specific promo sets
// ============================================================================

const promoBase = path.join(setsSrcPath, "NP");

// Download the base promo symbol
const npSymbolUrl = convertMWThumb(
  "https://archives.bulbagarden.net/media/upload/thumb/5/58/SetSymbolPromo.png/1920px-SetSymbolPromo.png",
);
await writeSetSource(npSymbolUrl, path.join(promoBase, "symbol.png"));

// Clone NP symbol to generation-specific promo sets
const promoSets = ["HSP", "BWP", "XYP", "SMP", "SWSHP", "SVP"];
const npSymbolFile = path.join(promoBase, `symbol.png`);

for (const set of promoSets) {
  const promoPath = path.join(setsSrcPath, set);
  const outputFile = path.join(promoPath, "symbol.png");
  if (fs.existsSync(outputFile)) continue;

  console.log("Clone", set, npSymbolFile, outputFile);
  await copyFileAtomic(npSymbolFile, outputFile);
}

// ============================================================================
// Trainer Kit sets: Download symbols from hardcoded URLs
// ============================================================================

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
  const setSrcPath = path.join(setsSrcPath, code);
  const setSymbolDownloadUrl = convertMWThumb(url);
  console.log(`${code} [${setSymbolDownloadUrl}] => ${setSrcPath}`);
  try {
    const setSymbolPath = path.join(setSrcPath, "symbol.png");
    await writeSetSource(setSymbolDownloadUrl, setSymbolPath);
  } catch (e) {
    console.error(e);
  }
}

await fs.promises.unlink(downloadMarker).catch(() => {});

// ============================================================================
// Helper functions
// ============================================================================

/**
 * Download a set source file if it doesn't already exist.
 */
async function writeSetSource(from: string, srcFile: string) {
  if (fs.existsSync(srcFile)) return;
  console.log(srcFile);
  await downloadFile(from, srcFile);
}

/**
 * Convert MediaWiki thumbnail URL to full-size image URL
 * Example: /thumb/foo/bar/30px-image.png -> /foo/bar/image.png
 */
function convertMWThumb(url: string) {
  if (!url.startsWith("https:")) {
    url = "https:" + url;
  }

  return url.replace(/\/thumb\//, "/").replace(/\/\d+px-.+$/, "");
}
