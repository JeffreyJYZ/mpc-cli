import type { ModelPricing, PlanInfo, Workload } from "../../types.ts";

const PER_MILLION = 1_000_000;

/** USD of list-rate spend for a single request under the fixed workload. */
export function costPerRequest(
	pricing: ModelPricing,
	workload: Workload,
): number {
	return (
		(workload.input * pricing.input +
			workload.cacheRead * pricing.cacheRead +
			workload.output * pricing.output) /
		PER_MILLION
	);
}

/**
 * Fraction of the monthly allowance each rolling window allows, per provider.
 * OpenCode Go fixes this at 20%/50%; CommandCode derives it from the plan's own
 * 5-hour / weekly dollar caps.
 */
export function windowRatios(plan: PlanInfo): { five: number; week: number } {
	if (plan.provider === "oc-go") return { five: 0.2, week: 0.5 };
	if (plan.fiveHour !== null && plan.weekly !== null && plan.credits > 0) {
		return {
			five: plan.fiveHour / plan.credits,
			week: plan.weekly / plan.credits,
		};
	}
	return { five: 1, week: 1 };
}
