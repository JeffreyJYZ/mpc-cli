import { describe, expect, test } from "bun:test";
import { parseArgs } from "../../src/cli/run.ts";

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
		expect(o.colorMode).toBe("auto");
	});

	test("workload overrides, space and equals forms", () => {
		const o = parseArgs(["--in", "1200", "--cache=0", "--out", "500"]);
		expect(o.workload).toEqual({ input: 1200, cacheRead: 0, output: 500 });
	});

	test("plan, metric and boolean flags", () => {
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

	test("--no-* flags map to the negated option", () => {
		const o = parseArgs(["--no-color", "--no-fallback", "--no-ability"]);
		expect(o.colorMode).toBe("never");
		expect(o.noFallback).toBe(true);
		expect(o.noAbility).toBe(true);
	});

	test("columns split and pass help through", () => {
		expect(parseArgs(["--columns", "model, cost ,val"]).columns).toEqual([
			"model",
			"cost",
			"val",
		]);
		expect(parseArgs(["--columns", "help"]).columns).toEqual(["help"]);
	});

	test("weights parse as shares", () => {
		const o = parseArgs(["--bench-weight", "0.6", "--tps-weight", "0"]);
		expect(o.benchWeight).toBe(0.6);
		expect(o.tpsWeight).toBe(0);
	});

	test("rejects unknown flags and bad values", () => {
		expect(() => parseArgs(["--nope"])).toThrow();
		expect(() => parseArgs(["--in", "-5"])).toThrow();
		expect(() => parseArgs(["--in", "1.5"])).toThrow();
		expect(() => parseArgs(["--width", "abc"])).toThrow();
		expect(() => parseArgs(["--bench-weight", "2"])).toThrow();
		expect(() => parseArgs(["--metric", "wat"])).toThrow();
		expect(() => parseArgs(["--only", "some"])).toThrow();
	});
});
