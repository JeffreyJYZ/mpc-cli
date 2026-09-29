import type { UsageEntry } from "~/data/usage/index.ts";
import type { CatalogEntry, PlanInfo, ProviderId } from "~/types.ts";

const PER_MILLION = 1_000_000;

export interface SideProjection {
	/** Cost of one real request at list rates. */
	costPerRequest: number;
	/** What that request costs you on the plan. */
	payPerRequest: number;
	/** Plan subscription cost this model's real usage earns, scaled to a month. */
	monthly: number;
	/** Plan credits the real usage draws. */
	creditsDrawn: number;
	allowance: number;
	overCap: boolean;
}

export interface UsageRow {
	key: string;
	name: string;
	requests: number;
	tokens: { input: number; cacheRead: number; output: number };
	/** List-rate value of the tokens for the period, scaled to a month. */
	listCost: number;
	oc?: SideProjection;
	cc?: SideProjection;
}

export interface ProjectOptions {
	/** Treat the logged usage as covering this many months. */
	months: number;
}

export interface UsageProjection {
	rows: UsageRow[];
	unmatched: string[];
	ocMonthly: number;
	ccMonthly: number;
	ccListCost: number;
}

/** cmduse reports per-model totals, so this is the whole period's list cost. */
function totalCost(entry: CatalogEntry, usage: UsageEntry): number {
	const p = entry.pricing;
	return (
		(usage.tokensIn * p.input +
			usage.cacheRead * p.cacheRead +
			usage.tokensOut * p.output +
			usage.cacheWrite * (p.cacheWrite ?? 0)) /
		PER_MILLION
	);
}

function side(
	entry: CatalogEntry,
	usage: UsageEntry,
	plan: PlanInfo,
	periodCost: number,
	months: number,
): SideProjection {
	const requests = Math.max(usage.requests, 1e-9);
	const costPerRequest = periodCost / requests;
	const payPerRequest =
		entry.allowance > 0
			? (plan.price * costPerRequest) / entry.allowance
			: 0;
	const creditsDrawn = periodCost / months;
	return {
		costPerRequest,
		payPerRequest,
		monthly: (usage.requests * payPerRequest) / months,
		creditsDrawn,
		allowance: entry.allowance,
		overCap: creditsDrawn > entry.allowance,
	};
}

/** Project the user's real usage onto both providers. */
export function project(
	usage: UsageEntry[],
	catalogs: Record<ProviderId, CatalogEntry[]>,
	plans: Record<ProviderId, PlanInfo>,
	options: ProjectOptions,
): UsageProjection {
	const months = options.months > 0 ? options.months : 1;
	const byKey = (list: CatalogEntry[]): Map<string, CatalogEntry> =>
		new Map(list.map((entry) => [entry.key, entry]));
	const oc = byKey(catalogs["oc-go"]);
	const cc = byKey(catalogs.cc);

	const rows: UsageRow[] = [];
	const unmatched: string[] = [];
	let ocMonthly = 0;
	let ccMonthly = 0;
	let ccListCost = 0;

	for (const item of usage) {
		const ocEntry = oc.get(item.key);
		const ccEntry = cc.get(item.key);
		if (!ocEntry && !ccEntry) {
			unmatched.push(item.name);
			continue;
		}
		const ccCost = ccEntry ? totalCost(ccEntry, item) : 0;
		const ocCost = ocEntry ? totalCost(ocEntry, item) : 0;
		const periodCost = ccEntry ? ccCost : ocCost;
		const row: UsageRow = {
			key: item.key,
			name: ccEntry?.name ?? ocEntry?.name ?? item.name,
			requests: item.requests,
			tokens: {
				input: item.tokensIn,
				cacheRead: item.cacheRead,
				output: item.tokensOut,
			},
			listCost: periodCost / months,
		};
		if (ocEntry) {
			row.oc = side(ocEntry, item, plans["oc-go"], ocCost, months);
			ocMonthly += row.oc.monthly;
		}
		if (ccEntry) {
			row.cc = side(ccEntry, item, plans.cc, ccCost, months);
			ccMonthly += row.cc.monthly;
			ccListCost += row.listCost;
		}
		rows.push(row);
	}

	rows.sort((a, b) => b.listCost - a.listCost);
	return { rows, unmatched, ocMonthly, ccMonthly, ccListCost };
}
