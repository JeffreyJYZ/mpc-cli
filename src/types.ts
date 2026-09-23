export type ProviderId = "oc-go" | "cc";

/**
 * Marks a text-node boundary inside a scraped cell, so "$60" + "4x" stays two
 * tokens instead of collapsing into an ambiguous "$604x".
 */
export const BOUNDARY = "\u0001";

/** Per-1M-token rates in USD. */
export interface ModelPricing {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number | null;
}

/** One model's pricing + monthly credit allowance on one provider's plan. */
export interface CatalogEntry {
	provider: ProviderId;
	plan: string;
	/** Canonical cross-provider key (see normalize.ts). */
	key: string;
	/** Human display name. */
	name: string;
	pricing: ModelPricing;
	/** Monthly credits ($) this plan devotes to this model. */
	allowance: number;
}

export interface PlanInfo {
	provider: ProviderId;
	/** CLI id, e.g. "goat". */
	id: string;
	label: string;
	/** Subscription USD per month. */
	price: number;
	/** Total monthly credits ($). */
	credits: number;
	fiveHour: number | null;
	weekly: number | null;
}

/** Fixed per-request token counts used for every model on both providers. */
export interface Workload {
	input: number;
	cacheRead: number;
	output: number;
}

export interface EntryMetrics {
	provider: ProviderId;
	plan: string;
	pricing: ModelPricing;
	allowance: number;
	/** USD of list-rate spend for one request. */
	costPerRequest: number;
	/** Requests a month fits in this model's allowance. Infinity when free. */
	requestsPerMonth: number;
	/** Requests the plan's 5-hour window allows for this model. */
	requestsPerFiveHour: number;
	/** Requests the plan's weekly window allows for this model. */
	requestsPerWeek: number;
	/** What one request actually costs you on the plan. */
	payPerRequest: number;
	/** Allowance per dollar of subscription — "$usage per $paid". */
	multiplier: number;
	/** 0-100 blended value score, higher is better. */
	index: number;
	free: boolean;
}

export interface CompareRow {
	key: string;
	name: string;
	oc?: EntryMetrics;
	cc?: EntryMetrics;
}
