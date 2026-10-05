import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadShapes, workloadOf } from "~/data/shape.ts";

const PROFILE = {
	input: 7_151,
	output: 296,
	reasoning: 18,
	cacheRead: 135_020,
	cacheWrite: 16,
};

function payload(profile: unknown): string {
	return JSON.stringify({ weight: "turn", profile, models: [] });
}

describe("workloadOf", () => {
	test("reads the combined per-req profile as one workload", () => {
		expect(workloadOf(payload(PROFILE))).toEqual(PROFILE);
	});

	test("falls back to shape.perReq for an older payload", () => {
		expect(
			workloadOf(JSON.stringify({ shape: { perReq: PROFILE } })),
		).toEqual(PROFILE);
	});

	test("a payload with no profile yields nothing", () => {
		expect(workloadOf("{}")).toBeUndefined();
	});
});

describe("loadShapes", () => {
	test("off is the default and shells out to nobody", async () => {
		expect(await loadShapes("off")).toBeUndefined();
		expect(await loadShapes("")).toBeUndefined();
	});

	test("a saved payload is read from disk", async () => {
		const path = join(tmpdir(), `mpc-shape-${Date.now()}.json`);
		await Bun.write(path, payload(PROFILE));
		expect(await loadShapes(path)).toEqual(PROFILE);
	});

	test("a missing file falls back rather than throwing", async () => {
		expect(
			await loadShapes(join(tmpdir(), "mpc-no-such-shape.json")),
		).toBeUndefined();
	});
});
