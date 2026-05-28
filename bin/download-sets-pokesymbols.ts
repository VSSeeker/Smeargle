/**
 * Download Pokemon TCG set logos and symbols from PokeSymbols.
 *
 * PokeSymbols is used as a high-quality archive source. Assets are written
 * directly into src/sets.
 *
 * Environment variables:
 * - OVERRIDE_SETS=1: Re-download set assets even if already present in src/sets
 */

import * as fs from "fs";
import * as path from "path";

import { writeFileAtomic } from "./lib/download";
import { srcPath } from "./lib/paths";
import {
  type ImageMetadata,
  type PokeSymbolsSetMapEntry,
  type PokeSymbolsUnmatchedSet,
  buildPokeSymbolsSetMap,
  fetchImageBytes,
  inspectImageFile,
  writePokeSymbolsSetMap,
} from "./lib/pokesymbols";

type SetAssetKind = "symbol" | "logo";

class AssetRejection extends Error {
  reasons: string[];

  constructor(reasons: string[]) {
    super(reasons.join(", "));
    this.reasons = reasons;
  }
}

const locale = "en-US";
const overrideSets = process.env.OVERRIDE_SETS === "1";
const setsSrcPath = path.join(srcPath, "sets", locale);
const downloadMarker = path.join(setsSrcPath, `.download-active.${process.pid}`);

await fs.promises.mkdir(setsSrcPath, { recursive: true });
await writeFileAtomic(downloadMarker, `${process.pid}\n`);

try {
  const { setMap, unmatchedSets } = await buildPokeSymbolsSetMap(locale);
  const rejectedSets: Array<PokeSymbolsUnmatchedSet & { setCode?: string }> = [...unmatchedSets];

  for (const entry of Object.values(setMap.sets)) {
    const setSrcPath = path.join(setsSrcPath, entry.setCode);

    try {
      console.log(`[${locale}] ${entry.setCode} ${entry.displayName}`);
      await writeSetAsset(entry, "symbol", setSrcPath);
      await writeSetAsset(entry, "logo", setSrcPath);
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

async function writeSetAsset(
  entry: PokeSymbolsSetMapEntry,
  kind: SetAssetKind,
  setSrcPath: string,
): Promise<void> {
  const sourceUrl = kind === "symbol" ? entry.symbolUrl : entry.logoUrl;
  if (!sourceUrl) throw new AssetRejection([`missing_${kind}`]);

  const outputFile = path.join(setSrcPath, `${kind}.png`);

  if (!overrideSets && fs.existsSync(outputFile)) {
    const metadata = await inspectImageFile(outputFile);
    const reasons = validateSetAsset(kind, metadata);
    if (reasons.length > 0) throw new AssetRejection(reasons);
    return;
  }

  const temporaryFile = path.join(
    setSrcPath,
    `.${kind}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.png`,
  );

  try {
    const { bytes } = await fetchImageBytes(sourceUrl);
    await fs.promises.mkdir(setSrcPath, { recursive: true });
    await writeFileAtomic(temporaryFile, bytes);

    const metadata = await inspectImageFile(temporaryFile);
    const reasons = validateSetAsset(kind, metadata);
    if (reasons.length > 0) throw new AssetRejection(reasons);

    await fs.promises.rename(temporaryFile, outputFile);
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
