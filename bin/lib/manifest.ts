import * as fs from "fs";
import * as path from "path";
import { encode } from "cbor-x";
import foilUrls from "../maliefoils.json";
import { assetsPath } from "./paths";

type SmeargleManifest = {
  foils: Record<string, string[]>;
};

export async function writeSmeargleManifest(): Promise<void> {
  const manifest = buildSmeargleManifest();
  const manifestFile = path.join(assetsPath, "smeargle.cbor");

  await fs.promises.mkdir(path.dirname(manifestFile), { recursive: true });
  await Bun.write(manifestFile, encode(manifest));
}

export function buildSmeargleManifest(): SmeargleManifest {
  const foils = new Map<string, string[]>();

  for (const cardPath of Object.keys(foilUrls)) {
    const separatorIndex = cardPath.indexOf("/");
    if (separatorIndex === -1) {
      throw new Error(`Invalid foil card path: ${cardPath}`);
    }

    const setId = cardPath.slice(0, separatorIndex);
    const cardName = cardPath.slice(separatorIndex + 1);
    const cardNames = foils.get(setId) ?? [];
    cardNames.push(cardName);
    foils.set(setId, cardNames);
  }

  return {
    foils: Object.fromEntries(
      [...foils.entries()]
        .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
        .map(([setId, cardNames]) => [
          setId,
          [...cardNames].sort((a, b) => compareCardName(a, b)),
        ]),
    ),
  };
}

function compareCardName(a: string, b: string): number {
  const aNumber = Number(a.replace(/[^\d]/g, ""));
  const bNumber = Number(b.replace(/[^\d]/g, ""));

  if (!Number.isNaN(aNumber) && !Number.isNaN(bNumber) && aNumber !== bNumber) {
    return aNumber - bNumber;
  }

  return a.localeCompare(b, undefined, { numeric: true });
}
