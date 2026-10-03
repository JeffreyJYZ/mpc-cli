import type { PlanInfo } from "~/types.ts";
import { cmdusePlans, money } from "./cmduse.ts";

interface CcPlanDef {
	/** cmduse plan name. */
	cmduse: string;
	label: string;
	/** Docs page slug under /docs/plans/. */
	slug: string;
	/** Allowance column header; omitted when the page publishes no credits column. */
	creditHeader?: RegExp;
	/**
	 * Allowance for models the docs list without an explicit credits row.
	 * GOAT/Pro: the standard 2x rate ($20 / $30). Go: the whole $10 plan pool,
	 * since Go publishes no per-model allowances.
	 */
	standardAllowance?: number;
	/** Parse the model list from a `role="row"` div grid instead of <table>. */
	grid?: boolean;
}

export const CC_PLANS: Record<string, CcPlanDef> = {
	go: {
		cmduse: "Go",
		label: "Go",
		slug: "go",
		standardAllowance: 10,
	},
	goat: {
		cmduse: "GOAT",
		label: "GOAT",
		slug: "goat",
		creditHeader: /monthly credit/i,
		standardAllowance: 20,
	},
	pro: {
		cmduse: "Pro",
		label: "Pro",
		slug: "pro",
		creditHeader: /monthly credit/i,
		standardAllowance: 30,
	},
	max10: {
		cmduse: "Max 10x",
		label: "Max 10x",
		slug: "max",
		creditHeader: /max\s*10/i,
	},
	max20: {
		cmduse: "Max 20x",
		label: "Max 20x",
		slug: "max",
		creditHeader: /max\s*20/i,
	},
};

/** Plan price + windows for a CommandCode plan, from the official JSON. */
export async function loadCcPlan(planId: string): Promise<PlanInfo> {
	const def = CC_PLANS[planId];
	if (!def) {
		throw new Error(
			`unknown CommandCode plan "${planId}" (have: ${Object.keys(CC_PLANS).join(", ")})`,
		);
	}
	const plans = await cmdusePlans();
	const match = plans.find((p) => p.name === def.cmduse);
	if (!match) {
		throw new Error(
			`cmduse plans --json has no plan named "${def.cmduse}"`,
		);
	}
	return {
		provider: "cc",
		id: planId,
		label: def.label,
		price: money(match.price) ?? 0,
		credits: money(match.creditsMonthly) ?? 0,
		fiveHour: money(match.fiveHour),
		weekly: money(match.weekly),
	};
}
