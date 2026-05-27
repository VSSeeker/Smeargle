import { $ } from "bun";
import { load as cheerioLoad } from "cheerio";
import { createHash } from "crypto";
import * as fs from "fs";
import * as path from "path";

import imageUrls from "../malieimages.json";
import aliasConfig from "../pokesymbols-set-aliases.json";
import { assetsPath, outPath } from "./paths";
import { fetchText, writeFileAtomic } from "./download";

export const pokesymbolsOrigin = "https://pokesymbols.com";
export const pokesymbolsSetsUrl = `${pokesymbolsOrigin}/tcg/sets`;

export type PokeSymbolsSetDetail = {
  slug: string;
  detailUrl: string;
  displayName: string;
  releaseDate: string | null;
  ptcgoCode: string | null;
  symbolUrl: string | null;
  logoUrl: string | null;
};

export type PokeSymbolsSetMapEntry = PokeSymbolsSetDetail & {
  setCode: string;
  normalizedName: string;
  mappingSource: string;
};

export type PokeSymbolsUnmatchedSet = PokeSymbolsSetDetail & {
  reasons: string[];
};

export type PokeSymbolsSetMap = {
  generatedAt: string;
  locale: string;
  sourceUrl: string;
  aliasesFile: string;
  sets: Record<string, PokeSymbolsSetMapEntry>;
  names: Record<string, string>;
  slugs: Record<string, string>;
};

export type ImageMetadata = {
  format: string;
  width: number;
  height: number;
  hasTransparency: boolean;
  contentHash: string;
};

type SetCodeResolution = {
  setCode: string | null;
  mappingSource: string | null;
  reasons: string[];
};

const ignoredPtcgoCodes = new Set(["", "N/A", "NA", "NONE", "-"]);
const aliasFilePath = "bin/pokesymbols-set-aliases.json";
const imageFetchTimeoutMs = 30000;

export async function collectPokeSymbolsSetDetails(): Promise<PokeSymbolsSetDetail[]> {
  const links = await fetchPokeSymbolsSetLinks();
  return await mapWithConcurrency(links, 6, (link) => fetchPokeSymbolsSetDetail(link));
}

export async function buildPokeSymbolsSetMap(locale: string): Promise<{
  setMap: PokeSymbolsSetMap;
  unmatchedSets: PokeSymbolsUnmatchedSet[];
}> {
  const details = await collectPokeSymbolsSetDetails();
  const knownSetCodes = await getKnownSetCodes(locale);
  const acceptedEntries: PokeSymbolsSetMapEntry[] = [];
  const unmatchedSets: PokeSymbolsUnmatchedSet[] = [];

  for (const detail of details) {
    const reasons: string[] = [];
    const resolution = resolveSetCode(detail, knownSetCodes);
    reasons.push(...resolution.reasons);

    if (!detail.symbolUrl) reasons.push("missing_symbol");
    if (!detail.logoUrl) reasons.push("missing_logo");
    if (detail.symbolUrl && detail.logoUrl && detail.symbolUrl === detail.logoUrl) {
      reasons.push("duplicate_symbol_logo");
    }

    if (!resolution.setCode) reasons.push("no_smeargle_set_match");

    if (reasons.length > 0 || !resolution.setCode || !resolution.mappingSource) {
      unmatchedSets.push({
        ...detail,
        reasons: [...new Set(reasons)],
      });
      continue;
    }

    acceptedEntries.push({
      ...detail,
      setCode: resolution.setCode,
      normalizedName: normalizeSetName(detail.displayName),
      mappingSource: resolution.mappingSource,
    });
  }

  return {
    setMap: createSetMap(locale, acceptedEntries),
    unmatchedSets,
  };
}

export async function writePokeSymbolsSetMap(
  locale: string,
  setMap: PokeSymbolsSetMap,
  unmatchedSets: PokeSymbolsUnmatchedSet[],
): Promise<void> {
  const outDir = path.join(outPath, locale);
  await fs.promises.mkdir(outDir, { recursive: true });
  await writeJsonFile(path.join(outDir, "pokesymbols-set-map.json"), setMap);
  await writeJsonFile(path.join(outDir, "pokesymbols-unmatched-sets.json"), unmatchedSets);
}

export function normalizeSetName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function resolvePokeSymbolsUrl(url: string): string {
  return new URL(url, pokesymbolsOrigin).href;
}

