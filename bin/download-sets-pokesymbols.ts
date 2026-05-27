/**
 * Download Pokemon TCG set logos and symbols from PokeSymbols.
 *
 * PokeSymbols is used as a high-quality archive source. Assets are written
 * into the existing set cache shape so bin/convert-sets.ts can stay unchanged.
 *
 * Environment variables:
 * - OVERRIDE_SETS=1: Re-download set assets even if already cached
 */

import * as fs from "fs";
import * as path from "path";

import { writeFileAtomic } from "./lib/download";
import { cachePath } from "./lib/paths";
import {
  type ImageMetadata,
  type PokeSymbolsSetMapEntry,
  type PokeSymbolsUnmatchedSet,
  buildPokeSymbolsSetMap,
  fetchImageBytes,
  inspectImageFile,
  writeJsonFile,
  writePokeSymbolsSetMap,
} from "./lib/pokesymbols";

type SetAssetKind = "symbol" | "logo";

type CachedSetAssetMetadata = ImageMetadata & {
  sourceUrl: string;
  contentType: string | null;
  cacheFile: string;
  reusedExistingCache: boolean;
};

type CachedSetMetadata = {
  source: "PokeSymbols";
  slug: string;
  displayName: string;
  releaseDate: string | null;
  ptcgoCode: string | null;
  setCode: string;
  detailUrl: string;
  assets: Partial<Record<SetAssetKind, CachedSetAssetMetadata>>;
};

class AssetRejection extends Error {
  reasons: string[];

  constructor(reasons: string[]) {
    super(reasons.join(", "));
    this.reasons = reasons;
  }
}

const locale = "en-US";
const overrideSets = process.env.OVERRIDE_SETS === "1";
const setsCachePath = path.join(cachePath, "sets", locale);
const downloadMarker = path.join(setsCachePath, `.download-active.${process.pid}`);

await fs.promises.mkdir(setsCachePath, { recursive: true });
await writeFileAtomic(downloadMarker, `${process.pid}\n`);

try {
  const { setMap, unmatchedSets } = await buildPokeSymbolsSetMap(locale);
  const rejectedSets: Array<PokeSymbolsUnmatchedSet & { setCode?: string }> = [...unmatchedSets];

  for (const entry of Object.values(setMap.sets)) {
    const setCachePath = path.join(setsCachePath, entry.setCode);
    const metadata: CachedSetMetadata = {
      source: "PokeSymbols",
      slug: entry.slug,
      displayName: entry.displayName,
      releaseDate: entry.releaseDate,
      ptcgoCode: entry.ptcgoCode,
      setCode: entry.setCode,
      detailUrl: entry.detailUrl,
      assets: {},
    };

    try {
      console.log(`[${locale}] ${entry.setCode} ${entry.displayName}`);
      metadata.assets.symbol = await cacheSetAsset(entry, "symbol", setCachePath);
      metadata.assets.logo = await cacheSetAsset(entry, "logo", setCachePath);
      await writeJsonFile(path.join(setCachePath, "pokesymbols-metadata.json"), metadata);
    } catch (error) {
      rejectedSets.push({
        ...entry,
        setCode: entry.setCode,
        reasons:
          error instanceof AssetRejection
            ? error.reasons
            : [error instanceof Error ? error.message : "unknown_asset_error"],
      });
      console.error(`${entry.setCode} rejected:`, error);
    }
  }

  await writePokeSymbolsSetMap(locale, setMap, rejectedSets);
} finally {
  await fs.promises.unlink(downloadMarker).catch(() => {});
}

async function cacheSetAsset(
  entry: PokeSymbolsSetMapEntry,
  kind: SetAssetKind,
  setCachePath: string,
): Promise<CachedSetAssetMetadata> {
  const sourceUrl = kind === "symbol" ? entry.symbolUrl : entry.logoUrl;
  if (!sourceUrl) throw new AssetRejection([`missing_${kind}`]);

  const outputFile = path.join(setCachePath, `${kind}.png`);

  if (!overrideSets && fs.existsSync(outputFile)) {
    const metadata = await inspectImageFile(outputFile);
    const reasons = validateSetAsset(kind, metadata);
    if (reasons.length > 0) throw new AssetRejection(reasons);

    return {
      ...metadata,
      sourceUrl,
      contentType: null,
      cacheFile: outputFile,
      reusedExistingCache: true,
    };
  }

  const temporaryFile = path.join(
    setCachePath,
    `.${kind}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.png`,
  );

  try {
    const download = await fetchImageBytes(sourceUrl);
    await fs.promises.mkdir(setCachePath, { recursive: true });
    await writeFileAtomic(temporaryFile, download.bytes);

    const metadata = await inspectImageFile(temporaryFile);
    const reasons = validateSetAsset(kind, metadata);
    if (reasons.length > 0) throw new AssetRejection(reasons);

    await fs.promises.rename(temporaryFile, outputFile);

    return {
      ...metadata,
      contentHash: download.contentHash,
      sourceUrl,
      contentType: download.contentType,
      cacheFile: outputFile,
      reusedExistingCache: false,
    };
  } finally {
    await fs.promises.unlink(temporaryFile).catch(() => {});
  }
}

function validateSetAsset(kind: SetAssetKind, metadata: ImageMetadata): string[] {
  const reasons: string[] = [];

  if (metadata.width <= 0 || metadata.height <= 0) reasons.push(`${kind}_invalid_dimensions`);

  if (kind === "symbol") {
    const aspectRatio = metadata.width / metadata.height;
    const isSquareish = aspectRatio >= 0.5 && aspectRatio <= 2;

    if (metadata.width < 24 || metadata.height < 24) reasons.push("symbol_too_small");
    if (!metadata.hasTransparency && !isSquareish) {
      reasons.push("symbol_lacks_transparency_or_squareish_dimensions");
    }
  } else {
    const aspectRatio = metadata.width / metadata.height;

    if (metadata.width < 120 || metadata.height < 32) reasons.push("logo_too_small");
    if (aspectRatio < 1.2) reasons.push("logo_not_wide_enough");
  }

  return reasons;
}
