import type { CompareRow, EntryMetrics } from "../src/types.ts";

export function metric(payPerRequest: number): EntryMetrics {
	return {
		provider: "cc",
		plan: "GOAT",
		pricing: { input: 1, output: 1, cacheRead: 0, cacheWrite: null },
		allowance: 20,
		costPerRequest: 1,
		requestsPerMonth: 1,
		requestsPerFiveHour: 0.2,
		requestsPerWeek: 0.5,
		payPerRequest,
		multiplier: 1,
		ability: null,
		tps: null,
		index: 0,
		valueIndex: null,
		free: payPerRequest === 0,
	};
}

export function row(key: string, oc?: number, cc?: number): CompareRow {
	return {
		key,
		name: key,
		oc: oc === undefined ? undefined : metric(oc),
		cc: cc === undefined ? undefined : metric(cc),
	};
}
