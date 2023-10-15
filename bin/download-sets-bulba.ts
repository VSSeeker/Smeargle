import { load as cheerioLoad } from "cheerio";
import * as fs from "fs";
import * as path from "path";
import { cachePath } from "./paths";

const setsPage = await fetch(
  "https://bulbapedia.bulbagarden.net/wiki/List_of_Pok%C3%A9mon_Trading_Card_Game_expansions",
).then(r => r.text());

const $ = cheerioLoad(setsPage);

const locale = "en-US";

const setsCachePath = path.join(cachePath, "sets", locale);

const setRows = $(".mw-parser-output tr");
for (const row of setRows) {
  const cols = $(row).find("td").length;
  // Skip rows that don't cover main sets
  if (cols !== 8) continue;

  const [setLogo, setSymbol] = $(row).find("img").map((i, el) => el.attribs.src).toArray();
  const abbr = $(row).children().last().text().trim();
  if (!setSymbol || !setLogo || !abbr) continue;

  const setCachePath = path.join(setsCachePath, abbr);
  await fs.promises.mkdir(setCachePath, { recursive: true });

  const setSymbolDownloadUrl = convertMWThumb(setSymbol);
  const setLogoDownloadUrl = convertMWThumb(setLogo);
  console.log(`${abbr} [${setSymbolDownloadUrl}] [${setLogoDownloadUrl}] => ${setCachePath}`);
  try {
    const setSymbolPath = path.join(setCachePath, `logo.png`);
    const setLogoPath = path.join(setCachePath, `symbol.png`);
    await writeCache(setSymbolDownloadUrl, setSymbolPath);
    await writeCache(setLogoDownloadUrl, setLogoPath);
  } catch (e) {
    console.error(e);
  }
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
