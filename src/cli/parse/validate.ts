export type Bag = Record<string, unknown>;

// `Number("")` is 0 and `Number(true)` is 1, so a blank or bare flag would be
// coerced into a plausible-looking value (`--out ""` silently priced every model
// with zero output tokens, `--width ""` became 0 and disabled trimming). Reject
// both shapes before the conversion; a bare boolean is also caught by
// `assertValues`, but config/plugin layers reach here without that guard.
export function int(name: string, value: unknown, min = 0): number {
	const want = min === 0 ? "a non-negative integer" : `an integer ≥ ${min}`;
	if (value === true || value === "" || Number(value) < min) {
		throw new Error(`--${name} expects ${want}, got "${value}"`);
	}
	const n = Number(value);
	if (!Number.isFinite(n) || !Number.isInteger(n)) {
		throw new Error(`--${name} expects ${want}, got "${value}"`);
	}
	return n;
}

export function share(name: string, value: unknown): number {
	if (value === true || value === "") {
		throw new Error(`--${name} expects a number between 0 and 1`);
	}
	const n = Number(value);
	if (!Number.isFinite(n) || n < 0 || n > 1) {
		throw new Error(`--${name} expects a number between 0 and 1`);
	}
	return n;
}

// cac registers `--help`/`--version` **and** their `-h`/`-v` aliases as separate
// keys, so all four must be tolerated here; `run` then returns before any work.
const INTERNAL = new Set(["--", "help", "h", "version", "v"]);

const KNOWN = new Set([
	"ccPlan",
	"in",
	"cache",
	"out",
	"reasoning",
	"cacheWrite",
	"shape",
	"since",
	"metric",
	"model",
	"only",
	"fit",
	"bench",
	"benchWeight",
	"tpsWeight",
	"benchName",
	"aaKey",
	"fallback",
	"refresh",
	"ability",
	"peak",
	"asc",
	"json",
	"detail",
	"minimal",
	"medium",
	"width",
	"columns",
	"color",
	"check",
	"config",
	"printConfig",
	"usage",
	"usageFile",
	"usageLog",
	"usageDb",
	"usageMonths",
	"usageWindow",
	"plugins",
	"plugin",
	"preset",
	"presets",
	"format",
	"scale",
	"idxWeights",
	"valWeights",
	"inheritSuffixes",
	"window",
	"costThresholds",
	"valThresholds",
]);

/** Reject undeclared flags before mapping. */
export function assertKnown(bag: Bag): void {
	const extra = Object.keys(bag).filter(
		(key) => !KNOWN.has(key) && !INTERNAL.has(key),
	);
	if (extra.length > 0) {
		throw new Error(
			`unknown flag "--${extra[0]}" — see --help for the full list`,
		);
	}
}

/**
 * Flags cac declares with a required value (`--x <v>`). Given without one, cac
 * yields the boolean `true`, which `String(...)` would quietly turn into the
 * literal "true" and be used as the value.
 *
 * Two are deliberately absent: `config` (`--no-config` makes `true` its
 * *default*, so a bare `--config` cannot be told from "use the default path")
 * and `shape` (a bare `--shape` means `measured`, handled in `map.ts`).
 */
const VALUED = new Set([
	"ccPlan",
	"in",
	"cache",
	"out",
	"reasoning",
	"cacheWrite",
	"since",
	"metric",
	"model",
	"only",
	"width",
	"columns",
	"preset",
	"bench",
	"benchWeight",
	"tpsWeight",
	"valWeights",
	"idxWeights",
	"scale",
	"inheritSuffixes",
	"window",
	"costThresholds",
	"valThresholds",
	"benchName",
	"aaKey",
	"format",
	"color",
	"plugin",
	"usageFile",
	"usageWindow",
	"usageDb",
	"usageLog",
	"usageMonths",
]);

/** camelCase key -> the `--kebab-case` spelling the user typed. */
function flag(key: string): string {
	return `--${key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)}`;
}

/** Reject a value-taking flag used bare (`--shape` with no argument). */
export function assertValues(bag: Bag): void {
	const bare = Object.keys(bag).filter(
		(key) => VALUED.has(key) && bag[key] === true,
	);
	if (bare.length > 0) {
		throw new Error(
			`${flag(String(bare[0]))} expects a value — see --help`,
		);
	}
}
