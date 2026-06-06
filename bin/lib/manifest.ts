import * as fs from "fs";
import * as path from "path";
import { encode } from "cbor-x";
import { getSetCodeFromImageUrlKey, parseImageUrlKey } from "./image-keys";
import { assetsPath } from "./paths";

type SmeargleManifest = {
  foils: Record<string, string[]>;
};

type ImageUrlManifest = {
  foils: Record<string, string>;
};

export async function writeSmeargleManifest(): Promise<void> {
  const manifest = buildSmeargleManifest();
  const manifestFile = path.join(assetsPath, "smeargle.cbor");

  await fs.promises.mkdir(path.dirname(manifestFile), { recursive: true });
  await Bun.write(manifestFile, encode(manifest));
}

export function buildSmeargleManifest(): SmeargleManifest {
  const foils = new Map<string, string[]>();

  for (const imageKey of readFoilImageKeys()) {
    const pathParts = parseImageUrlKey(imageKey);
    const cardName = pathParts.at(-1);
    if (!cardName) {
      throw new Error(`Invalid foil image key: ${imageKey}`);
    }

    const setId = getSetCodeFromImageUrlKey(imageKey);
    const cardNames = foils.get(setId) ?? [];
    cardNames.push(cardName);
    foils.set(setId, cardNames);
  }

  return {
    foils: Object.fromEntries(
      [...foils.entries()]
        .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
        .map(([setId, cardNames]) => [setId, [...cardNames].sort((a, b) => compareCardName(a, b))]),
    ),
  };
}

function readFoilImageKeys(): string[] {
  const manifestPath = path.join(import.meta.dir, "../imageurls.json");
  const manifest = JSON.parse(
    fs.readFileSync(manifestPath, "utf8"),
  ) as Partial<ImageUrlManifest>;

  if (!isRecord(manifest.foils)) {
    throw new Error("imageurls.json.foils must contain a JSON object");
  }

  return Object.entries(manifest.foils).map(([imageKey, value]) => {
    if (typeof value !== "string" || !value) {
      throw new Error(`imageurls.json.foils.${imageKey} must be a non-empty string`);
    }
    parseImageUrlKey(imageKey);
    return imageKey;
  });
}

function compareCardName(a: string, b: string): number {
  const aNumber = Number(a.replace(/[^\d]/g, ""));
  const bNumber = Number(b.replace(/[^\d]/g, ""));

  if (!Number.isNaN(aNumber) && !Number.isNaN(bNumber) && aNumber !== bNumber) {
    return aNumber - bNumber;
  }

  return a.localeCompare(b, undefined, { numeric: true });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
