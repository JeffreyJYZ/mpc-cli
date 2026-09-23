import { describe, expect, test } from "bun:test";
import { fitColumns, fmtUsd, tableWidth, tally } from "../src/render.ts";
import type { CompareRow, EntryMetrics } from "../src/types.ts";

function metric(payPerRequest: number): EntryMetrics {
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
		index: 0,
		free: payPerRequest === 0,
	};
}

function row(key: string, oc?: number, cc?: number): CompareRow {
	return {
		key,
		name: key,
		oc: oc === undefined ? undefined : metric(oc),
		cc: cc === undefined ? undefined : metric(cc),
	};
}

describe("tally", () => {
	test("counts head-to-head wins, ties and exclusives", () => {
		const t = tally([
			row("a", 1, 2), // oc wins
			row("b", 3, 2), // cc wins
			row("c", 2, 2), // tie
			row("d", 1), // oc only
			row("e", undefined, 1), // cc only
		]);
		expect(t).toEqual({
			headToHead: 3,
			ocWins: 1,
			ccWins: 1,
			ties: 1,
			ocOnly: 1,
			ccOnly: 1,
		});
	});

	test("free beats paid", () => {
		const t = tally([row("a", 0, 5), row("b", 5, 0)]);
		expect(t.ocWins).toBe(1);
		expect(t.ccWins).toBe(1);
	});
});

describe("fitColumns", () => {
	test("drops optional columns symmetrically to fit", () => {
		const rows = [row("a", 1, 2), row("b", 3, 2)];
		const wide = [
			"model",
			"oc-rates",
			"oc-allow",
			"oc-per1k",
			"cc-rates",
			"cc-allow",
			"cc-per1k",
			"win",
			"idx",
		];
		const before = tableWidth(rows, wide);
		const fit = fitColumns(rows, wide, 40);
		expect(fit.width).toBeLessThan(before);
		expect(fit.dropped).toContain("oc-rates");
		expect(fit.dropped).toContain("cc-rates");
		// rates dropped from both sides or neither, never one.
		expect(fit.ids.includes("oc-rates")).toBe(fit.ids.includes("cc-rates"));
	});

	test("never drops columns without a drop priority", () => {
		const rows = [row("a", 1, 2)];
		const ids = ["model", "oc-allow", "cc-allow", "win", "idx"];
		const fit = fitColumns(rows, ids, 5);
		expect(fit.ids).toEqual(ids);
	});

	test("keeps everything when it already fits", () => {
		const rows = [row("a", 1, 2)];
		const ids = ["model", "win", "idx"];
		const fit = fitColumns(rows, ids, 10_000);
		expect(fit.ids).toEqual(ids);
		expect(fit.dropped).toEqual([]);
	});
});

describe("fmtUsd", () => {
	test("no scientific notation for tiny values", () => {
		expect(fmtUsd(0.00003667)).toBe("$0.00003667");
		expect(fmtUsd(0.00011)).toBe("$0.00011");
		expect(fmtUsd(0.065)).toBe("$0.065");
		expect(fmtUsd(0.0367)).toBe("$0.0367");
		expect(fmtUsd(0)).toBe("free");
	});
});
