import {
	type Metric,
	type Options,
	parseMetric,
	parseOnly,
} from "../options.ts";
import { assertKnown, type Bag, int, share } from "./validate.ts";

export type { Bag } from "./validate.ts";

/** Reduce the parsed bag to Options after rejecting undeclared flags. */
export function toOptions(bag: Bag): Options {
	assertKnown(bag);
	const columns = bag.columns !== undefined ? String(bag.columns) : undefined;
	return {
		ccPlan: String(bag.ccPlan ?? "goat"),
		workload: {
			input: int("in", bag.in),
			cacheRead: int("cache", bag.cache),
			output: int("out", bag.out),
		},
		metric: parseMetric(
			bag.metric === undefined ? undefined : String(bag.metric),
		) as Metric,
		model: bag.model === undefined ? undefined : String(bag.model),
		only: parseOnly(bag.only === undefined ? undefined : String(bag.only)),
		columns:
			columns === undefined
				? undefined
				: columns
						.split(",")
						.map((c) => c.trim())
						.filter(Boolean),
		width: bag.width === undefined ? undefined : int("width", bag.width),
		fit: bag.fit === true,
		bench: String(bag.bench ?? "cc"),
		benchWeight: share("bench-weight", bag.benchWeight),
		tpsWeight: share("tps-weight", bag.tpsWeight),
		benchName:
			bag.benchName === undefined ? undefined : String(bag.benchName),
		benchKey: bag.benchKey === undefined ? undefined : String(bag.benchKey),
		noFallback: bag.fallback === false,
		refresh: bag.refresh === true,
		noAbility: bag.ability === false,
		peak: bag.peak === true,
		asc: bag.asc === true,
		json: bag.json === true,
		detail: bag.detail === true,
		noColor: bag.color === false,
		check: bag.check === true,
		help: false,
	};
}
