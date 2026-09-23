import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { extractNumericColumn, fetchText, parseTables } from "../html.ts";
import { normalizeKey } from "../normalize.ts";
import { loadAaApi, loadAaWeb } from "./artificialAnalysis.ts";

export type AbilitySource = "cc" | "aa" | "aa-web" | "file" | "url";

export interface AbilityResult {
	scores: Map<string, number>;
	label: string;
	/** Note about coverage limits, shown in the footer. */
	note?: string;
}

export interface AbilityOptions {
	source: string;
	key?: string;
	/** Fill models the primary source misses from the other sources. */
	fallback?: boolean;
	refresh?: boolean;
}

const CC_REFERENCE_PAGE = "https://commandcode.ai/docs/plans/goat";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface Resolved {
	scheme: AbilitySource;
	scores: Map<string, number>;
	label: string;
}

function cachePath(): string {
	const base = process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache");
	return join(base, "mpc", "ability-aa-web.json");
}

async function loadCachedAaWeb(
	refresh: boolean,
): Promise<Map<string, number> | null> {
	if (refresh) return null;
	try {
		const file = Bun.file(cachePath());
		if (!(await file.exists())) return null;
		const raw = (await file.json()) as {
			fetchedAt?: number;
			scores?: Record<string, number>;
		};
		if (!raw.fetchedAt || Date.now() - raw.fetchedAt > CACHE_TTL_MS)
			return null;
		return new Map(Object.entries(raw.scores ?? {}));
	} catch {
		return null;
	}
}

async function saveAaWebCache(scores: Map<string, number>): Promise<void> {
	try {
		const path = cachePath();
		await mkdir(join(path, ".."), { recursive: true });
		await Bun.write(
			path,
			JSON.stringify({
				fetchedAt: Date.now(),
				scores: Object.fromEntries(scores),
			}),
		);
	} catch {
		// Cache is best-effort.
	}
}

async function loadAaWebCached(refresh: boolean): Promise<Map<string, number>> {
	const cached = await loadCachedAaWeb(refresh);
	if (cached) return cached;
	const scores = await loadAaWeb();
	await saveAaWebCache(scores);
	return scores;
}

async function loadCc(): Promise<Map<string, number>> {
	const tables = await parseTables(await fetchText(CC_REFERENCE_PAGE));
	return extractNumericColumn(tables, /intelligence/i);
}

function parseJsonScores(text: string): Map<string, number> {
	const body = JSON.parse(text) as unknown;
	const scores = new Map<string, number>();
	const add = (name: unknown, score: unknown): void => {
		const key = typeof name === "string" ? normalizeKey(name) : "";
		const value = Number(score);
		if (key && Number.isFinite(value)) scores.set(key, value);
	};
	if (Array.isArray(body)) {
		for (const row of body) {
			const record = (row ?? {}) as Record<string, unknown>;
			add(record.model ?? record.name, record.score ?? record.value);
		}
	} else if (body && typeof body === "object") {
		for (const [name, score] of Object.entries(
			body as Record<string, unknown>,
		)) {
			add(name, score);
		}
	}
	return scores;
}

async function loadFile(path: string): Promise<Map<string, number>> {
	const file = Bun.file(path);
	if (!(await file.exists()))
		throw new Error(`bench file not found: ${path}`);
	return parseJsonScores(await file.text());
}

async function loadUrl(url: string): Promise<Map<string, number>> {
	return parseJsonScores(await fetchText(url));
}

/** Load the requested source. */
async function resolvePrimary(opts: AbilityOptions): Promise<Resolved> {
	const [scheme, arg] = opts.source.includes(":")
		? [
				opts.source.split(":")[0] ?? "",
				opts.source.slice(opts.source.indexOf(":") + 1),
			]
		: [opts.source, undefined];

	switch (scheme) {
		case "cc":
			return {
				scheme: "cc",
				scores: await loadCc(),
				label: "Command Code Intelligence",
			};
		case "aa-web":
			return {
				scheme: "aa-web",
				scores: await loadAaWebCached(Boolean(opts.refresh)),
				label: "Artificial Analysis (web, partial)",
			};
		case "aa": {
			const key = opts.key ?? process.env.AA_API_KEY;
			if (!key) {
				throw new Error(
					"--bench aa needs a key: set AA_API_KEY or pass --bench-key",
				);
			}
			const scores = await loadAaApi(key);
			if (scores.size === 0) {
				throw new Error(
					"Artificial Analysis returned no scores — check the API key and response shape",
				);
			}
			return {
				scheme: "aa",
				scores,
				label: `Artificial Analysis (${scores.size} models)`,
			};
		}
		case "file":
			if (!arg) throw new Error("--bench file:<path> needs a path");
			return {
				scheme: "file",
				scores: await loadFile(arg),
				label: `bench file ${arg}`,
			};
		case "url":
			if (!arg) throw new Error("--bench url:<url> needs a url");
			return {
				scheme: "url",
				scores: await loadUrl(arg),
				label: `bench ${arg}`,
			};
		default:
			throw new Error(
				`unknown --bench "${opts.source}" (cc | aa | aa-web | file:<path> | url:<url>)`,
			);
	}
}

function merge(into: Map<string, number>, from: Map<string, number>): number {
	let added = 0;
	for (const [key, score] of from) {
		if (!into.has(key)) {
			into.set(key, score);
			added++;
		}
	}
	return added;
}

/**
 * Load benchmark scores. The chosen source leads; unless --no-fallback, any
 * model it misses is filled from the other sources (Command Code, then the
 * keyless Artificial Analysis scrape) so a model scored anywhere shows a value.
 */
export async function loadAbility(
	opts: AbilityOptions,
): Promise<AbilityResult> {
	const primary = await resolvePrimary(opts);
	if (!opts.fallback) {
		return { scores: primary.scores, label: primary.label };
	}

	const fills: string[] = [];
	if (primary.scheme !== "cc") {
		const added = merge(primary.scores, await loadCc());
		if (added > 0) fills.push(`${added} from Command Code`);
	}
	if (primary.scheme !== "aa-web" && primary.scheme !== "aa") {
		const added = merge(
			primary.scores,
			await loadAaWebCached(Boolean(opts.refresh)),
		);
		if (added > 0) fills.push(`${added} from Artificial Analysis`);
	}

	return {
		scores: primary.scores,
		label: primary.label,
		note: fills.length > 0 ? `filled ${fills.join(", ")}` : undefined,
	};
}
