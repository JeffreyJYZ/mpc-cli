export type Bag = Record<string, unknown>;

export function int(name: string, value: unknown): number {
	const n = Number(value);
	if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
		throw new Error(
			`--${name} expects a non-negative integer, got "${value}"`,
		);
	}
	return n;
}

export function share(name: string, value: unknown): number {
	const n = Number(value);
	if (!Number.isFinite(n) || n < 0 || n > 1) {
		throw new Error(`--${name} expects a number between 0 and 1`);
	}
	return n;
}

const INTERNAL = new Set(["--", "help", "version"]);

const KNOWN = new Set([
	"ccPlan",
	"in",
	"cache",
	"out",
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
