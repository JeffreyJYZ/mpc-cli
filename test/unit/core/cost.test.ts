import { describe, expect, test } from "bun:test";
import {
	costPerRequest,
	lookupAbility,
} from "../../../src/cli/engine/index.ts";

describe("costPerRequest", () => {
	test("sums input, cache and output at per-million rates", () => {
		const cost = costPerRequest(
			{ input: 1, output: 1, cacheRead: 0, cacheWrite: null },
			{ input: 1_000_000, cacheRead: 1_000_000, output: 1_000_000 },
		);
		expect(cost).toBeCloseTo(2, 10);
	});
});

describe("lookupAbility", () => {
	const scores = new Map([
		["glm52", 33.7],
		["deepseekv4flash", 34.3],
		["kimik27code", 25.8],
		["glm53flash", 41.8],
		["glm53", 44.8],
	]);
	test("exact key wins", () => {
		expect(lookupAbility(scores, "glm52")).toBe(33.7);
	});
	test("speed variants inherit the base model ability", () => {
		expect(lookupAbility(scores, "glm52fast")).toBe(33.7);
		expect(lookupAbility(scores, "deepseekv4flashfast")).toBe(34.3);
		expect(lookupAbility(scores, "kimik27codehighspeed")).toBe(25.8);
	});
	test("flashx inherits the flash tier, not the base", () => {
		expect(lookupAbility(scores, "glm53flashx")).toBe(41.8);
	});
	test("no base means no score", () => {
		expect(lookupAbility(scores, "mimov26proultraspeed")).toBeNull();
	});
});
