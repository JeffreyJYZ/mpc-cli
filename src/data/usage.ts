import { readFileSync } from "node:fs";
import { normalizeKey } from "../keys.ts";
import { runCmduse } from "./cmduse.ts";
import { scanLogs } from "./logs.ts";

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
	return {
		entries: fromCmduse ?? scanLogs(since),
		label: fromCmduse ? "cmduse model --json" : "local session logs",
		window: label(window, since),
		account,
	};
}
