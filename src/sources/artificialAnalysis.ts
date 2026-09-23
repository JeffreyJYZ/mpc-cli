import { fetchText } from "../html.ts";
import { normalizeKey } from "../normalize.ts";

const MODELS_URL = "https://artificialanalysis.ai/models";
const API_URL = "https://artificialanalysis.ai/api/v2/data/llms/models";

/** A model label and its Artificial Analysis Intelligence Index. */
interface Scored {
	label: string;
	slug?: string;
	score: number;
}

/** Every `{label, intelligenceIndex, detailsUrl}` the models page embeds. */
function parseEmbedded(html: string): Scored[] {
	const re =
		/"label":"([^"]+)","intelligenceIndex":([0-9.]+)(?:,"detailsUrl":"([^"]*)")?/g;
	const out: Scored[] = [];
	const seen = new Set<string>();
	let match: RegExpExecArray | null;
	while ((match = re.exec(html)) !== null) {
		const label = match[1] ?? "";
		const score = Number(match[2]);
		const slug = match[3]?.split("/").pop();
		const id = `${label}|${slug ?? ""}`;
		if (!label || !Number.isFinite(score) || seen.has(id)) continue;
		seen.add(id);
		out.push({ label, slug, score });
	}
	return out;
}

function toMap(scored: Scored[]): Map<string, number> {
	const scores = new Map<string, number>();
	for (const { label, slug, score } of scored) {
		// slug is the more precise key; label is the fallback.
		if (slug) scores.set(normalizeKey(slug), score);
		const labelKey = normalizeKey(label);
		if (labelKey && !scores.has(labelKey)) scores.set(labelKey, score);
	}
	return scores;
}

/** Keyless scrape of the Artificial Analysis models page. Only the models that
 * page embeds (its chart top-N) are covered, so this is a fallback, not a full
 * catalog.
 */
export async function loadAaWeb(): Promise<Map<string, number>> {
	const html = await fetchText(MODELS_URL);
	return parseAaWeb(html);
}

/** Pure parser over the AA models page HTML, for tests and the scraper. */
export function parseAaWeb(html: string): Map<string, number> {
	return toMap(parseEmbedded(html));
}

/** Full catalog via the Artificial Analysis API. Needs a key. */
export async function loadAaApi(key: string): Promise<Map<string, number>> {
	const res = await fetch(API_URL, {
		headers: { "x-api-key": key, "user-agent": "mpc/0.1" },
	});
	if (!res.ok) {
		throw new Error(
			`Artificial Analysis API ${res.status}: set AA_API_KEY or use --bench cc / aa-web`,
		);
	}
	const body = (await res.json()) as { data?: unknown[] };
	const rows = Array.isArray(body.data) ? body.data : [];
	return toMap(
		rows
			.map((row) => parseApiRow(row))
			.filter((row): row is Scored => row !== null),
	);
}

function parseApiRow(row: unknown): Scored | null {
	if (!row || typeof row !== "object") return null;
	const record = row as Record<string, unknown>;
	const label = String(record.name ?? record.slug ?? "");
	const slug = typeof record.slug === "string" ? record.slug : undefined;
	const evaluations = record.evaluations as
		| Record<string, unknown>
		| undefined;
	const raw =
		evaluations?.artificial_analysis_intelligence_index ??
		evaluations?.intelligence_index ??
		record.intelligence_index ??
		record.intelligenceIndex;
	const score = Number(raw);
	if (!label || !Number.isFinite(score)) return null;
	return { label, slug, score };
}
