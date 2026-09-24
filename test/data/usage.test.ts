import { describe, expect, test } from "bun:test";
import { parseUsage } from "../../src/data/usage.ts";

const CMDUSE = JSON.stringify({
	models: {
		"zai-org/GLM-5.2": {
			cacheRead: 7742976,
			cacheWrite: 0,
			costUsd: 15.72,
			requests: 142,
			tokensIn: 9637736,
			tokensOut: 49466,
		},
	},
});

describe("parseUsage", () => {
	test("reads the cmduse models map and normalises keys", () => {
		const [entry] = parseUsage(CMDUSE);
		expect(entry?.key).toBe("glm52");
		expect(entry?.requests).toBe(142);
		expect(entry?.tokensIn).toBe(9637736);
		expect(entry?.costUsd).toBeCloseTo(15.72, 2);
	});

	test("accepts a bare array of entries", () => {
		const rows = parseUsage(
			JSON.stringify([
				{ model: "GLM-5.3 Flash", requests: 3, tokensIn: 100 },
			]),
		);
		expect(rows[0]?.key).toBe("glm53flash");
		expect(rows[0]?.cacheRead).toBe(0);
	});
});
