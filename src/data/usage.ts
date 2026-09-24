import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { normalizeKey } from "../keys.ts";
import { runCmduse } from "./cmduse.ts";
import { scanLogs } from "./logs.ts";
import { defaultOpencodeDb, readOpencodeDb } from "./opencodeDb.ts";

export interface UsageEntry {
	key: string;
	name: string;
	requests: number;
	tokensIn: number;
	cacheRead: number;
	cacheWrite: number;
	tokensOut: number;
	costUsd: number;
}

export interface AccountSummary {
	requests: number;
	cost: number;
	periodEnd?: string;
}

export interface UsageReportInput {
	entries: UsageEntry[];
	/** Where the numbers came from, for the header. */
	label: string;
	/** Window description, e.g. "period (since 2026-08-27)". */
	window: string;
	/** Account-level period totals, for the coverage cross-check. */
	account?: AccountSummary;
}

type CmduseModel = Omit<UsageEntry, "key" | "name"> & Record<string, number>;

function entryFrom(id: string, row: CmduseModel): UsageEntry {
	return {
		key: normalizeKey(id),
		name: id,
		requests: Number(row.requests ?? 0),
		tokensIn: Number(row.tokensIn ?? 0),
		cacheRead: Number(row.cacheRead ?? 0),
		cacheWrite: Number(row.cacheWrite ?? 0),
		tokensOut: Number(row.tokensOut ?? 0),
		costUsd: Number(row.costUsd ?? 0),
	};
}

/** Accepts the cmduse shape, `{entries: [...]}` or a bare array. */
export function parseUsage(text: string): UsageEntry[] {
	const body = JSON.parse(text) as unknown;
	const rows: UsageEntry[] = [];
	const push = (id: string, row: unknown): void => {
		if (!id || !row || typeof row !== "object") return;
		rows.push(entryFrom(id, row as CmduseModel));
	};
	if (Array.isArray(body)) {
		for (const row of body) {
			const record = (row ?? {}) as Record<string, unknown>;
			push(String(record.model ?? record.name ?? ""), record);
		}
		return rows;
	}
	const record = (body ?? {}) as Record<string, unknown>;
	if (record.models && typeof record.models === "object") {
		for (const [id, row] of Object.entries(record.models)) push(id, row);
		return rows;
	}
	if (Array.isArray(record.entries)) {
		for (const row of record.entries) {
			const item = (row ?? {}) as Record<string, unknown>;
			push(String(item.model ?? item.name ?? ""), row);
		}
	}
	return rows;
}

/** Best-effort account summary, used only for the coverage line. */
export async function accountSummary(): Promise<AccountSummary | undefined> {
	const result = await runCmduse(["-1", "--json", "-p"]);
	if (!result.ok) return undefined;
	try {
		const body = JSON.parse(result.stdout) as {
			summary?: { requests?: number; cost?: number };
			periodEnd?: string;
		};
		return {
			requests: Number(body.summary?.requests ?? 0),
			cost: Number(body.summary?.cost ?? 0),
			periodEnd: body.periodEnd,
		};
	} catch {
		return undefined;
	}
}

/**
 * Per-model usage from cmduse. Needs a cmduse that understands `--since`
 * (0.6.x with the window feature); returns null on an older build so the
 * caller can fall back to scanning the session logs itself.
 */
async function cmduseModel(since?: Date): Promise<UsageEntry[] | null> {
	const args = ["model", "--json"];
	if (since) args.push("--since", since.toISOString());
	const result = await runCmduse(args);
	if (!result.ok || !result.stdout.trim()) return null;
	try {
		return parseUsage(result.stdout);
	} catch {
		return null;
	}
}

export type UsageWindow = "period" | "all" | `${number}d`;

interface LogLine {
	ts?: string;
	model?: string;
	input?: number;
	cacheRead?: number;
	cacheWrite?: number;
	output?: number;
	costUsd?: number;
}

/** Default path the opencode provider plugin writes to. */
export function defaultUsageLog(): string {
	if (process.env.MPC_USAGE_LOG) return process.env.MPC_USAGE_LOG;
	const base = process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache");
	return join(base, "mpc", "usage.jsonl");
}

