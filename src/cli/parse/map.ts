import {
	type Format,
	type Metric,
	type Options,
	parseFormat,
	parseMetric,
	parseOnly,
	type ScaleMode,
} from "~/cli/options.ts";
import {
	colorMode,
	numbers,
	pair,
	presets,
	usageWindow,
	words,
} from "./fields.ts";
import { assertKnown, assertValues, type Bag, int, share } from "./validate.ts";

export type { Bag } from "./validate.ts";

const DEFAULTS = {
	ccPlan: "goat",
	in: 800,
	cache: 50_000,
	out: 200,
	reasoning: 0,
	cacheWrite: 0,
	shape: "off",
	metric: "val",
	only: "all",
	bench: "cc",
	benchWeight: 0.35,
	tpsWeight: 0.1,
	costThresholds: [30, 60],
	valThresholds: [40, 70],
	scale: "log",
	format: "table",
} as const;

const pick = (bag: Bag, key: string): unknown =>
	bag[key] === undefined ? DEFAULTS[key as keyof typeof DEFAULTS] : bag[key];

/** Reduce the merged bag (plugins < config < CLI) to Options. */
export function toOptions(bag: Bag): Options {
	assertKnown(bag);
	assertValues(bag);
	const columns = bag.columns === undefined ? undefined : String(bag.columns);
	const window = numbers(bag, "window");
	return {
		ccPlan: String(pick(bag, "ccPlan")),
		workload: {
			input: int("in", pick(bag, "in")),
			cacheRead: int("cache", pick(bag, "cache")),
			output: int("out", pick(bag, "out")),
			reasoning: int("reasoning", pick(bag, "reasoning")),
			cacheWrite: int("cache-write", pick(bag, "cacheWrite")),
		},
		// A bare `--shape` means "measure it" (`cac` yields `true`); the default
		// with no flag at all is `off`.
		shape: bag.shape === true ? "measured" : String(pick(bag, "shape")),
		since: bag.since === undefined ? undefined : String(bag.since),
		metric: parseMetric(String(pick(bag, "metric"))) as Metric,
		model: bag.model === undefined ? undefined : String(bag.model),
		only: parseOnly(String(pick(bag, "only"))),
		columns:
			columns === undefined
				? undefined
				: columns
						.split(",")
						.map((c) => c.trim())
						.filter(Boolean),
		preset: bag.preset === undefined ? undefined : String(bag.preset),
		presets: presets(bag),
		detail: bag.detail === true,
		minimal: bag.minimal === true,
		medium: bag.medium === true,
		// Width 0 is meaningless and silently disabled trimming; cac coerces a
		// blank `--width ""` to 0, so require at least one column.
		width: bag.width === undefined ? undefined : int("width", bag.width, 1),
		fit: bag.fit !== false,
		bench: String(pick(bag, "bench")),
		benchWeight: share("bench-weight", pick(bag, "benchWeight")),
		tpsWeight: share("tps-weight", pick(bag, "tpsWeight")),
		idxWeights: numbers(bag, "idxWeights"),
		valWeights: numbers(bag, "valWeights"),
		scale: String(pick(bag, "scale")) as ScaleMode,
		// Absent means "use the built-in suffixes"; an empty list means "inherit
		// nothing", which is why this must stay undefined rather than become []:
		// the lookups read an empty array as a deliberate opt-out.
		inheritSuffixes: (() => {
			const suffixes = words(bag, "inheritSuffixes");
			return suffixes.length > 0 ? suffixes : undefined;
		})(),
		window:
			window && window.length === 2
				? [window[0] ?? 0, window[1] ?? 0]
				: undefined,
		costThresholds: pair(pick(bag, "costThresholds"), "cost-thresholds"),
		valThresholds: pair(pick(bag, "valThresholds"), "val-thresholds"),
		benchName:
			bag.benchName === undefined ? undefined : String(bag.benchName),
		aaKey: bag.aaKey === undefined ? undefined : String(bag.aaKey),
		noFallback: bag.fallback === false,
		refresh: bag.refresh === true,
		noAbility: bag.ability === false,
		peak: bag.peak === true,
		asc: bag.asc === true,
		json: bag.json === true,
		format: parseFormat(
			bag.format === undefined ? "table" : String(bag.format),
		) as Format,
		colorMode: colorMode(bag.color),
		check: bag.check === true,
		printConfig: bag.printConfig === true,
		usage: bag.usage === true,
		usageFile:
			bag.usageFile === undefined ? undefined : String(bag.usageFile),
		usageLog: bag.usageLog === undefined ? undefined : String(bag.usageLog),
		usageDb: bag.usageDb === undefined ? undefined : String(bag.usageDb),
		usageMonths:
			bag.usageMonths === undefined ? 1 : Number(bag.usageMonths),
		usageWindow: usageWindow(bag.usageWindow),
		plugins: words(bag, "plugins"),
	};
}
