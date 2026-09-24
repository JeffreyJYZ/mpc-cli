#!/usr/bin/env bun
import { buildRows } from "./metrics.ts";
import { normalizeKey } from "./normalize.ts";
import {
	COLUMN_IDS,
	DEFAULT_COLUMNS,
	DETAIL_COLUMNS,
	fitColumns,
	renderJson,
	renderText,
	setColor,
} from "./render.ts";
import { loadAbility } from "./sources/bench.ts";
import { CC_PLANS, loadCcCatalog, loadCcPlan } from "./sources/commandcode.ts";
import {
	loadOcGoCatalog,
	loadOcGoModelIds,
	ocGoPlan,
} from "./sources/opencodeGo.ts";
import type { CatalogEntry, CompareRow, Workload } from "./types.ts";

type Metric = "val" | "cost" | "perreq" | "req" | "name";

interface Options {
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

const DEFAULTS = {
	input: 800,
	cacheRead: 50_000,
	output: 200,
};

const USAGE = `mpc — compare model pricing across OpenCode Go and CommandCode plans

Usage: mpc [options]

Options:
  --cc-plan <id>   CommandCode plan: ${Object.keys(CC_PLANS).join(", ")} (default goat)
  --in <n>         fixed input tokens per request (default ${DEFAULTS.input})
  --cache <n>      fixed cache-read tokens per request (default ${DEFAULTS.cacheRead})
  --out <n>        fixed output tokens per request (default ${DEFAULTS.output})
  --metric <name>  sort by: val | cost | perreq | req | name (default val)
                   cost ascends (0 is best), perreq ascends ($/req), val/req descend;
                   --asc flips; rows with no VAL always sort last
  --model <re>     only rows whose name matches (regex, falls back to substring)
  --only <scope>   both = models on both providers, all = union (default all)
  --fit            show the widest column set that fits the terminal
  --bench <src>    ability scores: cc | aa | aa-web | file:<path> | url:<url>
                   (default cc, filled from the aa-web scrape for unscored models)
  --bench-weight   ability share of VAL, 0-1 (default 0.35)
  --tps-weight     output-speed share of VAL, 0-1 (default 0.1)
  --bench-name     footer label for the source (else source's own)
  --bench-key      Artificial Analysis API key (else AA_API_KEY)
  --no-fallback    with --bench cc, do not fill from the aa-web scrape
  --refresh        ignore the aa-web cache
  --no-ability     hide ability and VAL
  --peak           use peak-rate rows (OpenCode Go DeepSeek off/on-peak)
  --asc            sort ascending instead of descending
  --detail         preset: add raw token rates and 5h/week columns
  --width <n>      force table width; otherwise auto-detect and drop optional
                   columns (rates, req/$, 5h/wk) to fit the terminal
  --columns <ids>  comma-separated columns to show, in order (overrides --detail).
                   ids: ${COLUMN_IDS.join(", ")}
                   use --columns help for descriptions
  --json           machine-readable output
  --no-color       disable ANSI colour
  --check          validate live sources, report drift, then exit
  -h, --help       show this help`;

const COLUMN_HELP = `Available columns (--columns a,b,c):
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
  win              side with the lower per-request cost
  cost             0-100 cost/value score, no ability
  val              0-100 ability-aware value score

Presets: default = model + allow/reqmo/per1k/reqdollar for both sides + win + cost + val
         --detail = every column, untrimmed
         --fit = every column, trimmed to the terminal width`;

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
		metric: "val",
		only: "all",
		fit: false,
		bench: "cc",
		benchWeight: 0.35,
		tpsWeight: 0.1,
		noFallback: false,
		refresh: false,
		noAbility: false,
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
				if (
					!["val", "cost", "perreq", "req", "name"].includes(
						value ?? "",
					)
				) {
					throw new Error(`unknown --metric "${value}"`);
				}
				options.metric = value as Metric;
				break;
			}
			case "--model":
				options.model = next();
				break;
			case "--fit":
				options.fit = true;
				break;
			case "--bench":
				options.bench = next() ?? options.bench;
				break;
			case "--bench-weight":
				options.benchWeight = Number(next());
				if (
					!Number.isFinite(options.benchWeight) ||
					options.benchWeight < 0 ||
					options.benchWeight > 1
				) {
					throw new Error(
						"--bench-weight expects a number between 0 and 1",
					);
				}
				break;
			case "--tps-weight":
				options.tpsWeight = Number(next());
				if (
					!Number.isFinite(options.tpsWeight) ||
					options.tpsWeight < 0 ||
					options.tpsWeight > 1
				) {
					throw new Error(
						"--tps-weight expects a number between 0 and 1",
					);
				}
				break;
			case "--bench-name":
				options.benchName = next();
				break;
			case "--bench-key":
				options.benchKey = next();
				break;
			case "--no-fallback":
				options.noFallback = true;
				break;
			case "--refresh":
				options.refresh = true;
				break;
			case "--no-ability":
				options.noAbility = true;
				break;
			case "--width":
				options.width = parseIntFlag("width", next());
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
	const maxValue = (r: CompareRow): number | null => {
		const values = [r.oc?.valueIndex, r.cc?.valueIndex].filter(
			(value): value is number => typeof value === "number",
		);
		return values.length === 0 ? null : Math.max(...values);
	};
	const maxIndex = (r: CompareRow): number =>
		Math.max(r.oc?.index ?? -1, r.cc?.index ?? -1);
	const maxRequests = (r: CompareRow): number =>
		Math.max(r.oc?.requestsPerMonth ?? -1, r.cc?.requestsPerMonth ?? -1);
	const minPay = (r: CompareRow): number => {
		const values = [r.oc?.payPerRequest, r.cc?.payPerRequest].filter(
			(value): value is number => value !== undefined,
		);
		return values.length === 0
			? Number.POSITIVE_INFINITY
			: Math.min(...values);
	};

	// Ascending means "lower is better" (cost, $/req); --asc flips the default.
	switch (metric) {
		case "name": {
			const sorted = [...rows].sort((a, b) =>
				a.name.localeCompare(b.name),
			);
			return asc ? sorted : sorted.reverse();
		}
		case "val": {
			const scored = rows
				.filter((r) => maxValue(r) !== null)
				.sort(
					(a, b) =>
						((maxValue(a) ?? 0) - (maxValue(b) ?? 0)) *
						(asc ? 1 : -1),
				);
			const unscored = rows.filter((r) => maxValue(r) === null);
			return [...scored, ...unscored];
		}
		case "cost":
			return [...rows].sort(
				(a, b) => (maxIndex(a) - maxIndex(b)) * (asc ? -1 : 1),
			);
		case "perreq":
			return [...rows].sort(
				(a, b) => (minPay(a) - minPay(b)) * (asc ? -1 : 1),
			);
		case "req":
			return [...rows].sort(
				(a, b) => (maxRequests(a) - maxRequests(b)) * (asc ? 1 : -1),
			);
	}
}

