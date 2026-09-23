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
export async function loadAaApi(
	key: string,
): Promise<{ intelligence: Map<string, number>; tps: Map<string, number> }> {
	const res = await fetch(API_URL, {
		headers: { "x-api-key": key, "user-agent": "mpc/0.1" },
	});
	if (!res.ok) {
		throw new Error(
			`Artificial Analysis API ${res.status}: set AA_API_KEY or use --bench cc / aa-web`,
		);
	}
	return parseAaApi(await res.json());
}

/** Pure parser over the AA API response, for tests and the loader. */
export function parseAaApi(body: unknown): {
	intelligence: Map<string, number>;
	tps: Map<string, number>;
} {
	const root = (body ?? {}) as Record<string, unknown>;
	const rows = Array.isArray(root.data)
		? root.data
		: Array.isArray(body)
			? body
			: Object.values(root).filter((v) => v && typeof v === "object");
	const intelligence = new Map<string, number>();
	const tps = new Map<string, number>();

	for (const row of rows) {
		if (!row || typeof row !== "object") continue;
		const record = row as Record<string, unknown>;
		const name = String(record.name ?? record.slug ?? record.id ?? "");
		const slug = typeof record.slug === "string" ? record.slug : undefined;
		const keys = [
			normalizeKey(name),
			slug ? normalizeKey(slug) : "",
		].filter(Boolean);
		if (keys.length === 0) continue;

		const iq = findNumber(
			record,
			/intelligence.*index|intelligence_index/i,
		);
		if (iq !== null) {
			for (const k of keys)
				if (!intelligence.has(k)) intelligence.set(k, iq);
		}
		const speed = findNumber(
			record,
			/tokens?_?per_?second|output_tokens_per_second|(^|_)tps($|_)/i,
		);
		if (speed !== null) {
			for (const k of keys) if (!tps.has(k)) tps.set(k, speed);
		}
	}
	return { intelligence, tps };
}

/** Depth-first search for the first finite number under a matching key. */
function findNumber(value: unknown, pattern: RegExp): number | null {
	if (!value || typeof value !== "object") return null;
	for (const [key, child] of Object.entries(
		value as Record<string, unknown>,
	)) {
		if (
			typeof child === "number" &&
			Number.isFinite(child) &&
			pattern.test(key)
		) {
			return child;
		}
	}
	for (const child of Object.values(value as Record<string, unknown>)) {
		const found = findNumber(child, pattern);
		if (found !== null) return found;
	}
	return null;
}
