#!/usr/bin/env bun
import { buildRows } from "./metrics.ts";
import {
	COLUMN_IDS,
	DEFAULT_COLUMNS,
	DETAIL_COLUMNS,
	renderJson,
	renderText,
	setColor,
} from "./render.ts";
import { CC_PLANS, loadCcCatalog, loadCcPlan } from "./sources/commandcode.ts";
import {
	loadOcGoCatalog,
	loadOcGoModelIds,
	ocGoPlan,
} from "./sources/opencodeGo.ts";
import type { CatalogEntry, CompareRow, Workload } from "./types.ts";

type Metric = "index" | "req" | "cost" | "name";

interface Options {
	ccPlan: string;
	workload: Workload;
	metric: Metric;
	model?: string;
	only: "both" | "all";
	columns?: string[];
	peak: boolean;
	asc: boolean;
	json: boolean;
	detail: boolean;
	noColor: boolean;
	check: boolean;
	help: boolean;
}

const DEFAULTS = {
	input: 800,
	cacheRead: 50_000,
	output: 200,
};

const USAGE = `mpc — compare model pricing across opencode Go and Command Code plans

Usage: mpc [options]

Options:
  --cc-plan <id>   Command Code plan: ${Object.keys(CC_PLANS).join(", ")} (default goat)
  --in <n>         fixed input tokens per request (default ${DEFAULTS.input})
  --cache <n>      fixed cache-read tokens per request (default ${DEFAULTS.cacheRead})
  --out <n>        fixed output tokens per request (default ${DEFAULTS.output})
  --metric <name>  sort by: index | req | cost | name (default index)
  --model <re>     only rows whose name matches (regex, falls back to substring)
  --only <scope>   both = models on both providers, all = union (default all)
  --peak           use peak-rate rows (opencode Go DeepSeek off/on-peak)
  --asc            sort ascending instead of descending
  --detail         preset: add raw token rates and 5h/week columns
  --columns <ids>  comma-separated columns to show, in order (overrides --detail).
                   ids: ${COLUMN_IDS.join(", ")}
                   use --columns help for descriptions
  --json           machine-readable output
  --no-color       disable ANSI colour
  --check          validate live sources, report drift, then exit
  -h, --help       show this help`;

const COLUMN_HELP = `Available columns (--columns a,b,c):
  model          model name
  oc-rates       oc-go in/out/cache token rates ($/M)
  oc-allow       oc-go monthly allowance for the model
  oc-req5h       requests the oc-go 5-hour window allows
  oc-reqwk       requests the oc-go weekly window allows
  oc-reqmo       requests the oc-go monthly allowance buys
  oc-per1k       oc-go cost per 1,000 requests
  oc-reqdollar   oc-go requests per $1 of subscription
  cc-*           same set for the Command Code plan
  win            side with the lower per-request cost
  idx            0-100 blended value score

Presets: default = model + allow/reqmo/per1k/reqdollar for both sides + win + idx
         --detail = default + rates + req5h + reqwk`;

function parseIntFlag(name: string, value: string | undefined): number {
	const n = Number(value);
	if (value === undefined || !Number.isFinite(n) || n < 0) {
		throw new Error(
			`--${name} expects a non-negative number, got "${value}"`,
		);
	}
	return n;
}

export function parseArgs(argv: string[]): Options {
	const options: Options = {
		ccPlan: "goat",
		workload: { ...DEFAULTS },
		metric: "index",
		only: "all",
		peak: false,
		asc: false,
		json: false,
		detail: false,
		noColor: false,
		check: false,
		help: false,
	};

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i] ?? "";
		const [flag, inline] = arg.split("=", 2);
		const next = (): string | undefined => inline ?? argv[++i];

		switch (flag) {
			case "-h":
			case "--help":
				options.help = true;
				break;
			case "--cc-plan":
				options.ccPlan = next() ?? options.ccPlan;
				break;
			case "--in":
				options.workload.input = parseIntFlag("in", next());
				break;
			case "--cache":
				options.workload.cacheRead = parseIntFlag("cache", next());
				break;
			case "--out":
				options.workload.output = parseIntFlag("out", next());
				break;
			case "--metric": {
				const value = next();
				if (!["index", "req", "cost", "name"].includes(value ?? "")) {
					throw new Error(`unknown --metric "${value}"`);
				}
				options.metric = value as Metric;
				break;
			}
			case "--model":
				options.model = next();
				break;
			case "--columns": {
				const value = next() ?? "";
				options.columns = value
					.split(",")
					.map((c) => c.trim())
					.filter(Boolean);
				break;
			}
			case "--only": {
				const value = next();
				if (value !== "both" && value !== "all") {
					throw new Error(
						`--only expects "both" or "all", got "${value}"`,
					);
				}
				options.only = value;
				break;
			}
			case "--peak":
				options.peak = true;
				break;
			case "--asc":
				options.asc = true;
				break;
			case "--json":
				options.json = true;
				break;
			case "--detail":
				options.detail = true;
				break;
			case "--no-color":
				options.noColor = true;
				break;
			case "--check":
				options.check = true;
				break;
			default:
				throw new Error(`unknown flag "${arg}"`);
		}
	}
	return options;
}

