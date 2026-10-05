import type { Workload } from "~/types.ts";

export type Metric = "val" | "cost" | "perreq" | "req" | "name";
export type ColorMode = "auto" | "always" | "never";
export type ScaleMode = "log" | "linear";
export type Format = "table" | "json" | "csv" | "md";

export interface Options {
	ccPlan: string;
	workload: Workload;
	/** `off` (the default), `measured`, or a path to a saved reqshape JSON. */
	shape: string;
	/** Lower bound for the measured shape, passed through to reqshape. */
	since?: string;
	metric: Metric;
	model?: string;
	only: "both" | "all";
	columns?: string[];
	preset?: string;
	presets: Record<string, string[]>;
	detail: boolean;
	minimal: boolean;
	medium: boolean;
	width?: number;
	fit: boolean;
	bench: string;
	benchWeight: number;
	tpsWeight: number;
	valWeights?: number[];
	scale: ScaleMode;
	inheritSuffixes?: string[];
	window?: [number, number];
	costThresholds: [number, number];
	valThresholds: [number, number];
	benchName?: string;
	aaKey?: string;
	noFallback: boolean;
	refresh: boolean;
	noAbility: boolean;
	peak: boolean;
	asc: boolean;
	json: boolean;
	format: Format;
	colorMode: ColorMode;
	check: boolean;
	printConfig: boolean;
	usage: boolean;
	usageFile?: string;
	usageLog?: string;
	usageDb?: string;
	usageMonths: number;
	usageWindow: "period" | "all" | `${number}d`;
	plugins: string[];
}

export const DEFAULTS = {
	input: 800,
	cacheRead: 50_000,
	output: 200,
};

const METRICS: Metric[] = ["val", "cost", "perreq", "req", "name"];
const FORMATS: Format[] = ["table", "json", "csv", "md"];

export function parseMetric(value: string | undefined): Metric {
	if (!METRICS.includes(value as Metric)) {
		throw new Error(`unknown --metric "${value}"`);
	}
	return value as Metric;
}

export function parseFormat(value: string | undefined): Format {
	if (!FORMATS.includes(value as Format)) {
		throw new Error(
			`unknown --format "${value}" (table | json | csv | md)`,
		);
	}
	return value as Format;
}

export function parseOnly(value: string | undefined): "both" | "all" {
	if (value !== "both" && value !== "all") {
		throw new Error(`--only expects "both" or "all", got "${value}"`);
	}
	return value;
}

export const COLUMN_HELP = `Available columns (--columns a,b,c):
  model            model name
  oc-rates         OpenCode in/out/cache token rates ($/M)
  oc-allow         OpenCode monthly allowance for the model
  oc-req5h         requests the OpenCode 5-hour window allows
  oc-reqwk         requests the OpenCode weekly window allows
  oc-reqmo         requests the OpenCode monthly allowance buys
  oc-per1k         OpenCode cost per 1,000 requests
  oc-reqdollar     OpenCode requests per $1 of subscription
  cc-*             the same set for the CommandCode plan
  ability          benchmark score for the model
  tps              output tokens per second
  deal             active CommandCode promotion (-98%, Free, 2x usage)
  win              side with the lower per-request cost
  cost             0-100 cost index, lower is better
  val              0-100 ability-aware value score

Presets: default   = every column, trimmed to the terminal width (--no-fit keeps them all)
         --minimal = model + req/mo both sides + win + val
         --medium  = allowance and the rate views per side + win + cost + val
         --detail  = every column, untrimmed (for copy/paste or agents)
         --columns = an exact list; bypasses presets and trimming`;
