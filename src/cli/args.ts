import type { Workload } from "../types.ts";

export type Metric = "val" | "cost" | "perreq" | "req" | "name";

export interface Options {
	ccPlan: string;
	workload: Workload;
	metric: Metric;
	model?: string;
	only: "both" | "all";
	columns?: string[];
	width?: number;
	fit: boolean;
	bench: string;
	benchWeight: number;
	tpsWeight: number;
	benchName?: string;
	benchKey?: string;
	noFallback: boolean;
	refresh: boolean;
	noAbility: boolean;
	peak: boolean;
	asc: boolean;
	json: boolean;
	detail: boolean;
	noColor: boolean;
	check: boolean;
	help: boolean;
}

export const DEFAULTS = { input: 800, cacheRead: 50_000, output: 200 };
const METRICS: Metric[] = ["val", "cost", "perreq", "req", "name"];

export function parseMetric(value: string | undefined): Metric {
	if (!METRICS.includes(value as Metric)) {
		throw new Error(`unknown --metric "${value}"`);
	}
	return value as Metric;
}

export function parseOnly(value: string | undefined): "both" | "all" {
	if (value !== "both" && value !== "all") {
		throw new Error(`--only expects "both" or "all", got "${value}"`);
	}
	return value;
}

export { parseArgs } from "./parse.ts";
