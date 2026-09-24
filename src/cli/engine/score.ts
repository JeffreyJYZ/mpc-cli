import type { EntryMetrics } from "../../types.ts";
import type { ScaleMode } from "../options.ts";
import { logMinmax, minmax } from "./cost.ts";

/** Everything the scorer can be told to do differently. */
export interface ScoreConfig {
	abilityWeight: number;
	tpsWeight: number;
	/** volume, cache, output — normalised to sum 1. */
	idxWeights?: number[];
	/** ability, tps, volume, cache, output — normalised to sum 1. */
	valWeights?: number[];
	scale: ScaleMode;
	inheritSuffixes?: string[];
	window?: [number, number];
}

export const DEFAULT_SCORE: ScoreConfig = {
	abilityWeight: 0.35,
	tpsWeight: 0.1,
	scale: "log",
};

function normalise(
	weights: number[] | undefined,
	fallback: number[],
): number[] {
	const values =
		weights && weights.length === fallback.length ? weights : fallback;
	const total = values.reduce((a, b) => a + b, 0);
	return total > 0 ? values.map((v) => v / total) : fallback;
}

const scale = (values: number[], mode: ScaleMode): number[] =>
	mode === "linear" ? minmax(values) : logMinmax(values);

/** COST index (inverted later): volume / cache price / output price. */
export function assignIndex(
	metrics: EntryMetrics[],
	weights?: number[],
	mode: ScaleMode = "log",
): void {
	const [wVolume, wCache, wOutput] = normalise(weights, [0.6, 0.2, 0.2]);
	const priced = metrics.filter((m) => Number.isFinite(m.requestsPerMonth));
	const volume = minmax(
		priced.map((m) => Math.log10(Math.max(m.requestsPerMonth, 1))),
	);
	const cache = scale(
		priced.map((m) => m.pricing.cacheRead),
		mode,
	);
	const output = scale(
		priced.map((m) => m.pricing.output),
		mode,
	);

	priced.forEach((m, i) => {
		m.index = Math.round(
			100 *
				((wVolume ?? 0.6) * (volume[i] ?? 0.5) +
					(wCache ?? 0.2) * (1 - (cache[i] ?? 0.5)) +
					(wOutput ?? 0.2) * (1 - (output[i] ?? 0.5))),
		);
	});
	for (const m of metrics) {
		if (!Number.isFinite(m.requestsPerMonth)) m.index = 100;
		else if (m.requestsPerMonth <= 0) m.index = 0;
	}
}

/** VAL: ability / speed / volume / cache / output. Unscored models stay null. */
export function assignValueIndex(
	metrics: EntryMetrics[],
	config: ScoreConfig,
): void {
	const weights = normalise(config.valWeights, [
		config.abilityWeight,
		config.tpsWeight,
		(1 - config.abilityWeight - config.tpsWeight) * 0.5,
		(1 - config.abilityWeight - config.tpsWeight) * 0.25,
		(1 - config.abilityWeight - config.tpsWeight) * 0.25,
	]);
	const [wAbility, wTps, wVolume, wCache, wOutput] = weights;
	const scored = metrics.filter((m) => m.ability !== null);
	const priced = metrics.filter((m) => Number.isFinite(m.requestsPerMonth));
	const speeded = metrics.filter((m) => m.tps !== null);

	const ability = minmax(scored.map((m) => m.ability ?? 0));
	const speed = scale(
		speeded.map((m) => m.tps ?? 1),
		config.scale,
	);
	const volume = minmax(
		priced.map((m) => Math.log10(Math.max(m.requestsPerMonth, 1))),
	);
	const cache = scale(
		priced.map((m) => m.pricing.cacheRead),
		config.scale,
	);
	const output = scale(
		priced.map((m) => m.pricing.output),
		config.scale,
	);

	const of = <T>(items: T[], values: number[]): Map<T, number> =>
		new Map(items.map((item, i) => [item, values[i] ?? 0.5]));
	const byVolume = of(priced, volume);
	const byCache = of(priced, cache);
	const byOutput = of(priced, output);
	const byAbility = of(scored, ability);
	const bySpeed = of(speeded, speed);

	for (const m of scored) {
		if (!Number.isFinite(m.requestsPerMonth)) {
			m.valueIndex = 100;
			continue;
		}
		m.valueIndex = Math.round(
			100 * (wAbility ?? 0) * (byAbility.get(m) ?? 0.5) +
				100 * (wTps ?? 0) * (bySpeed.get(m) ?? 0.5) +
				100 * (wVolume ?? 0) * (byVolume.get(m) ?? 0.5) +
				100 * (wCache ?? 0) * (1 - (byCache.get(m) ?? 0.5)) +
				100 * (wOutput ?? 0) * (1 - (byOutput.get(m) ?? 0.5)),
		);
	}
}
