import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { extractNumericColumn, fetchText, parseTables } from "../html.ts";
import { normalizeKey } from "../normalize.ts";
import { loadAaApi, loadAaWeb } from "./artificialAnalysis.ts";

export type AbilitySource = "cc" | "aa" | "aa-web" | "file" | "url";

/** Benchmark data, keyed by canonical model key. */
export interface BenchData {
	intelligence: Map<string, number>;
	/** Output tokens per second, when the source publishes it. */
	tps: Map<string, number>;
}

export interface AbilityResult extends BenchData {
	label: string;
	/** Note about coverage limits, shown in the footer. */
	note?: string;
}

export interface AbilityOptions {
	source: string;
	key?: string;
	/** Only these model keys matter; fills outside the catalog are ignored. */
	keys?: Set<string>;
	/** Fill models the primary source misses from the other sources. */
	fallback?: boolean;
	refresh?: boolean;
}

const CC_REFERENCE_PAGES = [
	"https://commandcode.ai/docs/plans/goat",
	"https://commandcode.ai/docs/plans/pro",
];
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TPS_HEADER = /tok\s*\/?\s*s|tokens?\s*per\s*sec/i;

interface Resolved {
	scheme: AbilitySource;
	data: BenchData;
	label: string;
}

function emptyData(): BenchData {
	return { intelligence: new Map(), tps: new Map() };
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

async function loadCc(): Promise<BenchData> {
	// CommandCode only publishes Intelligence and Tok/s on the GOAT/Pro catalogs.
	const pages = await Promise.all(
		CC_REFERENCE_PAGES.map(async (url) =>
			parseTables(await fetchText(url)),
		),
	);
	const data = emptyData();
	for (const tables of pages) {
		for (const [key, score] of extractNumericColumn(
			tables,
			/intelligence/i,
		)) {
			if (!data.intelligence.has(key)) data.intelligence.set(key, score);
		}
		for (const [key, tps] of extractNumericColumn(tables, TPS_HEADER)) {
			if (!data.tps.has(key)) data.tps.set(key, tps);
		}
	}
	return data;
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
				data: await loadCc(),
				label: "CommandCode Intelligence",
			};
		case "aa-web": {
			const data = emptyData();
			data.intelligence = await loadAaWebCached(Boolean(opts.refresh));
			return {
				scheme: "aa-web",
				data,
				label: "Artificial Analysis (web, partial)",
			};
		}
		case "aa": {
			const key = opts.key ?? process.env.AA_API_KEY;
			if (!key) {
				throw new Error(
					"--bench aa needs a key: set AA_API_KEY or pass --bench-key",
				);
			}
			const data = await loadAaApi(key);
			if (data.intelligence.size === 0) {
				throw new Error(
					"Artificial Analysis returned no scores — check the API key and response shape",
				);
			}
			return {
				scheme: "aa",
				data,
				label: `Artificial Analysis (${data.intelligence.size} models, ${data.tps.size} speed)`,
			};
		}
		case "file":
			if (!arg) throw new Error("--bench file:<path> needs a path");
			return {
				scheme: "file",
				data: { intelligence: await loadFile(arg), tps: new Map() },
				label: `bench file ${arg}`,
			};
		case "url":
			if (!arg) throw new Error("--bench url:<url> needs a url");
			return {
				scheme: "url",
				data: { intelligence: await loadUrl(arg), tps: new Map() },
				label: `bench ${arg}`,
			};
		default:
			throw new Error(
				`unknown --bench "${opts.source}" (cc | aa | aa-web | file:<path> | url:<url>)`,
			);
	}
}

function merge(
	into: Map<string, number>,
	from: Map<string, number>,
	keys?: Set<string>,
): number {
	let added = 0;
	for (const [key, score] of from) {
		if (keys && !keys.has(key)) continue;
		if (!into.has(key)) {
			into.set(key, score);
			added++;
		}
	}
	return added;
}

function prune(map: Map<string, number>, keys?: Set<string>): void {
	if (!keys) return;
	for (const key of [...map.keys()]) {
		if (!keys.has(key)) map.delete(key);
	}
}

/**
 * Artificial Analysis as a gap filler: the full API when a key is available,
 * otherwise the keyless page scrape (partial).
 */
async function loadAaFallback(
	opts: AbilityOptions,
): Promise<{ data: BenchData; how: string }> {
	const key = opts.key ?? process.env.AA_API_KEY;
	if (key) {
		try {
			return { data: await loadAaApi(key), how: "AA API" };
		} catch {
			// fall through to the scrape
		}
	}
	const data = emptyData();
	data.intelligence = await loadAaWebCached(Boolean(opts.refresh));
	return { data, how: "AA web scrape" };
}

/**
 * Load benchmark scores. The chosen source leads; unless --no-fallback, any
 * model it misses is filled from the other sources (CommandCode, then
 * Artificial Analysis) so a model scored anywhere shows a value.
 */
export async function loadAbility(
	opts: AbilityOptions,
): Promise<AbilityResult> {
	const primary = await resolvePrimary(opts);
	// CommandCode and Artificial Analysis publish the same index, so when CC
	// leads there is nothing worth a second round-trip.
	if (!opts.fallback || primary.scheme === "cc") {
		return { ...primary.data, label: primary.label };
	}

	const fills: string[] = [];
	{
		const cc = await loadCc();
		const added =
			merge(primary.data.intelligence, cc.intelligence, opts.keys) +
			merge(primary.data.tps, cc.tps, opts.keys);
		if (added > 0) fills.push(`${added} values from CommandCode`);
	}
	if (primary.scheme !== "aa-web" && primary.scheme !== "aa") {
		const fallback = await loadAaFallback(opts);
		const added =
			merge(
				primary.data.intelligence,
				fallback.data.intelligence,
				opts.keys,
			) + merge(primary.data.tps, fallback.data.tps, opts.keys);
		if (added > 0) {
			fills.push(
				`${added} values from Artificial Analysis (${fallback.how})`,
			);
		}
	}

	prune(primary.data.intelligence, opts.keys);
	prune(primary.data.tps, opts.keys);

	return {
		...primary.data,
		label: primary.label,
		note: fills.length > 0 ? `filled ${fills.join(", ")}` : undefined,
	};
}