function matches(row: CompareRow, pattern: Options["model"]): boolean {
	if (!pattern) return true;
	try {
		const re = new RegExp(pattern, "i");
		return re.test(row.name) || re.test(row.key);
	} catch {
		return row.name.toLowerCase().includes(pattern.toLowerCase());
	}
}

function sortRows(
	rows: CompareRow[],
	metric: Metric,
	asc: boolean,
): CompareRow[] {
	const dir = asc ? 1 : -1;
	const by = {
		name: (r: CompareRow) => -r.name.localeCompare(r.name),
		index: (r: CompareRow) =>
			Math.max(r.oc?.index ?? -1, r.cc?.index ?? -1),
		req: (r: CompareRow) =>
			Math.max(
				r.oc?.requestsPerMonth ?? -1,
				r.cc?.requestsPerMonth ?? -1,
			),
		cost: (r: CompareRow) => {
			const values = [r.oc?.payPerRequest, r.cc?.payPerRequest].filter(
				(v): v is number => v !== undefined,
			);
			return values.length
				? -Math.min(...values)
				: Number.NEGATIVE_INFINITY;
		},
	};
	return [...rows].sort((a, b) => (by[metric](a) - by[metric](b)) * dir);
}

async function collect(options: Options) {
	const [ocEntries, ccEntries, ccPlanInfo] = await Promise.all([
		loadOcGoCatalog(options.peak),
		loadCcCatalog(options.ccPlan),
		loadCcPlan(options.ccPlan),
	]);
	const ocPlanInfo = ocGoPlan(ocEntries);
	const rows = buildRows(
		ocEntries,
		ccEntries,
		ocPlanInfo,
		ccPlanInfo,
		options.workload,
	);
	return { ocEntries, ccEntries, ocPlanInfo, ccPlanInfo, rows };
}

export async function run(argv: string[]): Promise<number> {
	const options = parseArgs(argv);
	if (options.help) {
		console.log(USAGE);
		return 0;
	}
	if (options.columns?.includes("help")) {
		console.log(COLUMN_HELP);
		return 0;
	}

	setColor(
		!options.noColor &&
			Boolean(process.stdout.isTTY) &&
			!process.env.NO_COLOR,
	);

	const columnIds =
		options.columns ?? (options.detail ? DETAIL_COLUMNS : DEFAULT_COLUMNS);
	const unknown = columnIds.filter((id) => !COLUMN_IDS.includes(id));
	if (unknown.length > 0) {
		throw new Error(
			`unknown column(s): ${unknown.join(", ")} — valid: ${COLUMN_IDS.join(", ")}`,
		);
	}

	const { ocEntries, ccEntries, ocPlanInfo, ccPlanInfo, rows } =
		await collect(options);

	if (options.check) return runCheck(options, ocEntries, ccEntries, rows);

	let result = rows.filter(
		(r) =>
			matches(r, options.model) &&
			(options.only === "all" || (r.oc && r.cc)),
	);
	result = sortRows(result, options.metric, options.asc);

	const meta = {
		ocPlan: ocPlanInfo,
		ccPlan: ccPlanInfo,
		workload: options.workload,
	};
	if (options.json) {
		console.log(renderJson(result, meta));
		return 0;
	}
	renderText(result, meta, columnIds);
	console.log(
		`\n${result.length} models · oc-go Go vs cc ${ccPlanInfo.label} · ${ocEntries.length} oc-go / ${ccEntries.length} cc entries`,
	);
	return 0;
}

async function runCheck(
	_options: Options,
	ocEntries: CatalogEntry[],
	ccEntries: CatalogEntry[],
	rows: CompareRow[],
): Promise<number> {
	const ocKeys = new Set(ocEntries.map((e) => e.key));
	const ccKeys = new Set(ccEntries.map((e) => e.key));
	const onlyOc = [...ocKeys].filter((k) => !ccKeys.has(k));
	const onlyCc = [...ccKeys].filter((k) => !ocKeys.has(k));

	console.log(`oc-go entries parsed: ${ocEntries.length}`);
	console.log(`cc entries parsed:    ${ccEntries.length}`);
	console.log(
		`matched models:       ${rows.filter((r) => r.oc && r.cc).length}`,
	);
	console.log(
		`free oc-go models:    ${ocEntries.filter((e) => e.allowance === 0).length}`,
	);

	const modelIds = await loadOcGoModelIds();
	console.log(`oc-go /zen/go/v1/models ids: ${modelIds.length}`);
	console.log(
		`\nonly in oc-go (${onlyOc.length}): ${onlyOc.join(", ") || "—"}`,
	);
	console.log(`only in cc (${onlyCc.length}): ${onlyCc.join(", ") || "—"}`);
	return 0;
}
