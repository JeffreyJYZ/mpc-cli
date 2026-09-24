/** Speed-variant suffixes that share the base model's weights. */
const SPEED_SUFFIXES = ["ultraspeed", "highspeed", "fastx", "fast"];

/**
 * Benchmark lookup. A speed variant has the base model's weights, so it
 * inherits the base ability when the benchmark has no row of its own.
 * Throughput is not inherited, since serving differs. `suffixes` is
 * configurable; empty means no inheritance.
 */
export function lookupAbility(
	scores: Map<string, number>,
	key: string,
	suffixes: string[] = SPEED_SUFFIXES,
): number | null {
	const direct = scores.get(key);
	if (direct !== undefined) return direct;
	// FlashX is the faster tier of Flash, not of the base model.
	if (key.endsWith("flashx")) {
		const flash = scores.get(`${key.slice(0, -"flashx".length)}flash`);
		if (flash !== undefined) return flash;
	}
	for (const suffix of suffixes) {
		if (key.endsWith(suffix)) {
			const base = scores.get(key.slice(0, -suffix.length));
			if (base !== undefined) return base;
		}
	}
	return null;
}
