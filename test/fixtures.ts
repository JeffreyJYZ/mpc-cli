import type { CatalogEntry, PlanInfo, Workload } from "../src/types.ts";

export const workload: Workload = {
	input: 1_000,
	cacheRead: 50_000,
	output: 200,
};

export const ccPlan: PlanInfo = {
	provider: "cc",
	id: "goat",
	label: "GOAT",
	price: 10,
	credits: 70,
	fiveHour: 14,
	weekly: 35,
};

export const ocPlan: PlanInfo = {
	provider: "oc-go",
	id: "go",
	label: "Go",
	price: 10,
	credits: 100,
	fiveHour: null,
	weekly: null,
};

export function entry(overrides: Partial<CatalogEntry>): CatalogEntry {
	return {
		provider: "cc",
		plan: "GOAT",
		key: "m",
		name: "M",
		pricing: { input: 1, output: 1, cacheRead: 0, cacheWrite: null },
		allowance: 20,
		...overrides,
	};
}
