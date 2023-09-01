const BANNED_SETS = [
  "N/A",
  "RSP",
  "MCD",
  "Energy",
  // BW and XY energy are already present in their base set
  "BLWEnergy",
  "XYEnergy",
  // Use PTCGL set instead of PTCGO
  "SV1",
  "Promo_SV",
];
// Temporary workaround for PTCGL sets
const ADDITIONAL_SETS = {
  "SV1-ptcgl": "SVI",
  "sve": "SVE",
  "SV2-ptcgl": "PAL",
  "SV3-ptcgl": "OBF",
  "SVBSP-ptcgl": "SVP",
};

export default async function getSetsData(): Promise<Record<string, string>> {
  const setsData = await fetch(
    "https://malie.io/static/metamon/SetDataMap.json",
  ).then((r) => r.json());

  for (const setName in setsData) {
    const setInfo = setsData[setName];
    if (
      BANNED_SETS.includes(setInfo.externalId)
    ) {
      delete setsData[setName];
      continue;
    }

    setsData[setName] = setInfo.externalId;
  }

  Object.assign(setsData, ADDITIONAL_SETS);
  return setsData;
}
