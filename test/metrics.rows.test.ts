import { describe, expect, test } from "bun:test";
import { buildRows } from "../src/metrics.ts";
import { ccPlan, entry, ocPlan, workload } from "./fixtures.ts";

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
