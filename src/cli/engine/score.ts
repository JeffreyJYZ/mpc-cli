import type { EntryMetrics } from "../../types.ts";
import { logMinmax, minmax } from "./scale.ts";

/**
 * Blended 0-100 cost/value score across every entry: 60% request volume
 * (log-scaled), 20% cache-read price, 20% output price. Higher is better;
 * `COST` renders it inverted.
 */
export function assignIndex(metrics: EntryMetrics[]): void {
	const priced = metrics.filter((m) => Number.isFinite(m.requestsPerMonth));
	const volume = minmax(
		priced.map((m) => Math.log10(Math.max(m.requestsPerMonth, 1))),
	);
	const cache = logMinmax(priced.map((m) => m.pricing.cacheRead));
	const output = logMinmax(priced.map((m) => m.pricing.output));

	priced.forEach((m, i) => {
		const nVolume = volume[i] ?? 0.5;
		m.index = Math.round(
			100 *
				(0.6 * nVolume +
					0.2 * (1 - (cache[i] ?? 0.5)) +
					0.2 * (1 - (output[i] ?? 0.5))),
		);
	});

	for (const m of metrics) {
		if (!Number.isFinite(m.requestsPerMonth)) m.index = 100;
		else if (m.requestsPerMonth <= 0) m.index = 0;
	}
}

/**
 * Ability-aware value score. Ability and speed get their own weights; the rest
 * splits volume/cache/output 50/25/25. Unscored models stay null. A model with
 * no speed figure gets the neutral 0.5 rather than a penalty.
 */
export function assignValueIndex(
	metrics: EntryMetrics[],
	abilityWeight: number,
	tpsWeight: number,
): void {
	const wAbility = Math.min(Math.max(abilityWeight, 0), 1);
	const wTps = Math.min(Math.max(tpsWeight, 0), 1 - wAbility);
	const scored = metrics.filter((m) => m.ability !== null);
	const priced = metrics.filter((m) => Number.isFinite(m.requestsPerMonth));
	const speeded = metrics.filter((m) => m.tps !== null);

	const ability = minmax(scored.map((m) => m.ability ?? 0));
	const speed = logMinmax(speeded.map((m) => m.tps ?? 1));
	const volume = minmax(
		priced.map((m) => Math.log10(Math.max(m.requestsPerMonth, 1))),
	);
	const cache = logMinmax(priced.map((m) => m.pricing.cacheRead));
	const output = logMinmax(priced.map((m) => m.pricing.output));

	const of = <T>(items: T[], values: number[]): Map<T, number> =>
		new Map(items.map((item, i) => [item, values[i] ?? 0.5]));
	const byVolume = of(priced, volume);
	const byCache = of(priced, cache);
	const byOutput = of(priced, output);
	const byAbility = of(scored, ability);
	const bySpeed = of(speeded, speed);

	const rest = Math.max(0, 1 - wAbility - wTps);
	const wVolume = rest * 0.5;
	const wCache = rest * 0.25;
	const wOutput = rest * 0.25;

	for (const m of scored) {
		if (!Number.isFinite(m.requestsPerMonth)) {
			m.valueIndex = 100;
			continue;
		}
		m.valueIndex = Math.round(
			100 *
				(wAbility * (byAbility.get(m) ?? 0.5) +
					wTps * (bySpeed.get(m) ?? 0.5) +
					wVolume * (byVolume.get(m) ?? 0.5) +
					wCache * (1 - (byCache.get(m) ?? 0.5)) +
					wOutput * (1 - (byOutput.get(m) ?? 0.5))),
		);
	}
}
