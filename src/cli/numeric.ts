import { DEFAULTS, type Options } from "./args.ts";

export interface Cursor {
	flag: string;
	next: () => string | undefined;
}

function parseIntFlag(name: string, value: string | undefined): number {
	const n = Number(value);
	if (value === undefined || !Number.isFinite(n) || n < 0) {
		throw new Error(
			`--${name} expects a non-negative number, got "${value}"`,
		);
	}
	return n;
}

function ratio(next: () => string | undefined, flag: string): number {
	const value = Number(next());
	if (!Number.isFinite(value) || value < 0 || value > 1) {
		throw new Error(`--${flag} expects a number between 0 and 1`);
	}
	return value;
}

const WORKLOAD_FLAGS: Record<string, (o: Options, v: number) => void> = {
	"--in": (o, v) => {
		o.workload.input = v;
	},
	"--cache": (o, v) => {
		o.workload.cacheRead = v;
	},
	"--out": (o, v) => {
		o.workload.output = v;
	},
};

/** Workload, width and weight flags. */
export function applyNumericFlag(o: Options, { flag, next }: Cursor): boolean {
	const workload = WORKLOAD_FLAGS[flag];
	if (workload) {
		workload(o, parseIntFlag(flag.slice(2), next()));
		return true;
	}
	switch (flag) {
		case "--width":
			o.width = parseIntFlag("width", next());
			return true;
		case "--bench-weight":
			o.benchWeight = ratio(next, "bench-weight");
			return true;
		case "--tps-weight":
			o.tpsWeight = ratio(next, "tps-weight");
			return true;
		default:
			return false;
	}
}

export { DEFAULTS };
