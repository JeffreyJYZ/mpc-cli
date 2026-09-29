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
