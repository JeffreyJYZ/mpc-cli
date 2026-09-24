import { type Options, parseMetric } from "./args.ts";
import type { Cursor } from "./numeric.ts";

function _parseIntFlag(name: string, value: string | undefined): number {
	const n = Number(value);
	if (value === undefined || !Number.isFinite(n) || n < 0) {
		throw new Error(
			`--${name} expects a non-negative number, got "${value}"`,
		);
	}
	return n;
}

function _ratio(next: () => string | undefined, flag: string): number {
	const value = Number(next());
	if (!Number.isFinite(value) || value < 0 || value > 1) {
		throw new Error(`--${flag} expects a number between 0 and 1`);
	}
	return value;
}

/** String and boolean flags plus validation. Returns when handled, throws when not. */
export function applyFlag(o: Options, { flag, next }: Cursor): boolean {
	switch (flag) {
		case "-h":
		case "--help":
			o.help = true;
			break;
		case "--cc-plan":
			o.ccPlan = next() ?? o.ccPlan;
			break;
		case "--metric":
			o.metric = parseMetric(next());
			break;
		case "--model":
			o.model = next();
			break;
		case "--fit":
			o.fit = true;
			break;
		case "--bench":
			o.bench = next() ?? o.bench;
			break;
		case "--bench-name":
			o.benchName = next();
			break;
		case "--bench-key":
			o.benchKey = next();
			break;
		case "--no-fallback":
			o.noFallback = true;
			break;
		case "--refresh":
			o.refresh = true;
			break;
		case "--no-ability":
			o.noAbility = true;
			break;
		case "--columns": {
			const value = next() ?? "";
			o.columns = value
				.split(",")
				.map((c) => c.trim())
				.filter(Boolean);
			break;
		}
		case "--only": {
			const value = next();
			if (value !== "both" && value !== "all") {
				throw new Error(
					`--only expects "both" or "all", got "${value}"`,
				);
			}
			o.only = value;
			break;
		}
		case "--peak":
			o.peak = true;
			break;
		case "--asc":
			o.asc = true;
			break;
		case "--json":
			o.json = true;
			break;
		case "--detail":
			o.detail = true;
			break;
		case "--no-color":
			o.noColor = true;
			break;
		case "--check":
			o.check = true;
			break;
		default:
			return false;
	}
	return true;
}
