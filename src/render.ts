import type { CompareRow, EntryMetrics, PlanInfo, Workload } from "./types.ts";

let color = true;

export function setColor(enabled: boolean): void {
	color = enabled;
}

function paint(code: string, text: string): string {
	return color ? `\u001b[${code}m${text}\u001b[0m` : text;
}

export function fmtCount(n: number): string {
	if (!Number.isFinite(n)) return "∞";
	if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
	if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
	if (n >= 10) return n.toFixed(0);
	return n.toFixed(1);
}

export function fmtUsd(n: number): string {
	if (n === 0) return "free";
	// Stay in fixed-point for tiny per-request costs; scientific notation is
	// hard to read at a glance. Trim trailing zeros so $0.000110 reads cleanly.
	const digits = n >= 0.01 ? 4 : n >= 1e-6 ? 8 : 11;
	const fixed = n.toFixed(digits).replace(/0+$/, "").replace(/\.$/, "");
	return `$${fixed}`;
}

function fmtRate(n: number): string {
	if (n === 0) return "free";
	return `$${Number(n.toFixed(4))}`;
}

function pricingTriple(m: EntryMetrics | undefined): string {
	if (!m) return "—";
	const p = m.pricing;
	return `${fmtRate(p.input)}/${fmtRate(p.output)}/${fmtRate(p.cacheRead)}`;
}

function winner(row: CompareRow): string {
	if (!row.oc || !row.cc) return row.oc ? "oc" : "cc";
	if (row.oc.payPerRequest === row.cc.payPerRequest) return "=";
	return row.oc.payPerRequest < row.cc.payPerRequest ? "oc" : "cc";
}

function fmtAllowance(m: EntryMetrics | undefined): string {
	if (!m) return "—";
	return m.free ? "free" : fmtRate(m.allowance);
}

/** Cost per 1,000 requests — the per-request figure scaled up to readable dollars. */
function fmtPerThousand(m: EntryMetrics | undefined): string {
	if (!m) return "—";
	return fmtUsd(m.payPerRequest * 1000);
}

/** Requests one dollar of subscription buys on this model. */
function fmtPerDollar(m: EntryMetrics | undefined): string {
	if (!m) return "—";
	if (m.free || m.payPerRequest === 0) return "∞";
	return fmtCount(1 / m.payPerRequest);
}

function fmtRequests(value: number | undefined, hasEntry: boolean): string {
	if (!hasEntry || value === undefined) return "—";
	return fmtCount(value);
}

interface Column {
	header: string;
	value: (row: CompareRow) => string;
	right?: boolean;
}

/** Every column the table can render, keyed by the id used with --columns. */
const COLUMNS: Record<string, Column> = {
	model: { header: "MODEL", value: (r) => r.name },
	"oc-rates": {
		header: "OC in/out/cache",
		value: (r) => pricingTriple(r.oc),
	},
	"oc-allow": {
		header: "OC allow",
		value: (r) => fmtAllowance(r.oc),
		right: true,
	},
	"oc-req5h": {
		header: "OC req/5h",
		value: (r) => fmtRequests(r.oc?.requestsPerFiveHour, Boolean(r.oc)),
		right: true,
	},
	"oc-reqwk": {
		header: "OC req/wk",
		value: (r) => fmtRequests(r.oc?.requestsPerWeek, Boolean(r.oc)),
		right: true,
	},
	"oc-reqmo": {
		header: "OC req/mo",
		value: (r) => fmtRequests(r.oc?.requestsPerMonth, Boolean(r.oc)),
		right: true,
	},
	"oc-per1k": {
		header: "OC $/1K",
		value: (r) => fmtPerThousand(r.oc),
		right: true,
	},
	"oc-reqdollar": {
		header: "OC req/$",
		value: (r) => fmtPerDollar(r.oc),
		right: true,
	},
	"cc-rates": {
		header: "CC in/out/cache",
		value: (r) => pricingTriple(r.cc),
	},
	"cc-allow": {
		header: "CC allow",
		value: (r) => fmtAllowance(r.cc),
		right: true,
	},
	"cc-req5h": {
		header: "CC req/5h",
		value: (r) => fmtRequests(r.cc?.requestsPerFiveHour, Boolean(r.cc)),
		right: true,
	},
	"cc-reqwk": {
		header: "CC req/wk",
		value: (r) => fmtRequests(r.cc?.requestsPerWeek, Boolean(r.cc)),
		right: true,
	},
	"cc-reqmo": {
		header: "CC req/mo",
		value: (r) => fmtRequests(r.cc?.requestsPerMonth, Boolean(r.cc)),
		right: true,
	},
	"cc-per1k": {
		header: "CC $/1K",
		value: (r) => fmtPerThousand(r.cc),
		right: true,
	},
	"cc-reqdollar": {
		header: "CC req/$",
		value: (r) => fmtPerDollar(r.cc),
		right: true,
	},
	win: { header: "WIN", value: winner },
	idx: { header: "IDX", value: (r) => bestIndex(r).toString(), right: true },
};

export const COLUMN_IDS = Object.keys(COLUMNS);

export const DEFAULT_COLUMNS = [
	"model",
	"oc-allow",
	"oc-reqmo",
	"oc-per1k",
	"oc-reqdollar",
	"cc-allow",
	"cc-reqmo",
	"cc-per1k",
	"cc-reqdollar",
	"win",
	"idx",
];

