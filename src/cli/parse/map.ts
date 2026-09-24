import {
	type ColorMode,
	type Format,
	type Metric,
	type Options,
	parseFormat,
	parseMetric,
	parseOnly,
	type ScaleMode,
} from "../options.ts";
import { assertKnown, type Bag, int, share } from "./validate.ts";

export type { Bag } from "./validate.ts";

const DEFAULTS = {
	ccPlan: "goat",
	in: 800,
	cache: 50_000,
	out: 200,
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

function numbers(bag: Bag, key: string): number[] | undefined {
	const value = bag[key];
	if (value === undefined || value === false) return undefined;
	const parts = Array.isArray(value) ? value : String(value).split(",");
	const nums = parts.map((part) => Number(part));
	if (nums.some((n) => !Number.isFinite(n))) {
		throw new Error(
			`--${key} expects comma-separated numbers, got "${value}"`,
		);
	}
	return nums;
}

function words(bag: Bag, key: string): string[] {
	const value = bag[key];
	if (value === undefined || value === false) return [];
	const parts = Array.isArray(value) ? value : String(value).split(",");
	return parts.map((part) => String(part).trim()).filter(Boolean);
}

function presets(bag: Bag): Record<string, string[]> {
	const value = bag.presets;
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	const out: Record<string, string[]> = {};
	for (const [name, ids] of Object.entries(
		value as Record<string, unknown>,
	)) {
		out[name] = Array.isArray(ids)
			? ids.map((id) => String(id).trim())
			: String(ids)
					.split(",")
					.map((id) => id.trim())
					.filter(Boolean);
	}
	return out;
}

function usageWindow(value: unknown): "period" | "all" | `${number}d` {
	if (value === "all") return "all";
	if (typeof value === "string" && /^\d+d$/.test(value)) {
		return value as `${number}d`;
	}
	return "period";
}

function colorMode(value: unknown): ColorMode {
	if (value === false || value === "never") return "never";
	if (value === "always") return "always";
	return "auto";
}

function pair(value: unknown, name: string): [number, number] {
	const nums = numbers({ v: value }, "v");
	if (nums?.length !== 2) {
		throw new Error(`--${name} expects two comma-separated numbers`);
	}
	return [nums[0] ?? 0, nums[1] ?? 0];
}

/** Reduce the merged bag (plugins < config < CLI) to Options. */
export function toOptions(bag: Bag): Options {
	assertKnown(bag);
	const columns = bag.columns === undefined ? undefined : String(bag.columns);
	const window = numbers(bag, "window");
	return {
		ccPlan: String(pick(bag, "ccPlan")),
		workload: {
			input: int("in", pick(bag, "in")),
			cacheRead: int("cache", pick(bag, "cache")),
			output: int("out", pick(bag, "out")),
		},
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
		width: bag.width === undefined ? undefined : int("width", bag.width),
		fit: bag.fit === true,
		bench: String(pick(bag, "bench")),
		benchWeight: share("bench-weight", pick(bag, "benchWeight")),
		tpsWeight: share("tps-weight", pick(bag, "tpsWeight")),
		idxWeights: numbers(bag, "idxWeights"),
		valWeights: numbers(bag, "valWeights"),
		scale: String(pick(bag, "scale")) as ScaleMode,
		inheritSuffixes: words(bag, "inheritSuffixes"),
		window:
			window && window.length === 2
				? [window[0] ?? 0, window[1] ?? 0]
				: undefined,
		costThresholds: pair(pick(bag, "costThresholds"), "cost-thresholds"),
		valThresholds: pair(pick(bag, "valThresholds"), "val-thresholds"),
		benchName:
			bag.benchName === undefined ? undefined : String(bag.benchName),
		benchKey: bag.benchKey === undefined ? undefined : String(bag.benchKey),
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
		usageMonths:
			bag.usageMonths === undefined ? 1 : Number(bag.usageMonths),
		usageWindow: usageWindow(bag.usageWindow),
		plugins: words(bag, "plugins"),
	};
}
