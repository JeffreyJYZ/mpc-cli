import type {
	CatalogEntry,
	EntryMetrics,
	PlanInfo,
	ProviderId,
	Workload,
} from "../../types.ts";
import { lookupAbility } from "./ability.ts";
import { costPerRequest, windowRatios } from "./cost.ts";
import { assignIndex, assignValueIndex } from "./score.ts";

export function buildMetrics(
	entries: CatalogEntry[],
	plans: Map<ProviderId, PlanInfo>,
	workload: Workload,
	ability: Map<string, number> = new Map(),
	abilityWeight = 0.35,
	tps: Map<string, number> = new Map(),
	tpsWeight = 0.1,
): EntryMetrics[] {
	const metrics: EntryMetrics[] = entries.map((entry) => {
		const plan = plans.get(entry.provider);
		if (!plan)
			throw new Error(`no plan loaded for provider ${entry.provider}`);
		const cost = costPerRequest(entry.pricing, workload);
		const free = cost === 0;
		const requestsPerMonth = free
			? Number.POSITIVE_INFINITY
			: entry.allowance / cost;
		const ratios = windowRatios(plan);
		return {
			provider: entry.provider,
			plan: entry.plan,
			pricing: entry.pricing,
			allowance: entry.allowance,
			costPerRequest: cost,
			requestsPerMonth,
			requestsPerFiveHour: ratios.five * requestsPerMonth,
			requestsPerWeek: ratios.week * requestsPerMonth,
			payPerRequest: free ? 0 : (plan.price * cost) / entry.allowance,
			multiplier: plan.price > 0 ? entry.allowance / plan.price : 0,
			ability: lookupAbility(ability, entry.key),
			tps: tps.get(entry.key) ?? null,
			index: 0,
			valueIndex: null,
			free,
		};
	});
	assignIndex(metrics);
	assignValueIndex(metrics, abilityWeight, tpsWeight);
	return metrics;
}

function _indexByKey(
	entries: CatalogEntry[],
	metrics: EntryMetrics[],
): Map<string, EntryMetrics> {
	const byKey = new Map<string, EntryMetrics>();
	entries.forEach((entry, i) => {
		const metric = metrics[i];
		if (metric) byKey.set(entry.key, metric);
	});
	return byKey;
}

export { lookupAbility } from "./ability.ts";
export { costPerRequest, windowRatios } from "./cost.ts";
export { buildRows } from "./rows.ts";
export { assignIndex, assignValueIndex } from "./score.ts";
