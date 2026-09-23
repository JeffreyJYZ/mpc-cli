import { describe, expect, test } from "bun:test";
import { parseAaWeb } from "../src/sources/artificialAnalysis.ts";

// Mirrors the shape Artificial Analysis embeds in its models page flight data.
const AA_FIXTURE = `<script>{"citation":"Artificial Analysis (2025). LLM benchmarks dataset.","data":[{"label":"Claude Opus 5.5 (max with fallback)","intelligenceIndex":57.62,"detailsUrl":"/models/claude-opus-5-5"},{"label":"GLM-5.3-Flash","intelligenceIndex":30.5,"detailsUrl":"/models/glm-5-3-flash"},{"label":"Qwen3.8 Max (0902)","intelligenceIndex":41.1,"detailsUrl":"/models/qwen3-8-max-0902"}]}</script>`;

describe("parseAaWeb", () => {
	test("maps slugs and labels onto canonical keys", () => {
		const scores = parseAaWeb(AA_FIXTURE);
		expect(scores.get("claudeopus55")).toBeCloseTo(57.62, 2);
		expect(scores.get("glm53flash")).toBeCloseTo(30.5, 2);
		// Variant suffix in the label must not leak; slug keeps the 0902 variant.
		expect(scores.get("qwen38max0902")).toBeCloseTo(41.1, 2);
	});

	test("empty when no dataset present", () => {
		expect(parseAaWeb("<html></html>").size).toBe(0);
	});
});
