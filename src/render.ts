import type {
	CompareRow,
	EntryMetrics,
	PlanInfo,
	ProviderId,
	Workload,
} from "./types.ts";

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
	if (!row.oc || !row.cc) return row.oc ? "opencode" : "Command Code";
	const side = cheaperSide(row);
	if (side === "tie") return "tie";
	return side === "oc" ? "opencode" : "Command Code";
}

/** Provider display name. */
export function providerName(provider: ProviderId): string {
	return provider === "oc-go" ? "opencode" : "Command Code";
}

/** e.g. "opencode Go", "Command Code GOAT". */
export function planTitle(plan: PlanInfo): string {
	return `${providerName(plan.provider)} ${plan.label}`;
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

function fmtAbility(row: CompareRow): string {
	const ability = row.oc?.ability ?? row.cc?.ability ?? null;
	return ability === null ? "—" : ability.toFixed(1);
}

function fmtTps(row: CompareRow): string {
	const tps = row.oc?.tps ?? row.cc?.tps ?? null;
	return tps === null ? "—" : Math.round(tps).toString();
}

function valueScores(row: CompareRow): number[] {
	return [row.oc?.valueIndex, row.cc?.valueIndex].filter(
		(value): value is number => typeof value === "number",
	);
}

function bestValue(row: CompareRow): string {
	const scores = valueScores(row);
	return scores.length === 0 ? "—" : Math.max(...scores).toString();
}

function valueStyle(row: CompareRow): string | undefined {
	const scores = valueScores(row);
	if (scores.length === 0) return "2";
	const best = Math.max(...scores);
	if (best >= 70) return "32";
	if (best >= 40) return "33";
	return "31";
}

interface Column {
	header: string;
	value: (row: CompareRow) => string;
	right?: boolean;
	/** Optional SGR code applied to the padded cell (green 32, dim 2, ...). */
	style?: (row: CompareRow) => string | undefined;
	/** Lower values are dropped first when the table is too wide. */
	drop?: number;
}

/** Which side is cheaper per request on this row. */
function cheaperSide(row: CompareRow): "oc" | "cc" | "tie" | "none" {
	if (!row.oc || !row.cc) return "none";
	if (row.oc.payPerRequest === row.cc.payPerRequest) return "tie";
	return row.oc.payPerRequest < row.cc.payPerRequest ? "oc" : "cc";
}

function sideStyle(side: "oc" | "cc"): (row: CompareRow) => string | undefined {
	return (row) => {
		const winner = cheaperSide(row);
		if (winner === "none") return undefined;
		return winner === side ? "32" : "2";
	};
}

function freeStyle(pick: (row: CompareRow) => EntryMetrics | undefined) {
	return (row: CompareRow) => (pick(row)?.free ? "32" : undefined);
}

function idxStyle(row: CompareRow): string | undefined {
	const score = bestIndex(row);
	if (score >= 70) return "32";
	if (score >= 40) return "33";
	return "31";
}

/** Every column the table can render, keyed by the id used with --columns. */
const COLUMNS: Record<string, Column> = {
	model: { header: "MODEL", value: (r) => r.name, style: () => "1" },
	"oc-rates": {
		header: "rates",
		value: (r) => pricingTriple(r.oc),
		style: (r) => (r.oc?.free ? "32" : undefined),
		drop: 1,
	},
	"oc-allow": {
		header: "allow",
		value: (r) => fmtAllowance(r.oc),
		right: true,
		style: freeStyle((r) => r.oc),
	},
	"oc-req5h": {
		header: "5h",
		drop: 3,
		value: (r) => fmtRequests(r.oc?.requestsPerFiveHour, Boolean(r.oc)),
		right: true,
	},
	"oc-reqwk": {
		header: "wk",
		drop: 3,
		value: (r) => fmtRequests(r.oc?.requestsPerWeek, Boolean(r.oc)),
		right: true,
	},
	"oc-reqmo": {
		header: "mo",
		value: (r) => fmtRequests(r.oc?.requestsPerMonth, Boolean(r.oc)),
		right: true,
	},
	"oc-per1k": {
		header: "$/1K",
		value: (r) => fmtPerThousand(r.oc),
		right: true,
		style: sideStyle("oc"),
	},
	"oc-reqdollar": {
		header: "req/$",
		value: (r) => fmtPerDollar(r.oc),
		right: true,
		style: sideStyle("oc"),
		drop: 2,
	},
	"cc-rates": {
		header: "rates",
		value: (r) => pricingTriple(r.cc),
		style: (r) => (r.cc?.free ? "32" : undefined),
		drop: 1,
	},
	"cc-allow": {
		header: "allow",
		value: (r) => fmtAllowance(r.cc),
		right: true,
		style: freeStyle((r) => r.cc),
	},
	"cc-req5h": {
		header: "5h",
		drop: 3,
		value: (r) => fmtRequests(r.cc?.requestsPerFiveHour, Boolean(r.cc)),
		right: true,
	},
	"cc-reqwk": {
		header: "wk",
		drop: 3,
		value: (r) => fmtRequests(r.cc?.requestsPerWeek, Boolean(r.cc)),
		right: true,
	},
	"cc-reqmo": {
		header: "mo",
		value: (r) => fmtRequests(r.cc?.requestsPerMonth, Boolean(r.cc)),
		right: true,
	},
	"cc-per1k": {
		header: "$/1K",
		value: (r) => fmtPerThousand(r.cc),
		right: true,
		style: sideStyle("cc"),
	},
	"cc-reqdollar": {
		header: "req/$",
		value: (r) => fmtPerDollar(r.cc),
		right: true,
		style: sideStyle("cc"),
		drop: 2,
	},
	win: {
		header: "WIN",
		value: winner,
		style: (r) => {
			const side = cheaperSide(r);
			if (side === "tie") return "2";
			return side === "none" ? undefined : "32";
		},
	},
	idx: {
		header: "IDX",
		value: (r) => bestIndex(r).toString(),
		right: true,
		style: idxStyle,
	},
	ability: {
		header: "ability",
		value: fmtAbility,
		right: true,
		style: (r) => ((r.oc?.ability ?? r.cc?.ability) === null ? "2" : "36"),
	},
	tps: {
		header: "tps",
		value: fmtTps,
		right: true,
		style: (r) => ((r.oc?.tps ?? r.cc?.tps) === null ? "2" : "36"),
		drop: 4,
	},
	val: {
		header: "VAL",
		value: bestValue,
		right: true,
		style: valueStyle,
	},
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
	"val",
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
	"ability",
	"tps",
	"win",
	"idx",
	"val",
];

export function columns(ids: string[]): Column[] {
	return ids.map((id) => {
		const column = COLUMNS[id];
		if (!column) throw new Error(`unknown column "${id}"`);
		return column;
	});
}

/** Printed width of the whole table, in characters (ANSI colour not counted). */
export function tableWidth(rows: CompareRow[], ids: string[]): number {
	const cols = columns(ids);
	const widths = cols.map((c) => c.header.length);
	for (const row of rows) {
		cols.forEach((c, i) => {
			const len = c.value(row).length;
			if (len > (widths[i] ?? 0)) widths[i] = len;
		});
	}
	const segs = buildSegments(ids, cols, widths);
	if (segs.length === 0) return 0;
	return (
		segs.reduce((sum, seg) => sum + seg.width, 0) +
		BAR.length * (segs.length - 1)
	);
}

export interface FitResult {
	ids: string[];
	dropped: string[];
	width: number;
}

/**
 * Drop optional columns, widest-first, until the table fits `limit`. Columns
 * with the same `drop` value are removed together, so both providers stay
 * symmetric.
 */
export function fitColumns(
	rows: CompareRow[],
	ids: string[],
	limit: number,
): FitResult {
	let current = [...ids];
	const dropped: string[] = [];
	while (limit > 0 && tableWidth(rows, current) > limit) {
		const levels = current
			.map((id) => columns([id])[0]?.drop)
			.filter((drop): drop is number => drop !== undefined);
		if (levels.length === 0) break;
		const lowest = Math.min(...levels);
		const remove = new Set(
			current.filter((id) => columns([id])[0]?.drop === lowest),
		);
		if (remove.size === 0) break;
		current = current.filter((id) => !remove.has(id));
		dropped.push(...remove);
	}
	return { ids: current, dropped, width: tableWidth(rows, current) };
}

function bestIndex(row: CompareRow): number {
	return Math.max(row.oc?.index ?? -1, row.cc?.index ?? -1, 0);
}

type GroupKey = "model" | "oc" | "cc" | "misc";

function groupOf(id: string): GroupKey {
	if (id === "model") return "model";
	if (id.startsWith("oc-")) return "oc";
	if (id.startsWith("cc-")) return "cc";
	return "misc";
}

interface Segment {
	key: GroupKey;
	columns: Column[];
	widths: number[];
	/** Total printed width including the gaps between columns. */
	width: number;
}

const GAP = "  ";
const BAR = " │ ";
const BAR_RULE = "─┼─";

function buildSegments(
	ids: string[],
	cols: Column[],
	widths: number[],
): Segment[] {
	const segs: Segment[] = [];
	ids.forEach((id, i) => {
		const column = cols[i];
		if (!column) return;
		const key = groupOf(id);
		const last = segs[segs.length - 1];
		if (!last || last.key !== key) {
			segs.push({
				key,
				columns: [column],
				widths: [widths[i] ?? 0],
				width: 0,
			});
		} else {
			last.columns.push(column);
			last.widths.push(widths[i] ?? 0);
		}
	});
	for (const seg of segs) {
		seg.width =
			seg.widths.reduce((a, b) => a + b, 0) +
			GAP.length * (seg.widths.length - 1);
	}
	return segs;
}

function renderSegment(
	seg: Segment,
	cells: string[],
	alignRight: boolean,
	styles?: (string | undefined)[],
): string {
	return seg.columns
		.map((col, i) => {
			const text = cells[i] ?? "";
			const width = seg.widths[i] ?? 0;
			const padded =
				alignRight && col.right
					? text.padStart(width)
					: text.padEnd(width);
			const code = styles?.[i];
			return code ? paint(code, padded) : padded;
		})
		.join(GAP);
}

interface GroupLabel {
	title: string;
	color: string;
}

function printTable(
	rows: CompareRow[],
	columnIds: string[],
	labels: Partial<Record<GroupKey, GroupLabel>>,
): void {
	const cols = columns(columnIds);
	const widths = cols.map((c) => c.header.length);
	for (const row of rows) {
		cols.forEach((c, i) => {
			const len = c.value(row).length;
			if (len > (widths[i] ?? 0)) widths[i] = len;
		});
	}
	const segs = buildSegments(columnIds, cols, widths);
	const bar = paint("2", BAR);

	if (segs.some((seg) => labels[seg.key])) {
		console.log(
			segs
				.map((seg) => {
					const label = labels[seg.key];
					if (!label) return " ".repeat(seg.width);
					const left = Math.max(
						0,
						Math.floor((seg.width - label.title.length) / 2),
					);
					return paint(
						label.color,
						label.title
							.padStart(left + label.title.length)
							.padEnd(seg.width),
					);
				})
				.join(bar),
		);
	}

	console.log(
		segs
			.map((seg) =>
				paint(
					"1",
					renderSegment(
						seg,
						seg.columns.map((c) => c.header),
						false,
					),
				),
			)
			.join(bar),
	);
	console.log(
		segs.map((seg) => "─".repeat(seg.width)).join(paint("2", BAR_RULE)),
	);
	for (const row of rows) {
		console.log(
			segs
				.map((seg) =>
					renderSegment(
						seg,
						seg.columns.map((c) => c.value(row)),
						true,
						seg.columns.map((c) => c.style?.(row)),
					),
				)
				.join(bar),
		);
	}
}

export interface ReportMeta {
	ocPlan: PlanInfo;
	ccPlan: PlanInfo;
	workload: Workload;
	/** Ability source label, e.g. "Command Code Intelligence". */
	abilityLabel?: string;
	abilityNote?: string;
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

function planBlock(plan: PlanInfo): { title: string; rest: string } {
	if (plan.provider === "oc-go") {
		// Per-model limits, no shared pool, so the sum is only an upper bound.
		return {
			title: planTitle(plan),
			rest: `$${plan.price}/mo · per-model limits (sum $${plan.credits})`,
		};
	}
	const window =
		plan.fiveHour !== null && plan.weekly !== null
			? ` · 5h $${plan.fiveHour} / wk $${plan.weekly}`
			: "";
	return {
		title: planTitle(plan),
		rest: `$${plan.price}/mo · $${plan.credits} credits${window}`,
	};
}

function windowPercents(plan: PlanInfo): string {
	if (plan.provider === "oc-go") return "20% / 50%";
	if (plan.fiveHour !== null && plan.weekly !== null && plan.credits > 0) {
		return `${Math.round((plan.fiveHour / plan.credits) * 100)}% / ${Math.round(
			(plan.weekly / plan.credits) * 100,
		)}%`;
	}
	return "—";
}

function footer(rows: CompareRow[], meta: ReportMeta): void {
	const dim = (text: string): string => paint("2", text);
	const plans = [meta.ocPlan, meta.ccPlan].map(planBlock);
	const planWidth = Math.max(...plans.map((p) => p.title.length));
	const [ocBlock, ccBlock] = plans;

	console.log(
		dim(
			`workload  ${meta.workload.input.toLocaleString("en-US")} input · ${meta.workload.cacheRead.toLocaleString("en-US")} cache-read · ${meta.workload.output.toLocaleString("en-US")} output tokens per request`,
		),
	);
	console.log(
		`${dim("plans     ")}${paint("1;36", (ocBlock?.title ?? "").padEnd(planWidth))}  ${dim(ocBlock?.rest ?? "")}`,
	);
	console.log(
		`${dim("          ")}${paint("1;35", (ccBlock?.title ?? "").padEnd(planWidth))}  ${dim(ccBlock?.rest ?? "")}`,
	);
	console.log(
		dim(
			`windows   rolling caps as % of monthly allowance: ${planTitle(meta.ocPlan)} ${windowPercents(meta.ocPlan)} · ${planTitle(meta.ccPlan)} ${windowPercents(meta.ccPlan)}`,
		),
	);
	if (meta.abilityLabel) {
		console.log(
			dim(
				`ability   ${meta.abilityLabel}${meta.abilityNote ? ` · ${meta.abilityNote}` : ""}`,
			),
		);
	}

	const t = tally(rows);
	const parts = [`opencode ${t.ocWins}`, `Command Code ${t.ccWins}`];
	if (t.ties > 0) parts.push(`tie ${t.ties}`);
	console.log(
		dim(
			`wins      head-to-head ${t.headToHead} shared: ${parts.join(" · ")}`,
		),
	);
	console.log(
		dim(
			`          exclusive: opencode ${t.ocOnly} · Command Code ${t.ccOnly}`,
		),
	);

	console.log(
		`${dim("legend    ")}${dim("rates  token price per 1M tokens, in/out/cache")}`,
	);
	console.log(
		`${dim("          ")}${dim("allow  monthly credits this plan gives the model")}`,
	);
	console.log(
		`${dim("          ")}${dim("5h wk mo  requests the rolling 5-hour / weekly / monthly window buys")}`,
	);
	console.log(
		`${dim("          ")}${dim("$/1K   your cost per 1,000 requests, at the plan's price")}`,
	);
	console.log(
		`${dim("          ")}${dim("req/$  requests one dollar of subscription buys")}`,
	);
	console.log(
		`${dim("          ")}${dim("WIN    side cheaper per request")}`,
	);
	console.log(
		`${dim("          ")}${dim("ability  benchmark score for the model (source above)")}`,
	);
	console.log(
		`${dim("          ")}${dim("tps    output tokens per second (source above)")}`,
	);
	console.log(
		`${dim("          ")}${dim("IDX    0-100 blended value: 60% request volume, 20% cache price, 20% output price")}`,
	);
	console.log(
		`${dim("          ")}${dim("VAL    0-100 ability-aware value: ability + speed + volume + cache + output")}`,
	);
}

export function renderText(
	rows: CompareRow[],
	meta: ReportMeta,
	columnIds: string[],
	dropped: string[] = [],
): void {
	printTable(rows, columnIds, {
		oc: { title: planTitle(meta.ocPlan), color: "1;36" },
		cc: { title: planTitle(meta.ccPlan), color: "1;35" },
	});
	if (dropped.length > 0) {
		console.log(
			paint(
				"2",
				`\ndropped for width: ${[...new Set(dropped)].join(", ")} (use --columns to force, --width <n> to widen)`,
			),
		);
	}
	console.log();
	footer(rows, meta);
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