/**
 * Aggregate the provider plugin's per-request log. This is the complete
 * opencode-side mix — the account API has no per-model breakdown.
 */
export function readUsageLog(path: string, since?: Date): UsageEntry[] | null {
	let text: string;
	try {
		text = readFileSync(path, "utf8");
	} catch {
		return null;
	}
	const byKey = new Map<string, UsageEntry>();
	for (const raw of text.split("\n")) {
		if (!raw.trim()) continue;
		let line: LogLine;
		try {
			line = JSON.parse(raw) as LogLine;
		} catch {
			continue;
		}
		if (!line.model) continue;
		if (since && line.ts && new Date(line.ts) < since) continue;
		const key = normalizeKey(line.model);
		const entry = byKey.get(key) ?? {
			key,
			name: line.model,
			requests: 0,
			tokensIn: 0,
			cacheRead: 0,
			cacheWrite: 0,
			tokensOut: 0,
			costUsd: 0,
		};
		entry.requests += 1;
		entry.tokensIn += line.input ?? 0;
		entry.cacheRead += line.cacheRead ?? 0;
		entry.cacheWrite += line.cacheWrite ?? 0;
		entry.tokensOut += line.output ?? 0;
		entry.costUsd += line.costUsd ?? 0;
		byKey.set(key, entry);
	}
	return [...byKey.values()];
}

/** Sum two usage lists by model key. */
export function mergeUsage(a: UsageEntry[], b: UsageEntry[]): UsageEntry[] {
	const byKey = new Map(a.map((entry) => [entry.key, { ...entry }]));
	for (const entry of b) {
		const existing = byKey.get(entry.key);
		if (!existing) {
			byKey.set(entry.key, { ...entry });
			continue;
		}
		existing.requests += entry.requests;
		existing.tokensIn += entry.tokensIn;
		existing.cacheRead += entry.cacheRead;
		existing.cacheWrite += entry.cacheWrite;
		existing.tokensOut += entry.tokensOut;
		existing.costUsd += entry.costUsd;
	}
	return [...byKey.values()];
}

function sinceFor(
	window: UsageWindow,
	account?: AccountSummary,
): Date | undefined {
	if (window === "all") return undefined;
	if (window.endsWith("d")) {
		const days = Number(window.slice(0, -1));
		if (Number.isFinite(days) && days > 0) {
			return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
		}
	}
	if (account?.periodEnd) {
		const end = new Date(account.periodEnd);
		const start = new Date(end);
		start.setMonth(start.getMonth() - 1);
		return start;
	}
	return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
}

function label(window: UsageWindow, since?: Date): string {
	if (window === "all") return "all local logs";
	if (!since) return window;
	return `${window} (since ${since.toISOString().slice(0, 10)})`;
}

/** Load the user's real per-model usage for a window. No network. */
export async function loadUsage(
	source: string | undefined,
	window: UsageWindow = "period",
	logPath?: string,
	dbPath?: string,
): Promise<UsageReportInput> {
	if (source) {
		const file = Bun.file(source);
		if (!(await file.exists()))
			throw new Error(`usage file not found: ${source}`);
		return {
			entries: parseUsage(await file.text()),
			label: source,
			window: "file",
		};
	}
	const account = await accountSummary();
	const since = sinceFor(window, account);
	const fromCmduse = await cmduseModel(since);
	const sessions = fromCmduse ?? scanLogs(since);

	// opencode's own store is complete and backfilled for every provider it
	// ran, so it supersedes the provider plugin's log (a subset of it).
	const db = readOpencodeDb(dbPath ?? defaultOpencodeDb(), since);
	const log = db ? null : readUsageLog(logPath ?? defaultUsageLog(), since);

	const sources: string[] = [];
	if (db) {
		sources.push(
			`opencode db (${db.providers.length} providers, ${db.records} records)`,
		);
	}
	if (log) sources.push("provider usage log");
	if (sessions.length > 0) {
		sources.push(fromCmduse ? "cmduse model --json" : "local session logs");
	}

	const entries = mergeUsage(
		mergeUsage(db?.entries ?? [], log ?? []),
		sessions,
	);
	return {
		entries,
		label: sources.join(" + ") || "no usage found",
		window: label(window, since),
		account,
	};
}
