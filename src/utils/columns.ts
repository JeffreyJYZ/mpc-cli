import type { EntryMetrics } from "../types.ts";
import * as f from "./funcs.ts";
import type { Column, Row } from "./types.ts";

/** Every column the table can render, keyed by the id used with --columns. */
const COLUMNS: Record<string, Column> = {
	model: { header: "MODEL", value: (r) => r.name, style: () => "1" },
	"oc-rates": {
		header: "rates",
		value: f.ocRates,
		style: f.freeStyle((r) => r.oc),
		drop: 1,
	},
	"oc-allow": {
		header: "allow",
		value: (r) => f.fmtAllowance(r.oc),
		right: true,
		style: f.freeStyle((r) => r.oc),
	},
	"oc-req5h": {
		header: "5h",
		drop: 3,
		value: (r) => f.fmtRequests(r.oc?.requestsPerFiveHour, Boolean(r.oc)),
		right: true,
	},
	"oc-reqwk": {
		header: "wk",
		drop: 3,
		value: (r) => f.fmtRequests(r.oc?.requestsPerWeek, Boolean(r.oc)),
		right: true,
	},
	"oc-reqmo": {
		header: "mo",
		value: (r) => f.fmtRequests(r.oc?.requestsPerMonth, Boolean(r.oc)),
		right: true,
	},
	"oc-per1k": {
		header: "$/1K",
		value: (r) => f.fmtPerThousand(r.oc),
		right: true,
		style: f.sideStyle("oc"),
	},
	"oc-reqdollar": {
		header: "req/$",
		value: (r) => f.fmtPerDollar(r.oc),
		right: true,
		style: f.sideStyle("oc"),
		drop: 2,
	},
	"cc-rates": {
		header: "rates",
		value: f.ccRates,
		style: f.freeStyle((r) => r.cc),
		drop: 1,
	},
	"cc-allow": {
		header: "allow",
		value: (r) => f.fmtAllowance(r.cc),
		right: true,
		style: f.freeStyle((r) => r.cc),
	},
	"cc-req5h": {
		header: "5h",
		drop: 3,
		value: (r) => f.fmtRequests(r.cc?.requestsPerFiveHour, Boolean(r.cc)),
		right: true,
	},
	"cc-reqwk": {
		header: "wk",
		drop: 3,
		value: (r) => f.fmtRequests(r.cc?.requestsPerWeek, Boolean(r.cc)),
		right: true,
	},
	"cc-reqmo": {
		header: "mo",
		value: (r) => f.fmtRequests(r.cc?.requestsPerMonth, Boolean(r.cc)),
		right: true,
	},
	"cc-per1k": {
		header: "$/1K",
		value: (r) => f.fmtPerThousand(r.cc),
		right: true,
		style: f.sideStyle("cc"),
	},
	"cc-reqdollar": {
		header: "req/$",
		value: (r) => f.fmtPerDollar(r.cc),
		right: true,
		style: f.sideStyle("cc"),
		drop: 2,
	},
	win: { header: "WIN", value: f.winner, pad: false, style: f.winnerStyle },
	cost: {
		header: "COST",
		value: f.bestCost,
		right: true,
		style: f.costStyle,
	},
	ability: {
		header: "ability",
		value: f.fmtAbility,
		right: true,
		style: (r) => f.enabledStyle(r.oc?.ability ?? r.cc?.ability ?? null),
	},
	tps: {
		header: "tps",
		value: f.fmtTps,
		right: true,
		style: (r) => f.enabledStyle(r.oc?.tps ?? r.cc?.tps ?? null),
		drop: 4,
	},
	val: {
		header: "VAL",
		value: f.bestValue,
		right: true,
		style: f.valueStyle,
	},
};

export const COLUMN_IDS = Object.keys(COLUMNS);

export function columns(ids: string[]): Column[] {
	return ids.map((id) => {
		const column = COLUMNS[id];
		if (!column) throw new Error(`unknown column "${id}"`);
		return column;
	});
}

/** Only for tests/diagnostics. */
export const _columns = COLUMNS;
export type { EntryMetrics, Row };
