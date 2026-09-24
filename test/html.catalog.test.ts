import { describe, expect, test } from "bun:test";
import { extractCatalog, parseTables } from "../src/html.ts";

const FIXTURE = `
<table>
	<tr><th>Model</th><th>Input</th><th>Output</th><th>Cache Read</th><th>Cache Write</th><th>Monthly credits</th></tr>
	<tr><td><a href="/m/kimi-k3">Kimi K3</a></td><td>$3.00</td><td>$15.00</td><td>$0.30</td><td>—</td><td><del>$20</del><strong>$30</strong><small>1.5x</small></td></tr>
</table>
<table>
	<tr><th>Model ↕</th><th>Context ↕</th><th>Input ↕</th><th>Output ↕</th><th>Cache read ↕</th><th>Caps ↕</th></tr>
	<tr><td>GLM-5.1</td><td>200K</td><td>$1.40</td><td>$4.40</td><td>$0.26</td><td>+1</td></tr>
	<tr><td>Grok 4.7<del>-40%</del></td><td>500K</td><td><del>$2.00</del>$1.20</td><td><del>$6.00</del>$3.60</td><td><del>$0.50</del>$0.30</td><td>+1</td></tr>
</table>
`;

describe("parseTables + extractCatalog", () => {
	test("reads credits and rates from a pricing table", async () => {
		const tables = await parseTables(FIXTURE);
		const entries = extractCatalog(tables, {
			provider: "cc",
			plan: "GOAT",
			creditHeader: /monthly credit/i,
		});
		expect(entries).toHaveLength(1);
		const kimi = entries[0];
		expect(kimi?.name).toBe("Kimi K3");
		expect(kimi?.allowance).toBe(30);
		expect(kimi?.pricing.input).toBe(3);
		expect(kimi?.pricing.output).toBe(15);
		expect(kimi?.pricing.cacheRead).toBe(0.3);
		expect(kimi?.pricing.cacheWrite).toBeNull();
	});

	test("fallback fills rate-only tables with a standard allowance", async () => {
		const tables = await parseTables(FIXTURE);
		const entries = extractCatalog(tables, {
			provider: "cc",
			plan: "GOAT",
			defaultAllowance: 20,
		});
		const byKey = new Map(entries.map((e) => [e.key, e]));
		expect(byKey.get("glm51")?.allowance).toBe(20);
		expect(byKey.get("glm51")?.pricing.input).toBe(1.4);
		// Deal badge text must not leak into the key.
		expect(byKey.get("grok47")?.pricing.input).toBe(1.2);
	});
});

describe("opencode Go peak/off-peak selection", () => {
	const PEAK_FIXTURE = `
	<table>
		<tr><th>Model</th><th>Input</th><th>Output</th><th>Cached Read</th><th>Monthly limit</th></tr>
		<tr><td>DeepSeek V4.1 Flash (Off-Peak)</td><td>$0.15</td><td>$0.60</td><td>$0.003</td><td><del>$15</del> $60</td></tr>
		<tr><td>DeepSeek V4.1 Flash (Peak)</td><td>$0.30</td><td>$1.20</td><td>$0.006</td><td><del>$15</del> $60</td></tr>
	</table>`;

	test("defaults to off-peak", async () => {
		const tables = await parseTables(PEAK_FIXTURE);
		const [entry] = extractCatalog(tables, {
			provider: "oc-go",
			plan: "Go",
			creditHeader: /monthly limit/i,
		});
		expect(entry?.pricing.input).toBe(0.15);
		expect(entry?.allowance).toBe(60);
	});

	test("--peak selects the peak row", async () => {
		const tables = await parseTables(PEAK_FIXTURE);
		const [entry] = extractCatalog(tables, {
			provider: "oc-go",
			plan: "Go",
			creditHeader: /monthly limit/i,
			peak: true,
		});
		expect(entry?.pricing.input).toBe(0.3);
	});
});
