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
  win              side with the lower per-request cost
  cost             0-100 cost index, lower is better
  val              0-100 ability-aware value score

Presets: default = model + allow/reqmo/per1k/reqdollar for both sides + win + cost + val
         --detail = every column, untrimmed
         --fit = every column, trimmed to the terminal width`;
