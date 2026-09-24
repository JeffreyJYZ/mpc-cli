/** Speed-variant suffixes that share the base model's weights. */
const SPEED_SUFFIXES = ["ultraspeed", "highspeed", "fastx", "fast"];

/**
 * Benchmark lookup. A speed variant (`...Fast`, `...HighSpeed`, `...UltraSpeed`)
 * has the base model's weights, so it inherits the base ability when the
 * benchmark has no row of its own. Throughput is not inherited, since serving
 * differs.
 */
export function lookupAbility(
	scores: Map<string, number>,
	key: string,
): number | null {
	const direct = scores.get(key);
	if (direct !== undefined) return direct;
	// FlashX is the faster tier of Flash, not of the base model: "glm53flashx"
	// inherits "glm53flash", not "glm53".
	if (key.endsWith("flashx")) {
		const flash = scores.get(`${key.slice(0, -"flashx".length)}flash`);
		if (flash !== undefined) return flash;
	}
	for (const suffix of SPEED_SUFFIXES) {
		if (key.endsWith(suffix)) {
			const base = scores.get(key.slice(0, -suffix.length));
			if (base !== undefined) return base;
		}
	}
	return null;
}
