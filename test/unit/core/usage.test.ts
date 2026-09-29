import { describe, expect, test } from "bun:test";
import { project } from "~/cli/engine/project.ts";
import type { UsageEntry } from "~/data/usage/index.ts";
import { ccPlan, entry, ocPlan } from "../fixtures.ts";

const usage: UsageEntry = {
	key: "m",
	name: "M",
	requests: 100,
	tokensIn: 10_000_000,
	cacheRead: 0,
	cacheWrite: 0,
	tokensOut: 0,
	costUsd: 0,
};

describe("project", () => {
	test("derives per-request cost and plan-relative monthly", () => {
		const ocEntry = entry({
			provider: "oc-go",
			plan: "Go",
			key: "m",
			allowance: 20,
		});
		const ccEntry = entry({
			provider: "cc",
			plan: "GOAT",
			key: "m",
			allowance: 10,
		});
		const result = project(
			[usage],
			{ "oc-go": [ocEntry], cc: [ccEntry] },
			{ "oc-go": ocPlan, cc: ccPlan },
			{ months: 1 },
		);
		const row = result.rows[0];
		// 10M input at $1/M = $10 period cost, 100 requests -> $0.10 each.
		expect(row?.cc?.costPerRequest).toBeCloseTo(0.1, 6);
		// $10 plan price over a $10 allowance -> $0.10 per request.
		expect(row?.cc?.payPerRequest).toBeCloseTo(0.1, 6);
		expect(row?.cc?.monthly).toBeCloseTo(10, 6);
		// allowance 10 vs 10 drawn -> right at the cap, not over.
		expect(row?.cc?.overCap).toBe(false);
		expect(row?.cc?.creditsDrawn).toBeCloseTo(10, 6);
	});

	test("flags over-cap usage and scales by months", () => {
		const onlySmall = entry({
			provider: "cc",
			plan: "GOAT",
			key: "m",
			allowance: 5,
		});
		const result = project(
			[usage],
			{ "oc-go": [], cc: [onlySmall] },
			{ "oc-go": ocPlan, cc: ccPlan },
			{ months: 1 },
		);
		expect(result.rows[0]?.cc?.overCap).toBe(true);
		const twoMonths = project(
			[usage],
			{ "oc-go": [], cc: [onlySmall] },
			{ "oc-go": ocPlan, cc: ccPlan },
			{ months: 2 },
		);
		expect(twoMonths.ccMonthly).toBeCloseTo(result.ccMonthly / 2, 6);
	});

	test("reports unmatched models instead of dropping silently", () => {
		const result = project(
			[{ ...usage, key: "nope", name: "Ghost" }],
			{ "oc-go": [], cc: [] },
			{ "oc-go": ocPlan, cc: ccPlan },
			{ months: 1 },
		);
		expect(result.unmatched).toEqual(["Ghost"]);
		expect(result.rows).toHaveLength(0);
	});
});
