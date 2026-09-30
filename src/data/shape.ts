import type { Workload } from "~/types.ts";
import { runBinary } from "./cmduse.ts";

/**
 * One side of the comparison. `oc` prices OpenCode Go's rows, `cc` prices
 * CommandCode's — the store's provider ids split into exactly these two.
 */
export type Side = "oc" | "cc";

interface MeasuredSide {
	reqs: number;
	profile: Workload;
}

type Measured = Partial<Record<Side, MeasuredSide>>;

/** reqshape to shell out to; override to test a dev build. */
function reqshapeBin(): string {
	return process.env.REQSHAPE_BIN || "reqshape";
}

function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * reqshape's measured profile is a per-request token vector, which is exactly
 * a Workload, so each side gets priced on its own traffic. Sides it did not
 * measure come back absent and the caller falls back to the fixed workload.
 * An older reqshape without `sides` yields nothing rather than throwing.
 */
export function sidesOf(json: string): Partial<Record<Side, Workload>> {
	const parsed = JSON.parse(json) as { sides?: Measured };
	const sides = parsed.sides ?? {};
	const out: Partial<Record<Side, Workload>> = {};
	for (const side of ["oc", "cc"] as const) {
		const profile = sides[side]?.profile;
		// Means are fractional; a token count is not, and rounding here keeps
		// the footer and the priced workload showing the same numbers.
		if (profile) {
			out[side] = {
				input: Math.round(profile.input),
				cacheRead: Math.round(profile.cacheRead),
				output: Math.round(profile.output),
				reasoning: Math.round(profile.reasoning),
				cacheWrite: Math.round(profile.cacheWrite),
			};
		}
	}
	return out;
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
 * asks reqshape for one profile per side, anything else is a saved reqshape
 * JSON to read. Never throws — a missing binary or a bad payload degrades to
 * `off` with a warning, because a silently empty report is worse than a
 * slower one.
 */
export async function loadShapes(
	spec: string,
	since?: string,
): Promise<Partial<Record<Side, Workload>>> {
	const trimmed = spec.trim();
	if (trimmed === "" || trimmed === "off") return {};
	const args = ["--format", "json"];
	if (since) args.push("--since", since);
	const payload = await payloadOf(trimmed, args);
	if (!payload) return {};
	try {
		const sides = sidesOf(payload);
		if (Object.keys(sides).length === 0) {
			throw new Error("this reqshape reports no per-side profiles");
		}
		return sides;
	} catch (error) {
		process.stderr.write(
			`mpc: unreadable shape payload: ${message(error)}; using the fixed workload\n`,
		);
		return {};
	}
}