async function collect(options: Options) {
	const [ocEntries, ccEntries, ccPlanInfo] = await Promise.all([
		loadOcGoCatalog(options.peak),
		loadCcCatalog(options.ccPlan),
		loadCcPlan(options.ccPlan),
	]);
	// Ability is loaded after the catalogs so fills can be limited to our rows.
	const keys = new Set(
		[...ocEntries, ...ccEntries].map((entry) => entry.key),
	);
	const ability = options.noAbility
		? {
				intelligence: new Map<string, number>(),
				tps: new Map<string, number>(),
				label: "",
				note: undefined,
			}
		: await loadAbility({
				source: options.bench,
				key: options.benchKey,
				keys,
				fallback: !options.noFallback,
				refresh: options.refresh,
			});
	const ocPlanInfo = ocGoPlan(ocEntries);
	const rows = buildRows(
		ocEntries,
		ccEntries,
		ocPlanInfo,
		ccPlanInfo,
		options.workload,
		ability.intelligence,
		options.benchWeight,
		ability.tps,
		options.tpsWeight,
	);
	return { ocEntries, ccEntries, ocPlanInfo, ccPlanInfo, rows, ability };
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

	const requested =
		options.columns ??
		(options.detail || options.fit ? DETAIL_COLUMNS : DEFAULT_COLUMNS);
	const unknown = requested.filter((id) => !COLUMN_IDS.includes(id));
	if (unknown.length > 0) {
		throw new Error(
			`unknown column(s): ${unknown.join(", ")} — valid: ${COLUMN_IDS.join(", ")}`,
		);
	}

	const { ocEntries, ccEntries, ocPlanInfo, ccPlanInfo, rows, ability } =
		await collect(options);

	if (options.check) {
		return runCheck(options, ocEntries, ccEntries, rows, ability);
	}

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
		abilityLabel: options.noAbility
			? undefined
			: (options.benchName ?? ability.label),
		abilityNote: options.noAbility ? undefined : ability.note,
	};
	if (options.json) {
		console.log(renderJson(result, meta));
		return 0;
	}
	const limit = options.width ?? process.stdout.columns ?? 120;
	const fitted =
		options.fit && !options.columns
			? fitColumns(result, requested, limit)
			: { ids: requested, dropped: [] as string[] };
	renderText(result, meta, fitted.ids, fitted.dropped);
	console.log(
		`\n${result.length} models · OpenCode Go vs CommandCode ${ccPlanInfo.label} · ${ocEntries.length} OpenCode / ${ccEntries.length} CommandCode entries`,
	);
	return 0;
}

