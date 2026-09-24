import { BOUNDARY } from "../types.ts";

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
