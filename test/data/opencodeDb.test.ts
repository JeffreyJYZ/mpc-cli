import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readOpencodeDb } from "../../src/data/opencodeDb.ts";

function dbWith(
	rows: Array<{ id: string; created: number; data: unknown }>,
): string {
	const path = join(mkdtempSync(join(tmpdir(), "mpc-db-")), "opencode.db");
	const db = new Database(path);
	db.run(
		"CREATE TABLE message (id text primary key, session_id text, time_created integer, time_updated integer, data text)",
	);
	const insert = db.prepare(
		"INSERT INTO message (id, session_id, time_created, time_updated, data) VALUES (?, 'ses_1', ?, ?, ?)",
	);
	for (const row of rows) {
		insert.run(row.id, row.created, row.created, JSON.stringify(row.data));
	}
	db.close();
	return path;
}

const assistant = (id: string, model: string, created: number, cost = 0.5) => ({
	id,
	created,
	data: {
		role: "assistant",
		modelID: model,
		providerID: "command-code-openai",
		cost,
		tokens: { input: 100, output: 50, cache: { read: 2000, write: 0 } },
		time: { created, completed: created + 1000 },
	},
});

describe("readOpencodeDb", () => {
	test("aggregates assistant messages per model, honouring the window", () => {
		const path = dbWith([
			assistant(
				"m1",
				"deepseek/deepseek-v4.1-flash",
				1_780_000_000_000,
				0.25,
			),
			assistant(
				"m2",
				"deepseek/deepseek-v4.1-flash",
				1_780_000_100_000,
				0.25,
			),
			assistant("m3", "z-ai/glm-5.3-flash", 1_600_000_000_000),
		]);
		const all = readOpencodeDb(path);
		expect(all?.records).toBe(3);
		expect(all?.providers).toEqual(["command-code-openai"]);
		const recent = readOpencodeDb(path, new Date(1_770_000_000_000));
		expect(recent?.entries).toHaveLength(1);
		const flash = recent?.entries[0];
		expect(flash?.key).toBe("deepseekv41flash");
		expect(flash?.requests).toBe(2);
		expect(flash?.costUsd).toBeCloseTo(0.5, 6);
		expect(flash?.tokensIn).toBe(200);
		expect(flash?.cacheRead).toBe(4000);
	});

	test("returns null for a missing file or table", () => {
		expect(readOpencodeDb("/nonexistent/opencode.db")).toBeNull();
		const empty = join(mkdtempSync(join(tmpdir(), "mpc-db-")), "empty.db");
		expect(readOpencodeDb(empty)).toBeNull();
	});
});
