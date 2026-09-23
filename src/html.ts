import { displayName, normalizeKey } from "./normalize.ts";
import type { CatalogEntry, ModelPricing, ProviderId } from "./types.ts";
import { BOUNDARY } from "./types.ts";

export type Table = string[][];

function clean(text: string): string {
	return text
		.replace(/\u00a0/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

/** Collapse a raw cell (boundary markers included) into plain text. */
function cellText(cell: string): string {
	return clean(cell.split(BOUNDARY).join(" "));
}

/** Parse every <table> on a page into rows of trimmed cell text. */
export async function parseTables(html: string): Promise<Table[]> {
	const tables: Table[] = [];
	let table: Table | null = null;
	let row: string[] | null = null;
	let cell: string | null = null;

	const rewriter = new HTMLRewriter()
		.on("table", {
			element(el) {
				table = [];
				el.onEndTag(() => {
					if (table) tables.push(table);
					table = null;
				});
			},
		})
		.on("tr", {
			element(el) {
				const start = table;
				row = [];
				el.onEndTag(() => {
					if (row && start) start.push(row);
					row = null;
				});
			},
		})
		.on("th, td", {
			element(el) {
				const current = row;
				cell = "";
				el.onEndTag(() => {
					// BOUNDARY marks a text-node boundary so "$60" + "4x" stays
					// two tokens instead of collapsing into "$604x".
					if (current) current.push((cell ?? "").trim());
					cell = null;
				});
			},
			text(chunk) {
				if (cell !== null) cell += `${chunk.text}${BOUNDARY}`;
			},
		});

	await rewriter.transform(new Response(html)).text();
	return tables;
}

/**
 * Parse `role="row"` div grids (Command Code's model catalog on some plan
 * pages) into the same Table shape as parseTables.
 */
export async function parseRoleRows(html: string): Promise<Table[]> {
	let grid: Table | null = null;
	let row: string[] | null = null;
	let cell: string | null = null;

	const rewriter = new HTMLRewriter()
		.on('div[role="row"]', {
			element(el) {
				grid ??= [];
				const start = grid;
				row = [];
				el.onEndTag(() => {
					if (row && start) start.push(row);
					row = null;
				});
			},
		})
		.on('div[role="row"] > div', {
			element(el) {
				const current = row;
				cell = "";
				el.onEndTag(() => {
					if (current) current.push((cell ?? "").trim());
					cell = null;
				});
			},
			text(chunk) {
				if (cell !== null) cell += `${chunk.text}${BOUNDARY}`;
			},
		});

	await rewriter.transform(new Response(html)).text();
	return grid ? [grid] : [];
}

/**
 * Pull USD out of a price/allowance cell. Cells carry BOUNDARY text-node
 * boundaries; each segment is scanned and the last one carrying a price wins,
 * which skips trailing multiplier notes like "4x". "Free" is 0, em-dash null.
 */
export function parseMoney(cell: string): number | null {
	let result: number | null = null;
	for (const segment of cell.split(BOUNDARY)) {
		const s = segment.replace(/~~/g, "").trim();
		if (/\bfree\b/i.test(s)) return 0;
		const matches = [...s.matchAll(/\$\s*([0-9]+(?:\.[0-9]+)?)/g)];
		if (matches.length > 0) {
			result = Number(matches[matches.length - 1]?.[1]);
		}
	}
	return result;
}

interface CatalogOptions {
	provider: ProviderId;
	plan: string;
	/** Matches the header cell that carries the per-model allowance. */
	creditHeader?: RegExp;
	/** Allowance to assume for rate-only tables (no allowance column). */
	defaultAllowance?: number;
	/** opencode Go only: prefer peak-rate rows over off-peak. */
	peak?: boolean;
}

function variantScore(name: string, peak: boolean): number {
	const lower = name.toLowerCase();
	let score = 0;
	// Prefer the base context tier over the "> 200K" tier.
	if (lower.includes(">")) score += 2;
	const isOff = lower.includes("off-peak");
	const isPeak = !isOff && lower.includes("peak");
	if (peak) score += isPeak ? 0 : 2;
	else score += isOff ? 0 : isPeak ? 2 : 1;
	return score;
}

function headerIndex(header: string[], pattern: RegExp): number {
	return header.findIndex((h) => {
		// Header cells carry sort arrows ("Input ↕"); strip non-alphanumerics.
		const norm = h
			.replace(/[^a-z0-9 ]+/gi, " ")
			.replace(/\s+/g, " ")
			.trim();
		return pattern.test(norm);
	});
}

/**
 * Extract a provider catalog from already-parsed tables. Only tables whose
 * header carries Input + Output + an allowance column qualify, so the wide
 * "models included" tables are ignored.
 */
export function extractCatalog(
	tables: Table[],
	options: CatalogOptions,
): CatalogEntry[] {
	const {
		provider,
		plan,
		creditHeader,
		defaultAllowance,
		peak = false,
	} = options;
	const best = new Map<string, { entry: CatalogEntry; score: number }>();

	for (const table of tables) {
		const header = (table[0] ?? []).map(cellText);
		if (header.length < 4) continue;

		const inCol = headerIndex(header, /^input/i);
		const outCol = headerIndex(header, /^output/i);
		const cacheCol = headerIndex(header, /cache(d)?\s*read/i);
		const creditCol = creditHeader ? headerIndex(header, creditHeader) : -2;
		const writeCol = headerIndex(header, /cache\s*write/i);
		if (inCol < 0 || outCol < 0) continue;
		if (creditHeader && creditCol < 0) continue;
		if (!creditHeader && defaultAllowance === undefined) continue;

		for (const cells of table.slice(1)) {
			// The name cell may append deal badges; the first text node is the name.
			const rawName = cellText((cells[0] ?? "").split(BOUNDARY)[0] ?? "");
			if (!rawName) continue;
			const pricing: ModelPricing = {
				input: parseMoney(cells[inCol] ?? "") ?? 0,
				output: parseMoney(cells[outCol] ?? "") ?? 0,
				cacheRead:
					cacheCol >= 0
						? (parseMoney(cells[cacheCol] ?? "") ?? 0)
						: 0,
				cacheWrite:
					writeCol >= 0 ? parseMoney(cells[writeCol] ?? "") : null,
			};
			const allowance = creditHeader
				? parseMoney(cells[creditCol] ?? "")
				: (defaultAllowance ?? 0);
			if (allowance === null) continue;

			const key = normalizeKey(rawName);
			if (!key) continue;

			const score = variantScore(rawName, peak);
			const existing = best.get(key);
			if (existing && existing.score <= score) continue;
			best.set(key, {
				score,
				entry: {
					provider,
					plan,
					key,
					name: displayName(rawName),
					pricing,
					allowance,
				},
			});
		}
	}

	return [...best.values()].map((v) => v.entry);
}

/**
 * Pull one numeric column out of any tables that carry it, keyed by model.
 * Used for benchmark columns like Command Code's "Intelligence".
 */
export function extractNumericColumn(
	tables: Table[],
	header: RegExp,
): Map<string, number> {
	const scores = new Map<string, number>();
	for (const table of tables) {
		const headerCells = (table[0] ?? []).map(cellText);
		const col = headerIndex(headerCells, header);
		if (col < 0) continue;
		for (const cells of table.slice(1)) {
			const rawName = cellText((cells[0] ?? "").split(BOUNDARY)[0] ?? "");
			const key = normalizeKey(rawName);
			if (!key || scores.has(key)) continue;
			const match = (cells[col] ?? "").match(/-?[0-9]+(?:\.[0-9]+)?/);
			if (match) scores.set(key, Number(match[0]));
		}
	}
	return scores;
}

export async function fetchText(url: string): Promise<string> {
	const res = await fetch(url, {
		headers: { "user-agent": "mpc/0.1 (+model price compare)" },
	});
	if (!res.ok)
		throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`);
	return res.text();
}
