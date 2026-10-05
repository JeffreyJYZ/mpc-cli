import { SGR } from "~/constants/view.ts";
import type { EntryMetrics } from "~/types.ts";
import type { Row } from "~/view/schema.ts";
import { fmtRate, shortProviderName } from "./format.ts";

/** Which side is cheaper per request on this row. */
export function cheaperSide(row: Row): "oc" | "cc" | "tie" | "none" {
	if (!row.oc || !row.cc) return "none";
	if (row.oc.payPerRequest === row.cc.payPerRequest) return "tie";
	return row.oc.payPerRequest < row.cc.payPerRequest ? "oc" : "cc";
}

export function winner(row: Row): string {
	// One-sided rows are not wins; name the side that carries the model.
	if (!row.oc) return `${shortProviderName("cc")} only`;
	if (!row.cc) return `${shortProviderName("oc-go")} only`;
	const side = cheaperSide(row);
	if (side === "tie") return "tie";
	return shortProviderName(side === "oc" ? "oc-go" : "cc");
}

export function bestIndex(row: Row): number {
	return Math.max(row.oc?.index ?? -1, row.cc?.index ?? -1, 0);
}

function valueScores(row: Row): number[] {
	return [row.oc?.valueIndex, row.cc?.valueIndex].filter(
		(value): value is number => typeof value === "number",
	);
}

export const bestValue = (r: Row): string => {
	const scores = valueScores(r);
	return scores.length === 0 ? "—" : Math.max(...scores).toString();
};

export const bestCost = (r: Row): string => (100 - bestIndex(r)).toString();

export const pricingTriple = (m: EntryMetrics | undefined): string => {
	if (!m) return "—";
	const p = m.pricing;
	return `${fmtRate(p.input)}/${fmtRate(p.output)}/${fmtRate(p.cacheRead)}`;
};

export const ocRates = (r: Row): string => pricingTriple(r.oc);
export const ccRates = (r: Row): string => pricingTriple(r.cc);
export const freeOc = (r: Row): boolean => Boolean(r.oc?.free);
export const freeCc = (r: Row): boolean => Boolean(r.cc?.free);

export const winnerStyle = (r: Row): string | undefined => {
	const side = cheaperSide(r);
	// A tie and a one-sided row are not wins, so no colour — not a faint grey,
	// which must keep meaning "absent".
	return side === "oc" || side === "cc" ? SGR.green : undefined;
};

export function sideStyle(side: "oc" | "cc") {
	return (row: Row): string | undefined =>
		cheaperSide(row) === side ? SGR.green : undefined;
}

export const freeStyle =
	(pick: (row: Row) => EntryMetrics | undefined) =>
	(row: Row): string | undefined =>
		pick(row)?.free ? SGR.green : undefined;

let costCuts: [number, number] = [30, 60];
let valCuts: [number, number] = [40, 70];

/** Configure the green/yellow cut-offs for COST and VAL. */
export function setThresholds(
	cost: [number, number],
	val: [number, number],
): void {
	costCuts = cost;
	valCuts = val;
}

/**
 * COST is inverted (0 = cheapest/best), so colour the other way round. Low is
 * left plain, not red: the index is relative (min-max across the table), so the
 * worst row is not a failure and a wall of red reads as one.
 */
export const costStyle = (r: Row): string | undefined => {
	const cost = 100 - bestIndex(r);
	if (cost <= costCuts[0]) return SGR.green;
	if (cost <= costCuts[1]) return SGR.yellow;
	return undefined;
};

export const valueStyle = (row: Row): string | undefined => {
	const scores = valueScores(row);
	if (scores.length === 0) return SGR.dim;
	const best = Math.max(...scores);
	if (best >= valCuts[1]) return SGR.green;
	if (best >= valCuts[0]) return SGR.yellow;
	return undefined;
};

export const enabledStyle = (value: number | null): string | undefined =>
	value === null ? SGR.dim : undefined;
