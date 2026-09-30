import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadShapes, sidesOf } from "~/data/shape.ts";

const OC = {
	input: 7_151,
	output: 296,
	reasoning: 18,
	cacheRead: 135_020,
	cacheWrite: 16,
};
const CC = {
	input: 3_680,
	output: 336,
	reasoning: 307,
	cacheRead: 397_217,
	cacheWrite: 0,
};

function payload(sides: unknown): string {
	return JSON.stringify({ weight: "turn", sides, models: [] });
}

describe("sidesOf", () => {
	test("each side becomes a workload of its own", () => {
		expect(
			sidesOf(
				payload({
					oc: { reqs: 3_676, profile: OC },
					cc: { reqs: 3_357, profile: CC },
				}),
			),
		).toEqual({ oc: OC, cc: CC });
	});

	test("a side nobody measured is absent, not zero-filled", () => {
		expect(sidesOf(payload({ cc: { reqs: 10, profile: CC } }))).toEqual({
			cc: CC,
		});
	});

	test("an older reqshape without per-side profiles yields nothing", () => {
		expect(sidesOf("{}")).toEqual({});
	});
});

describe("loadShapes", () => {
	test("off is the default and shells out to nobody", async () => {
		expect(await loadShapes("off")).toEqual({});
		expect(await loadShapes("")).toEqual({});
	});

	test("a saved payload is read from disk", async () => {
		const path = join(tmpdir(), `mpc-shape-${Date.now()}.json`);
		await Bun.write(path, payload({ oc: { reqs: 1, profile: OC } }));
		expect(await loadShapes(path)).toEqual({ oc: OC });
	});

	test("a missing file falls back rather than throwing", async () => {
		expect(
			await loadShapes(join(tmpdir(), "mpc-no-such-shape.json")),
		).toEqual({});
	});
});
