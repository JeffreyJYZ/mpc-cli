import type { Workload } from "~/types.ts";
import { runBinary } from "./cmduse.ts";

interface Profile {
	input?: number;
	cacheRead?: number;
	output?: number;
	reasoning?: number;
	cacheWrite?: number;
}

/** reqshape to shell out to; override to test a dev build. */
function reqshapeBin(): string {
	return process.env.REQSHAPE_BIN || "reqshape";
}

function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function round(value: number | undefined): number {
	return Math.round(typeof value === "number" ? value : 0);
}

/**
 * The one measured per-req profile, as a Workload. reqshape emits it top-level
 * (`profile` — the vector its own projections were priced against) and as
 * `shape.perReq`; either works, and a payload with neither yields nothing
 * rather than throwing. This is one shape for *both* plans, so the comparison
 * isolates price and allowance from which traffic went where.
 */
export function workloadOf(json: string): Workload | undefined {
	const parsed = JSON.parse(json) as {
		profile?: Profile;
		shape?: { perReq?: Profile };
	};
	const profile = parsed.profile ?? parsed.shape?.perReq;
	if (!profile) return undefined;
	// Means are fractional; a token count is not, and rounding here keeps the
	// footer and the priced workload showing the same numbers.
	return {
		input: round(profile.input),
		cacheRead: round(profile.cacheRead),
		output: round(profile.output),
		reasoning: round(profile.reasoning),
		cacheWrite: round(profile.cacheWrite),
	};
}

async function payloadOf(spec: string, args: string[]): Promise<string | null> {
	if (spec !== "measured") {
		try {
			return await Bun.file(spec).text();
		} catch (error) {
			process.stderr.write(
				`mpc: cannot read shape file "${spec}": ${message(error)}; using the fixed workload\n`,
			);
			return null;
		}
	}
	const result = await runBinary(reqshapeBin(), args);
	if (!result.ok || !result.stdout.trim()) {
		process.stderr.write(
			`mpc: reqshape unavailable: ${result.stderr.trim() || "no output"}; using the fixed workload\n`,
		);
		return null;
	}
	return result.stdout;
}

/**
 * Resolve `--shape`: `off` keeps the documented fixed workload, `measured`
 * asks reqshape for its combined per-req profile, anything else is a saved
 * reqshape JSON to read. Never throws — a missing binary or a bad payload
 * degrades to `off` with a warning, because a silently empty report is worse
 * than a slower one.
 */
export async function loadShapes(
	spec: string,
	since?: string,
): Promise<Workload | undefined> {
	const trimmed = spec.trim();
	if (trimmed === "" || trimmed === "off") return undefined;
	const args = ["--format", "json"];
	if (since) args.push("--since", since);
	const payload = await payloadOf(trimmed, args);
	if (!payload) return undefined;
	try {
		const workload = workloadOf(payload);
		if (!workload)
			throw new Error("this reqshape reports no measured profile");
		return workload;
	} catch (error) {
		process.stderr.write(
			`mpc: unreadable shape payload: ${message(error)}; using the fixed workload\n`,
		);
		return undefined;
	}
}