export const DETAIL_COLUMNS = [
	"model",
	"oc-rates",
	"oc-allow",
	"oc-req5h",
	"oc-reqwk",
	"oc-reqmo",
	"oc-per1k",
	"oc-reqdollar",
	"cc-rates",
	"cc-allow",
	"cc-req5h",
	"cc-reqwk",
	"cc-reqmo",
	"cc-per1k",
	"cc-reqdollar",
	"win",
	"idx",
];

export function columns(ids: string[]): Column[] {
	return ids.map((id) => {
		const column = COLUMNS[id];
		if (!column) throw new Error(`unknown column "${id}"`);
		return column;
	});
}

function bestIndex(row: CompareRow): number {
	return Math.max(row.oc?.index ?? -1, row.cc?.index ?? -1, 0);
}

function printTable(rows: CompareRow[], columnIds: string[]): void {
	const cols = columns(columnIds);
	const widths = cols.map((c) => c.header.length);
	for (const row of rows) {
		cols.forEach((c, i) => {
			const len = c.value(row).length;
			if (len > (widths[i] ?? 0)) widths[i] = len;
		});
	}
	const line = cols.map((c, i) => c.header.padEnd(widths[i] ?? 0)).join("  ");
	console.log(paint("1", line));
	console.log(cols.map((_, i) => "─".repeat(widths[i] ?? 0)).join("  "));
	for (const row of rows) {
		const cells = cols.map((c, i) => {
			const text = c.value(row);
			const w = widths[i] ?? 0;
			return c.right ? text.padStart(w) : text.padEnd(w);
		});
		console.log(cells.join("  "));
	}
}

export interface ReportMeta {
	ocPlan: PlanInfo;
	ccPlan: PlanInfo;
	workload: Workload;
}

export interface Tally {
	/** Rows present on both sides. */
	headToHead: number;
	ocWins: number;
	ccWins: number;
	ties: number;
	ocOnly: number;
	ccOnly: number;
}

export function tally(rows: CompareRow[]): Tally {
	const result: Tally = {
		headToHead: 0,
		ocWins: 0,
		ccWins: 0,
		ties: 0,
		ocOnly: 0,
		ccOnly: 0,
	};
	for (const row of rows) {
		if (row.oc && row.cc) {
			result.headToHead++;
			if (row.oc.payPerRequest === row.cc.payPerRequest) result.ties++;
			else if (row.oc.payPerRequest < row.cc.payPerRequest)
				result.ocWins++;
			else result.ccWins++;
		} else if (row.oc) {
			result.ocOnly++;
		} else if (row.cc) {
			result.ccOnly++;
		}
	}
	return result;
}

function printPlan(plan: PlanInfo): string {
	if (plan.provider === "oc-go") {
		// Per-model limits, no shared pool — the sum is only an upper bound.
		return `${plan.label}: $${plan.price}/mo, per-model limits (sum $${plan.credits})`;
	}
	const window =
		plan.fiveHour !== null && plan.weekly !== null
			? `, 5h $${plan.fiveHour} / wk $${plan.weekly}`
			: "";
	return `${plan.label}: $${plan.price}/mo, $${plan.credits} credits${window}`;
}

function printTally(t: Tally, ocLabel: string, ccLabel: string): void {
	const parts = [`${ocLabel} ${t.ocWins}`, `${ccLabel} ${t.ccWins}`];
	if (t.ties > 0) parts.push(`tie ${t.ties}`);
	const exclusive = `exclusive: ${ocLabel} ${t.ocOnly} · ${ccLabel} ${t.ccOnly}`;
	console.log(
		paint(
			"2",
			`wins      ${parts.join(" · ")}  (head-to-head, ${t.headToHead} shared)   ${exclusive}`,
		),
	);
}

function windowLine(meta: ReportMeta): string {
	const ratio = (plan: PlanInfo, value: number | null): string => {
		if (plan.provider === "oc-go") return "20% / 50%";
		if (value !== null && plan.credits > 0) {
			return `${Math.round((value / plan.credits) * 100)}%`;
		}
		return "—";
	};
	const cc = `${ratio(meta.ccPlan, meta.ccPlan.fiveHour)} / ${ratio(
		meta.ccPlan,
		meta.ccPlan.weekly,
	)}`;
	return `windows   5-hour / weekly caps as % of monthly allowance — oc-go ${ratio(meta.ocPlan, null)} · cc ${cc}`;
}

export function renderText(
	rows: CompareRow[],
	meta: ReportMeta,
	columnIds: string[],
): void {
	printTable(rows, columnIds);
	console.log();
	console.log(
		paint(
			"2",
			`workload  in ${meta.workload.input} · cache ${meta.workload.cacheRead} · out ${meta.workload.output} tokens/request`,
		),
	);
	console.log(paint("2", `oc-go     ${printPlan(meta.ocPlan)}`));
	console.log(paint("2", `cc        ${printPlan(meta.ccPlan)}`));
	console.log(paint("2", windowLine(meta)));
	printTally(tally(rows), "oc-go", "cc");
	console.log(
		paint(
			"2",
			"$/1K = your cost per 1,000 requests · req/$ = requests per $1 · req/5h, req/wk = rolling-window caps · IDX = 0-100 blended value (60% req volume, 20% cache price, 20% output price)",
		),
	);
}

export function renderJson(rows: CompareRow[], meta: ReportMeta): string {
	return JSON.stringify(
		{
			workload: meta.workload,
			plans: { "oc-go": meta.ocPlan, cc: meta.ccPlan },
			tally: tally(rows),
			rows,
		},
		null,
		2,
	);
}