async function runCheck(
	_options: Options,
	ocEntries: CatalogEntry[],
	ccEntries: CatalogEntry[],
	rows: CompareRow[],
	ability: {
		label: string;
		note?: string;
		intelligence: Map<string, number>;
		tps: Map<string, number>;
	},
): Promise<number> {
	const ocKeys = new Set(ocEntries.map((e) => e.key));
	const ccKeys = new Set(ccEntries.map((e) => e.key));
	const onlyOc = [...ocKeys].filter((k) => !ccKeys.has(k));
	const onlyCc = [...ccKeys].filter((k) => !ocKeys.has(k));

	console.log(`OpenCode entries parsed: ${ocEntries.length}`);
	console.log(`CommandCode entries: ${ccEntries.length}`);
	console.log(
		`matched models:       ${rows.filter((r) => r.oc && r.cc).length}`,
	);
	console.log(
		`free OpenCode models: ${ocEntries.filter((e) => e.allowance === 0).length}`,
	);

	const scored = rows.filter(
		(r) => r.oc?.ability != null || r.cc?.ability != null,
	).length;
	console.log(
		`ability source:       ${ability.label || "disabled"} (${ability.intelligence.size} scores, ${ability.tps.size} speed, ${scored}/${rows.length} rows scored)`,
	);
	if (ability.note) console.log(`ability note:         ${ability.note}`);
	const unscored = rows
		.filter((r) => (r.oc?.ability ?? r.cc?.ability ?? null) === null)
		.map((r) => r.key);
	if (unscored.length > 0) {
		const head = unscored.slice(0, 20).join(", ");
		const more =
			unscored.length > 20 ? `  +${unscored.length - 20} more` : "";
		console.log(`ability missing (${unscored.length}): ${head}${more}`);
	}

	const modelIds = await loadOcGoModelIds();
	console.log(`OpenCode /zen/go/v1/models ids: ${modelIds.length}`);

	// live oc-go model ids the docs pricing table does not cover.
	const unpriced = modelIds.filter((id) => !ocKeys.has(normalizeKey(id)));
	console.log(
		`OpenCode ids missing from docs table (${unpriced.length}): ${unpriced.join(", ") || "—"}`,
	);

	console.log(
		`\nonly in OpenCode (${onlyOc.length}): ${onlyOc.join(", ") || "—"}`,
	);
	console.log(
		`only in CommandCode (${onlyCc.length}): ${onlyCc.join(", ") || "—"}`,
	);
	return 0;
}
