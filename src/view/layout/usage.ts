import type { UsageProjection, UsageRow } from "../../cli/engine/project.ts";
import type { PlanInfo, ProviderId } from "../../types.ts";
import { fmtCount, fmtUsd, paint, planTitle } from "../text/index.ts";

export interface UsageMeta {
	label: string;
	months: number;
	plans: Record<ProviderId, PlanInfo>;
}

function money(value: number | undefined): string {
	if (value === undefined || value === 0) return "—";
	return fmtUsd(value);
}

function perReq(value: number | undefined): string {
	if (value === undefined) return "—";
	return fmtUsd(value);
}

function cells(row: UsageRow): string[] {
	const oc = row.oc;
	const cc = row.cc;
	const cheaper =
		oc && cc
			? oc.payPerRequest === cc.payPerRequest
				? "tie"
				: oc.payPerRequest < cc.payPerRequest
					? "OC"
					: "CC"
			: oc
				? "OC only"
				: "CC only";
	return [
		row.name,
		fmtCount(row.requests),
		money(row.listCost),
		perReq(row.cc?.payPerRequest),
		money(row.cc?.monthly),
		perReq(row.oc?.payPerRequest),
		money(row.oc?.monthly),
		cheaper,
		row.cc?.overCap || row.oc?.overCap ? "over cap" : "",
	];
}

const HEADERS = [
	"MODEL",
	"your req",
	"your $",
	"CC $/req",
	"CC $/mo",
	"OC $/req",
	"OC $/mo",
	"cheaper",
	"flag",
];

export function renderUsage(report: UsageProjection, meta: UsageMeta): void {
	const dim = (text: string): string => paint("2", text);
	const width = meta.months === 1 ? "period" : `${meta.months} months`;
	console.log(
		paint(
			"1",
			`USAGE  your logged mix · ${width} · list value ${fmtUsd(report.ccListCost)}${meta.months === 1 ? "" : " (monthly)"}`,
		),
	);
	console.log(dim(`source  ${meta.label}`));

	const rows = report.rows.map(cells);
	const widths = HEADERS.map((h, i) =>
		Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)),
	);
	const line = (values: string[], rightSet: Set<number>): string =>
		values
			.map((v, i) =>
				rightSet.has(i)
					? v.padStart(widths[i] ?? 0)
					: v.padEnd(widths[i] ?? 0),
			)
			.join("  ");
	const right = new Set([1, 2, 3, 4, 5, 6]);

	console.log();
	console.log(paint("1", line(HEADERS, right)));
	console.log(widths.map((w) => "─".repeat(w)).join("  "));
	for (const row of rows) console.log(line(row, right));

	const delta = report.ccMonthly - report.ocMonthly;
	const pct = report.ccMonthly > 0 ? (delta / report.ccMonthly) * 100 : 0;
	const winner = delta > 0 ? "OpenCode" : delta < 0 ? "CommandCode" : "tie";
	console.log();
	console.log(
		`totals  CC ${fmtUsd(report.ccMonthly)}/mo · OpenCode ${fmtUsd(report.ocMonthly)}/mo · cheaper ${winner}${winner === "tie" ? "" : ` by ${fmtUsd(Math.abs(delta))} (${Math.abs(pct).toFixed(0)}%)`}`,
	);
	console.log(
		dim(
			`plans   ${planTitle(meta.plans["oc-go"])} $${meta.plans["oc-go"].price}/mo · ${planTitle(meta.plans.cc)} $${meta.plans.cc.price}/mo`,
		),
	);
	const over = report.rows
		.filter((r) => r.cc?.overCap || r.oc?.overCap)
		.map((r) => r.name);
	if (over.length > 0) {
		console.log(dim(`over cap for at least one plan: ${over.join(", ")}`));
	}
	if (report.unmatched.length > 0) {
		console.log(
			dim(`unmatched models (excluded): ${report.unmatched.join(", ")}`),
		);
	}
}
