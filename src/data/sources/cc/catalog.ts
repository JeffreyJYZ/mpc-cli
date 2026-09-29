import {
	extractCatalog,
	fetchText,
	parseRoleRows,
	parseTables,
} from "~/data/scrape/index.ts";
import type { CatalogEntry } from "~/types.ts";
import { CC_PLANS } from "./plans.ts";

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
	if (def.standardAllowance !== undefined) {
		fillDeals(
			entries,
			extractCatalog(tables, {
				provider: "cc",
				plan: def.label,
				defaultAllowance: def.standardAllowance,
			}),
		);
	}
	return entries;
}

/**
 * Fold the rate-only pass into the priced one: it adds models the credits
 * tables omit entirely (the free ones), and lends its promotion badges to
 * entries that came from a credits table — those carry no badges, so without
 * this a paid model silently loses the deal published beside its name.
 */
export function fillDeals(
	entries: CatalogEntry[],
	rateOnly: CatalogEntry[],
): void {
	const byKey = new Map(entries.map((entry) => [entry.key, entry]));
	for (const entry of rateOnly) {
		const existing = byKey.get(entry.key);
		if (!existing) {
			byKey.set(entry.key, entry);
			entries.push(entry);
			continue;
		}
		if (!existing.deal && entry.deal) existing.deal = entry.deal;
	}
}
