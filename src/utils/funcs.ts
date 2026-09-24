import type { EntryMetrics, ProviderId } from "../types.ts";
import type { Row } from "./types.ts";

let color = true;

export function setColor(enabled: boolean): void {
	color = enabled;
}

export function paint(code: string, text: string): string {
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

export function providerName(provider: ProviderId): string {
	return provider === "oc-go" ? "OpenCode" : "CommandCode";
}

/** Short provider tag, for the WIN column. */
export function shortProviderName(provider: ProviderId): string {
	return provider === "oc-go" ? "OC" : "CC";
}

/** e.g. "OpenCode Go", "CommandCode GOAT". */
export function planTitle(plan: {
	provider: ProviderId;
	label: string;
}): string {
	return `${providerName(plan.provider)} ${plan.label}`;
}

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

export const ocRates = (r: Row): string => pricingTriple(r.oc);
export const ccRates = (r: Row): string => pricingTriple(r.cc);
export const freeOc = (r: Row): boolean => Boolean(r.oc?.free);
export const freeCc = (r: Row): boolean => Boolean(r.cc?.free);
export const bestValue = (r: Row): string => {
	const scores = valueScores(r);
	return scores.length === 0 ? "—" : Math.max(...scores).toString();
};
export const bestCost = (r: Row): string => (100 - bestIndex(r)).toString();

export const winnerStyle = (r: Row): string | undefined => {
	const side = cheaperSide(r);
	if (side === "none") return "2";
	return side === "tie" ? "2" : "32";
};

export function sideStyle(side: "oc" | "cc") {
	return (row: Row): string | undefined => {
		const win = cheaperSide(row);
		if (win === "none") return undefined;
		return win === side ? "32" : "2";
	};
}

export const freeStyle =
	(pick: (row: Row) => EntryMetrics | undefined) =>
	(row: Row): string | undefined =>
		pick(row)?.free ? "32" : undefined;

/** COST is inverted (0 = cheapest/best), so colour the other way round. */
export const costStyle = (r: Row): string | undefined => {
	const cost = 100 - bestIndex(r);
	if (cost <= 30) return "32";
	if (cost <= 60) return "33";
	return "31";
};

export const enabledStyle = (value: number | null): string | undefined =>
	value === null ? "2" : "36";

export function fmtAllowance(m: EntryMetrics | undefined): string {
	if (!m) return "—";
	return m.free ? "free" : fmtRate(m.allowance);
}

/** Cost per 1,000 requests — the per-request figure scaled up to readable dollars. */
export function fmtPerThousand(m: EntryMetrics | undefined): string {
	if (!m) return "—";
	return fmtUsd(m.payPerRequest * 1000);
}

/** Requests one dollar of subscription buys on this model. */
export function fmtPerDollar(m: EntryMetrics | undefined): string {
	if (!m) return "—";
	if (m.free || m.payPerRequest === 0) return "∞";
	return fmtCount(1 / m.payPerRequest);
}

export function fmtRequests(
	value: number | undefined,
	hasEntry: boolean,
): string {
	if (!hasEntry || value === undefined) return "—";
	return fmtCount(value);
}

export function fmtAbility(row: Row): string {
	const ability = row.oc?.ability ?? row.cc?.ability ?? null;
	return ability === null ? "—" : ability.toFixed(1);
}

export function fmtTps(row: Row): string {
	const tps = row.oc?.tps ?? row.cc?.tps ?? null;
	return tps === null ? "—" : Math.round(tps).toString();
}

export const valueStyle = (row: Row): string | undefined => {
	const scores = valueScores(row);
	if (scores.length === 0) return "2";
	const best = Math.max(...scores);
	if (best >= 70) return "32";
	if (best >= 40) return "33";
	return "31";
};
