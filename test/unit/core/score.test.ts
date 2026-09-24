import { describe, expect, test } from "bun:test";
import { buildMetrics } from "../../../src/cli/engine/index.ts";
import { DEFAULT_SCORE } from "../../../src/cli/engine/score.ts";
import { ccPlan, entry, workload } from "../fixtures.ts";

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
		for (const m of buildMetrics(
			entries,
			new Map([["cc", ccPlan]]),
			workload,
		)) {
			expect(m.index).toBeGreaterThanOrEqual(0);
			expect(m.index).toBeLessThanOrEqual(100);
		}
	});
});

describe("ability value index", () => {
	test("VAL is set for scored models and null otherwise", () => {
		const price = { input: 1, output: 1, cacheRead: 0, cacheWrite: null };
		const entries = [
			entry({ key: "smart", pricing: price }),
			entry({ key: "dumb", pricing: price }),
			entry({ key: "unscored", pricing: price }),
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
			new Map(),
			{ ...DEFAULT_SCORE, abilityWeight: 0.4 },
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
