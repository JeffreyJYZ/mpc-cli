import { normalizeKey } from "../keys.ts";

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

export interface UsageReportInput {
	entries: UsageEntry[];
	/** Where the numbers came from, for the header. */
	label: string;
}

interface CmduseModel {
	requests?: number;
	tokensIn?: number;
	cacheRead?: number;
	cacheWrite?: number;
	tokensOut?: number;
	costUsd?: number;
}

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
			push(String(item.model ?? item.name ?? ""), item);
		}
	}
	return rows;
}

async function fromCmduse(): Promise<UsageEntry[]> {
	let proc: Bun.Subprocess<"pipe", "pipe", "pipe">;
	try {
		proc = Bun.spawn(["cmduse", "model", "--json"], {
			stdout: "pipe",
			stderr: "pipe",
		});
	} catch {
		throw new Error(
			"`cmduse` not found on PATH — pass --usage-file instead of --usage",
		);
	}
	const [out, err, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	if (code !== 0) {
		throw new Error(`cmduse model --json failed (${code}): ${err.trim()}`);
	}
	return parseUsage(out);
}

/** Load the user's real per-model usage. No network by default. */
export async function loadUsage(source?: string): Promise<UsageReportInput> {
	if (source) {
		const file = Bun.file(source);
		if (!(await file.exists()))
			throw new Error(`usage file not found: ${source}`);
		return { entries: parseUsage(await file.text()), label: source };
	}
	return { entries: await fromCmduse(), label: "cmduse local logs" };
}
