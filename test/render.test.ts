import { describe, expect, test } from "bun:test";
import { fmtUsd, tally } from "../src/render.ts";
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

describe("fmtUsd", () => {
	test("no scientific notation for tiny values", () => {
		expect(fmtUsd(0.00003667)).toBe("$0.00003667");
		expect(fmtUsd(0.00011)).toBe("$0.00011");
		expect(fmtUsd(0.065)).toBe("$0.065");
		expect(fmtUsd(0.0367)).toBe("$0.0367");
		expect(fmtUsd(0)).toBe("free");
	});
});
