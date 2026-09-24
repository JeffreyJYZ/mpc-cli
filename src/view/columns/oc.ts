import type { Column } from "../schema.ts";
import * as f from "../text/index.ts";

export const OC_COLUMNS: Record<string, Column> = {
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
};