export async function fetchImageBytes(url: string): Promise<{
  bytes: ArrayBuffer;
  contentType: string | null;
  contentHash: string;
}> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(imageFetchTimeoutMs),
  });

  if (response.status !== 200) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? null;
  if (contentType && !contentType.startsWith("image/")) {
    throw new Error(`Expected image response, received ${contentType}`);
  }

  const bytes = await response.arrayBuffer();
  if (bytes.byteLength === 0) throw new Error("Empty image response");

  return {
    bytes,
    contentType,
    contentHash: hashBytes(bytes),
  };
}

export async function inspectImageFile(filePath: string): Promise<ImageMetadata> {
  const identify = await $`magick identify -format "%m\n%w\n%h\n%[opaque]\n" ${filePath}`
    .quiet()
    .text();
  const [format, width, height, opaque] = identify.trim().split("\n");

  return {
    format,
    width: Number(width),
    height: Number(height),
    hasTransparency: opaque === "False",
    contentHash: await hashFile(filePath),
  };
}

export async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await writeFileAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export async function mapWithConcurrency<T, U>(
  values: T[],
  concurrency: number,
  mapValue: (value: T, index: number) => Promise<U>,
): Promise<U[]> {
  const results = new Array<U>(values.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapValue(values[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));

  return results;
}

async function fetchPokeSymbolsSetLinks(): Promise<{ slug: string; detailUrl: string }[]> {
  const html = await fetchText(pokesymbolsSetsUrl);
  const $ = cheerioLoad(html);
  const links = new Map<string, { slug: string; detailUrl: string }>();

  $("main a[href^='/tcg/sets/'], main a[href^='https://pokesymbols.com/tcg/sets/']").each(
    (_, element) => {
      const href = $(element).attr("href");
      if (!href) return;

      const url = new URL(href, pokesymbolsOrigin);
      const match = url.pathname.match(/^\/tcg\/sets\/([^/]+)$/);
      if (!match) return;

      const slug = match[1];
      links.set(slug, {
        slug,
        detailUrl: url.href,
      });
    },
  );

  return [...links.values()];
}

async function fetchPokeSymbolsSetDetail(link: {
  slug: string;
  detailUrl: string;
}): Promise<PokeSymbolsSetDetail> {
  const html = await fetchText(link.detailUrl, {
    signal: AbortSignal.timeout(30000),
  });
  const $ = cheerioLoad(html);
  const heading = cleanText($("main h1").first().text());
  const displayName = heading.replace(/\s+Symbol$/i, "").trim();
  const paragraphs = $("main p")
    .toArray()
    .map((element) => cleanText($(element).text()))
    .filter(Boolean);
  const imageUrls = $("main picture img")
    .toArray()
    .map((element) => $(element).attr("src"))
    .filter((src): src is string => Boolean(src))
    .map(resolvePokeSymbolsUrl)
    .filter((src) => src.includes("/images/tcg/sets/"));

  const symbolUrl = imageUrls.find((src) => src.includes("/symbols/")) ?? imageUrls[0] ?? null;
  const logoUrl =
    imageUrls.find((src) => src.includes("/logos/") && src !== symbolUrl) ??
    imageUrls.find((src) => src !== symbolUrl) ??
    null;

  return {
    slug: link.slug,
    detailUrl: link.detailUrl,
    displayName,
    releaseDate: extractLabel(paragraphs, ["Released"]),
    ptcgoCode: normalizePtcgoCode(
      extractLabel(paragraphs, [
        "Pokemon Trading Card Game Online Code",
        "Pokémon Trading Card Game Online Code",
      ]),
    ),
    symbolUrl,
    logoUrl,
  };
}

async function getKnownSetCodes(locale: string): Promise<Set<string>> {
  const knownSetCodes = new Set<string>();

  for (const cardPath of Object.keys(imageUrls)) {
    const separatorIndex = cardPath.indexOf("/");
    if (separatorIndex !== -1) knownSetCodes.add(cardPath.slice(0, separatorIndex));
  }

  for (const aliasSetCode of [
    ...Object.values(aliasConfig.ptcgoCodeAliases),
    ...Object.values(aliasConfig.slugAliases),
    ...Object.values(aliasConfig.nameAliases),
  ]) {
    if (aliasSetCode) knownSetCodes.add(aliasSetCode);
  }

  const localeAssetsPath = path.join(assetsPath, locale);
  try {
    const assetEntries = await fs.promises.readdir(localeAssetsPath, { withFileTypes: true });
    for (const entry of assetEntries) {
      if (entry.isDirectory()) knownSetCodes.add(entry.name);
    }
  } catch (error) {
    if (!isNodeError(error) || error.code !== "ENOENT") throw error;
  }

  return knownSetCodes;
}

function createSetMap(locale: string, entries: PokeSymbolsSetMapEntry[]): PokeSymbolsSetMap {
  const sortedEntries = [...entries].sort((a, b) =>
    a.setCode.localeCompare(b.setCode, undefined, { numeric: true }),
  );
  const setEntries = sortedEntries.map((entry) => [entry.setCode, entry] as const);
  const nameEntries = sortedEntries.map((entry) => [entry.normalizedName, entry.setCode] as const);
  const slugEntries = sortedEntries.map((entry) => [entry.slug, entry.setCode] as const);

  return {
    generatedAt: new Date().toISOString(),
    locale,
    sourceUrl: pokesymbolsSetsUrl,
    aliasesFile: aliasFilePath,
    sets: Object.fromEntries(setEntries),
    names: Object.fromEntries(nameEntries),
    slugs: Object.fromEntries(slugEntries),
  };
}

function resolveSetCode(
  detail: PokeSymbolsSetDetail,
  knownSetCodes: Set<string>,
): SetCodeResolution {
  if (isSkippedSet(detail)) {
    return {
      setCode: null,
      mappingSource: null,
      reasons: ["subset_entry"],
    };
  }

  const ptcgoCode = detail.ptcgoCode;
  if (ptcgoCode) {
    const aliasSetCode = aliasConfig.ptcgoCodeAliases[ptcgoCode];
    if (aliasSetCode === null) {
      return {
        setCode: null,
        mappingSource: null,
        reasons: ["ptcgo_code_skipped"],
      };
    }

    if (aliasSetCode) {
      return {
        setCode: aliasSetCode,
        mappingSource: "ptcgo_code_alias",
        reasons: [],
      };
    }

    if (knownSetCodes.has(ptcgoCode)) {
      return {
        setCode: ptcgoCode,
        mappingSource: "ptcgo_code",
        reasons: [],
      };
    }
  }

  const slugAlias = aliasConfig.slugAliases[detail.slug];
  if (slugAlias === null) {
    return {
      setCode: null,
      mappingSource: null,
      reasons: ["slug_alias_skipped"],
    };
  }

  if (slugAlias) {
    return {
      setCode: slugAlias,
      mappingSource: "slug_alias",
      reasons: [],
    };
  }

  const normalizedName = normalizeSetName(detail.displayName);
  const nameAlias = aliasConfig.nameAliases[normalizedName];
  if (nameAlias === null) {
    return {
      setCode: null,
      mappingSource: null,
      reasons: ["name_alias_skipped"],
    };
  }

  if (nameAlias) {
    return {
      setCode: nameAlias,
      mappingSource: "name_alias",
      reasons: [],
    };
  }

  return {
    setCode: null,
    mappingSource: null,
    reasons: detail.ptcgoCode ? [] : ["no_ptcgo_code"],
  };
}

function isSkippedSet(detail: PokeSymbolsSetDetail): boolean {
  if (aliasConfig.skipSlugs.includes(detail.slug)) return true;

  const normalizedName = normalizeSetName(detail.displayName);
  if (aliasConfig.skipNormalizedNames.includes(normalizedName)) return true;

  return aliasConfig.skipNamePatterns.some((pattern) =>
    new RegExp(pattern, "i").test(detail.displayName),
  );
}

function extractLabel(paragraphs: string[], labels: string[]): string | null {
  for (const paragraph of paragraphs) {
    for (const label of labels) {
      const match = paragraph.match(new RegExp(`^${escapeRegExp(label)}:\\s*(.+)$`, "i"));
      if (match) return match[1].trim();
    }
  }

  return null;
}

function normalizePtcgoCode(value: string | null): string | null {
  if (!value) return null;

  const code = value.trim().toUpperCase();
  if (ignoredPtcgoCodes.has(code)) return null;
  return code;
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hashBytes(bytes: ArrayBuffer): string {
  return createHash("sha256").update(Buffer.from(bytes)).digest("hex");
}

async function hashFile(filePath: string): Promise<string> {
  return createHash("sha256")
    .update(await fs.promises.readFile(filePath))
    .digest("hex");
}

function isNodeError(error: unknown): error is Error & { code: string } {
  return error instanceof Error && "code" in error;
}
