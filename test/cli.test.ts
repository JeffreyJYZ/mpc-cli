import { describe, expect, test } from "bun:test";
import { parseArgs } from "../src/cli.ts";

describe("parseArgs", () => {
	test("defaults", () => {
		const o = parseArgs([]);
		expect(o.ccPlan).toBe("goat");
		expect(o.workload).toEqual({
			input: 800,
			cacheRead: 50_000,
			output: 200,
		});
		expect(o.metric).toBe("val");
		expect(o.only).toBe("all");
	});

	test("workload overrides, space and equals forms", () => {
		const o = parseArgs(["--in", "1200", "--cache=0", "--out", "500"]);
		expect(o.workload).toEqual({ input: 1200, cacheRead: 0, output: 500 });
	});

	test("plan, metric and flags", () => {
		const o = parseArgs([
			"--cc-plan",
			"pro",
			"--metric",
			"req",
			"--peak",
			"--json",
		]);
		expect(o.ccPlan).toBe("pro");
		expect(o.metric).toBe("req");
		expect(o.peak).toBe(true);
		expect(o.json).toBe(true);
	});

	test("rejects unknown flags and bad numbers", () => {
		expect(() => parseArgs(["--nope"])).toThrow();
		expect(() => parseArgs(["--in", "-5"])).toThrow();
		expect(() => parseArgs(["--metric", "wat"])).toThrow();
		expect(() => parseArgs(["--only", "some"])).toThrow();
	});
});
