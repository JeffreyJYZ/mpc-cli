import { Database } from "bun:sqlite";
import { homedir } from "node:os";
import { join } from "node:path";
import { normalizeKey } from "../keys.ts";
import type { UsageEntry } from "./usage.ts";

/** Default location of opencode's message store. */
export function defaultOpencodeDb(): string {
	if (process.env.OPENCODE_DB) return process.env.OPENCODE_DB;
	const base =
		process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share");
	return join(base, "opencode", "opencode.db");
}

interface AssistantData {
	role?: string;
	cost?: number;
	modelID?: string;
	providerID?: string;
	tokens?: {
		input?: number;
		output?: number;
		cache?: { read?: number; write?: number };
	};
	time?: { created?: number; completed?: number };
}

function numberOr(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export interface OpencodeDbUsage {
	entries: UsageEntry[];
	/** Providers seen, for the report's source line. */
	providers: string[];
	/** Total assistant records scanned, before de-duplication. */
	records: number;
}

/**
 * Aggregate per-model usage from opencode's own message store. This is the
 * complete, backfilled record for every provider opencode ran — unlike the
 * provider plugin's log, which only sees its own traffic.
 *
 * Read-only so a running opencode is unaffected; returns null when the DB or
 * the `message` table is missing.
 */
export function readOpencodeDb(
	path: string,
	since?: Date,
): OpencodeDbUsage | null {
	let db: Database;
	try {
		db = new Database(path, { readonly: true });
	} catch {
		return null;
	}
	try {
		const rows = db
			.query(
				`SELECT data, time_created FROM message
				 WHERE data LIKE '%"tokens"%' AND time_created >= ?`,
			)
			.all(since ? since.getTime() : 0) as Array<{
			data: string;
			time_created: number;
		}>;

		const byKey = new Map<string, UsageEntry>();
		const seen = new Set<string>();
		const providers = new Set<string>();
		for (const row of rows) {
			let data: AssistantData;
			try {
				data = JSON.parse(row.data) as AssistantData;
			} catch {
				continue;
			}
			if (data.role !== "assistant" || !data.modelID || !data.tokens)
				continue;
			const id = `${data.modelID}@${row.time_created}`;
			if (seen.has(id)) continue; // message rows can be rewritten in place
			seen.add(id);
			const provider = data.providerID ?? "unknown";
			providers.add(provider);

			const key = normalizeKey(data.modelID);
			const entry = byKey.get(key) ?? {
				key,
				name: data.modelID,
				requests: 0,
				tokensIn: 0,
				cacheRead: 0,
				cacheWrite: 0,
				tokensOut: 0,
				costUsd: 0,
			};
			entry.requests += 1;
			entry.tokensIn += numberOr(data.tokens.input);
			entry.cacheRead += numberOr(data.tokens.cache?.read);
			entry.cacheWrite += numberOr(data.tokens.cache?.write);
			entry.tokensOut += numberOr(data.tokens.output);
			entry.costUsd += numberOr(data.cost);
			byKey.set(key, entry);
		}
		return {
			entries: [...byKey.values()],
			providers: [...providers],
			records: rows.length,
		};
	} catch {
		return null;
	} finally {
		db.close();
	}
}
