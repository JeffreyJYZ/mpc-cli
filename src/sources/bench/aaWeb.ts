import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { loadAaWeb } from "../artificialAnalysis.ts";

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function cachePath(): string {
	const base = process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache");
	return join(base, "mpc", "ability-aa-web.json");
}

async function readCache(
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

async function writeCache(scores: Map<string, number>): Promise<void> {
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

/** Keyless AA page scrape, cached on disk. */
export async function loadAaWebCached(
	refresh: boolean,
): Promise<Map<string, number>> {
	const cached = await readCache(refresh);
	if (cached) return cached;
	const scores = await loadAaWeb();
	await writeCache(scores);
	return scores;
}
