const SUPPORTED_SERIES = ["BW", "XY", "SM", "SWSH", "SV"];
const BANNED_SETS = ["N/A", "BLWEnergy", "XYEnergy"]; // BW and XY energy are already present in their base set

/** @returns {Promise<Record<string, string>>} */
export default async function getSetsData() {
	const setsData = await fetch(
		"https://malie.io/static/metamon/SetDataMap.json",
	).then((r) => r.json());

	// Remove HGSS, useless energy, 25th ann reprints, and Red Star Promos
	for (const setName in setsData) {
		const setInfo = setsData[setName];
		if (
			BANNED_SETS.includes(setInfo.externalId) ||
			!SUPPORTED_SERIES.includes(setInfo.block)
		) {
			delete setsData[setName];
			continue;
		}

		setsData[setName] = setInfo.externalId;
	}

	return setsData;
}
