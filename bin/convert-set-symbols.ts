import { assetsPath, cachePath } from "./paths";

import * as fs from "fs";
import * as path from "path";
import puppeteer from "puppeteer";
import { $ } from "zx";

const locale = "en-US";

const setsCachePath = path.join(cachePath, "sets", locale);

const webapp = "https://svgco.de/";

// Launch the browser and open a new blank page
const browser = await puppeteer.launch({ headless: false });
const page = await browser.newPage();

// Navigate the page to a URL
await page.goto(webapp);

// Set screen size
await page.setViewport({ width: 1080, height: 1024 });

await page.evaluate(() => {
  const clipboard = {
    async writeText(text: string) {
      this.text = text;
    },
  };
  Object.defineProperty(navigator, "clipboard", { value: clipboard });
});

await page.locator("text/Show Expert Options").click();
const setCodes = fs.readdirSync(setsCachePath);
for (const code of setCodes) {
  const inputFile = path.join(setsCachePath, code, "symbol.png");
  const outputFile = path.join(assetsPath, locale, code, "symbol.svg");

  if (fs.existsSync(outputFile)) {
    continue;
  }

  await page.locator("text/Reset All").click();
  const [fileChooser] = await Promise.all([
    page.waitForFileChooser(),
    page.click("text/Open Image"),
    // some button that triggers file selection
  ]);
  await fileChooser.accept([inputFile]);

  // "Suppress Speckles": Most symbols are smooth. Some of the earlier ones (JU) are not.
  await page.locator("#turdsize").fill("16");

  await page.locator("#advanced").click();

  // Maximize color posterizing
  await page.locator("#red").fill("20");
  await page.locator("#blue").fill("20");
  await page.locator("#green").fill("20");

  await page.locator("#opttolerance").fill("1");

  // One offs for fixes
  if (code === "LOT") {
    await page.locator("#scale").fill("200");
  }

  // Downloading files is a struggle with Puppeteer. Using the clipboard is much simpler.
  await page.locator("text/Copy SVG").click();
  await page.waitForSelector("text/Copied SVG");
  const clipboardText = await page.evaluate(() => navigator.clipboard.text);

  await fs.promises.writeFile(outputFile, clipboardText);
}

await browser.close();
