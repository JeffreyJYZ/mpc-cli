import { describe, expect, test } from "bun:test";
import {
	buildMetrics,
	buildRows,
	costPerRequest,
	lookupAbility,
} from "../src/metrics.ts";
import type { CatalogEntry, PlanInfo, Workload } from "../src/types.ts";

const workload: Workload = { input: 1_000, cacheRead: 50_000, output: 200 };

const ccPlan: PlanInfo = {
	provider: "cc",
	id: "goat",
	label: "GOAT",
	price: 10,
	credits: 70,
	fiveHour: 14,
	weekly: 35,
};
const ocPlan: PlanInfo = {
	provider: "oc-go",
	id: "go",
	label: "Go",
	price: 10,
	credits: 100,
	fiveHour: null,
	weekly: null,
};

function entry(overrides: Partial<CatalogEntry>): CatalogEntry {
	return {
		provider: "cc",
		plan: "GOAT",
		key: "m",
		name: "M",
		pricing: { input: 1, output: 1, cacheRead: 0, cacheWrite: null },
		allowance: 20,
		...overrides,
	};
}

describe("costPerRequest", () => {
	test("sums input, cache and output at per-million rates", () => {
		const cost = costPerRequest(
			{ input: 1, output: 1, cacheRead: 0, cacheWrite: null },
			{ input: 1_000_000, cacheRead: 1_000_000, output: 1_000_000 },
		);
		// 1 + 0 + 1
		expect(cost).toBeCloseTo(2, 10);
	});
});

describe("buildMetrics", () => {
	test("payPerRequest * requestsPerMonth equals plan price", () => {
		const [m] = buildMetrics(
			[entry({})],
			new Map([["cc", ccPlan]]),
			workload,
		);
		expect(m?.requestsPerMonth).toBeGreaterThan(0);
		expect(
			(m?.payPerRequest ?? 0) * (m?.requestsPerMonth ?? 0),
		).toBeCloseTo(ccPlan.price, 6);
	});

	test("free models are infinite and score 100", () => {
		const free = entry({
			pricing: { input: 0, output: 0, cacheRead: 0, cacheWrite: null },
		});
		const [m] = buildMetrics([free], new Map([["cc", ccPlan]]), workload);
		expect(m?.free).toBe(true);
		expect(m?.requestsPerMonth).toBe(Number.POSITIVE_INFINITY);
		expect(m?.index).toBe(100);
	});

	test("index stays within 0..100", () => {
		const entries = [
			entry({
				key: "a",
				pricing: {
					input: 0.1,
					output: 0.2,
					cacheRead: 0.01,
					cacheWrite: null,
				},
			}),
			entry({
				key: "b",
				pricing: {
					input: 5,
					output: 30,
					cacheRead: 0.5,
					cacheWrite: null,
				},
			}),
		];
		const metrics = buildMetrics(
			entries,
			new Map([["cc", ccPlan]]),
			workload,
		);
		for (const m of metrics) {
			expect(m.index).toBeGreaterThanOrEqual(0);
			expect(m.index).toBeLessThanOrEqual(100);
		}
	});
});

describe("buildRows", () => {
	test("joins both catalogs on the canonical key", () => {
		const oc = entry({
			provider: "oc-go",
			plan: "Go",
			key: "kimi k3",
			name: "Kimi K3",
		});
		const cc = entry({
			provider: "cc",
			plan: "GOAT",
			key: "kimi k3",
			name: "Kimi K3",
		});
		const only = entry({
			provider: "cc",
			plan: "GOAT",
			key: "solo",
			name: "Solo",
		});
		const rows = buildRows([oc], [cc, only], ocPlan, ccPlan, workload);
		const joined = rows.find((r) => r.key === "kimi k3");
		expect(joined?.oc).toBeDefined();
		expect(joined?.cc).toBeDefined();
		const solo = rows.find((r) => r.key === "solo");
		expect(solo?.oc).toBeUndefined();
		expect(solo?.cc).toBeDefined();
	});
});

describe("lookupAbility", () => {
	const scores = new Map([
		["glm52", 33.7],
		["deepseekv4flash", 34.3],
		["kimik27code", 25.8],
	]);
	test("exact key wins", () => {
		expect(lookupAbility(scores, "glm52")).toBe(33.7);
	});
	test("speed variants inherit the base model ability", () => {
		expect(lookupAbility(scores, "glm52fast")).toBe(33.7);
		expect(lookupAbility(scores, "deepseekv4flashfast")).toBe(34.3);
		expect(lookupAbility(scores, "kimik27codehighspeed")).toBe(25.8);
	});
	test("no base means no score", () => {
		expect(lookupAbility(scores, "mimov26proultraspeed")).toBeNull();
	});
});

describe("ability value index", () => {
	test("VAL is set for scored models and null otherwise", () => {
		const entries = [
			entry({
				key: "smart",
				pricing: {
					input: 1,
					output: 1,
					cacheRead: 0,
					cacheWrite: null,
				},
			}),
			entry({
				key: "dumb",
				pricing: {
					input: 1,
					output: 1,
					cacheRead: 0,
					cacheWrite: null,
				},
			}),
			entry({
				key: "unscored",
				pricing: {
					input: 1,
					output: 1,
					cacheRead: 0,
					cacheWrite: null,
				},
			}),
		];
		const ability = new Map([
			["smart", 60],
			["dumb", 10],
		]);
		const metrics = buildMetrics(
			entries,
			new Map([["cc", ccPlan]]),
			workload,
			ability,
			0.4,
		);
		const byKey = new Map(entries.map((e, i) => [e.key, metrics[i]]));
		expect(byKey.get("smart")?.ability).toBe(60);
		expect(byKey.get("smart")?.valueIndex).toBeGreaterThan(
			byKey.get("dumb")?.valueIndex ?? 0,
		);
		expect(byKey.get("unscored")?.ability).toBeNull();
		expect(byKey.get("unscored")?.valueIndex).toBeNull();
		for (const m of metrics) {
			if (m.valueIndex !== null) {
				expect(m.valueIndex).toBeGreaterThanOrEqual(0);
				expect(m.valueIndex).toBeLessThanOrEqual(100);
			}
		}
	});
});
