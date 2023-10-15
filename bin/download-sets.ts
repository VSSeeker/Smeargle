import { load as cheerioLoad } from "cheerio";
import * as fs from "fs";
import * as path from "path";
import { cachePath } from "./paths";

const setsPage = await fetch(
  "https://bulbapedia.bulbagarden.net/wiki/List_of_Pok%C3%A9mon_Trading_Card_Game_expansions",
).then(r => r.text());
const symbolsPage = await fetch("https://cardmavin.com/pokemon/pokemon-card-set-symbols").then(r => r.text());

const $sets = cheerioLoad(setsPage);
const $symbols = cheerioLoad(symbolsPage);

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
    setName = setName.replace(/^EX /, "").replace(/McDonald's Collection /, "McDonald's ");
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
}

const symbolRows = $symbols("tbody tr");
for (const row of symbolRows) {
  let rowSet = $symbols(row).find("td").first().text().trim();
  const rowSymbol = $symbols(row).find("td").last().find("img").attr("data-src");

  const setAbbr = setCodes.get(rowSet);
  if (!rowSymbol || !setAbbr) continue;
  console.log(rowSet, setAbbr, rowSymbol);

  rowSet = rowSet.replace(/ Base Set$/, "").replace(" and ", " & ");

  const setCachePath = path.join(setsCachePath, setAbbr);
  await fs.promises.mkdir(setCachePath, { recursive: true });

  const setSymbolPath = path.join(setCachePath, `symbol.png`);

  await writeCache(rowSymbol, setSymbolPath);
}

async function writeCache(from: string, to: string) {
  if (fs.existsSync(to)) return;
  console.log(to);
  await Bun.write(to, await fetch(from).then(r => r.arrayBuffer()));
}

function convertMWThumb(url: string) {
  if (!url.startsWith("https:")) {
    url = "https:" + url;
  }

  return url.replace(/\/thumb\//, "/").replace(/\/\d+px-.+$/, "");
}
