import * as f from "../funcs.ts";
import type { Column } from "../types.ts";

export const META_COLUMNS: Record<string, Column> = {
	model: { header: "MODEL", value: (r) => r.name, style: () => "1" },
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
