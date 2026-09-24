import {
	extractCatalog,
	fetchText,
	parseRoleRows,
	parseTables,
} from "../html.ts";
import type { CatalogEntry, PlanInfo } from "../types.ts";

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
		grid: true,
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
interface CmdusePlan {
	name: string;
	price: string;
	creditsMonthly: string;
	fiveHour: string;
	weekly: string;
}

function money(value: string): number | null {
	const m = value.match(/\$?\s*([0-9]+(?:\.[0-9]+)?)/);
	return m ? Number(m[1]) : null;
}

async function cmdusePlans(): Promise<CmdusePlan[]> {
	let proc: Bun.Subprocess<"pipe", "pipe", "pipe">;
	try {
		proc = Bun.spawn(["cmduse", "plans", "--json"], {
			stdout: "pipe",
			stderr: "pipe",
		});
	} catch {
		throw new Error(
			"`cmduse` not found on PATH — install the command-code CLI to read live plan limits.",
		);
	}
	const [out, err, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	if (code !== 0) {
		throw new Error(`cmduse plans --json failed (${code}): ${err.trim()}`);
	}
	return JSON.parse(out) as CmdusePlan[];
}

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

/** Per-model token rates + monthly credit allowance for a CommandCode plan. */
export async function loadCcCatalog(planId: string): Promise<CatalogEntry[]> {
	const def = CC_PLANS[planId];
	if (!def) throw new Error(`unknown CommandCode plan "${planId}"`);
	const url = `https://commandcode.ai/docs/plans/${def.slug}`;
	const html = await fetchText(url);

	if (!def.creditHeader) {
		// No credits column: the plan publishes a rate-only model list, so every
		// model draws on the plan's whole credit pool.
		const grid = await parseRoleRows(html);
		const entries = extractCatalog(grid, {
			provider: "cc",
			plan: def.label,
			defaultAllowance: def.standardAllowance ?? 0,
		});
		if (entries.length === 0) {
			throw new Error(
				`no model rows parsed from ${url} — docs layout may have changed`,
			);
		}
		return entries;
	}

	const tables = await parseTables(html);
	const entries = extractCatalog(tables, {
		provider: "cc",
		plan: def.label,
		creditHeader: def.creditHeader,
	});
	if (entries.length === 0) {
		throw new Error(
			`no model tables parsed from ${url} — docs layout may have changed`,
		);
	}
	// Fill models the page lists with rates but no per-model credits row.
	if (def.standardAllowance !== undefined) {
		const extra = extractCatalog(tables, {
			provider: "cc",
			plan: def.label,
			defaultAllowance: def.standardAllowance,
		});
		const seen = new Set(entries.map((e) => e.key));
		for (const entry of extra) {
			if (!seen.has(entry.key)) {
				seen.add(entry.key);
				entries.push(entry);
			}
		}
	}
	return entries;
}
