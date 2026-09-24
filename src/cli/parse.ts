import { DEFAULTS, type Options } from "./args.ts";
import { applyFlag } from "./flags.ts";
import { applyNumericFlag } from "./numeric.ts";

export function parseArgs(argv: string[]): Options {
	const options: Options = {
		ccPlan: "goat",
		workload: { ...DEFAULTS },
		metric: "val",
		only: "all",
		fit: false,
		bench: "cc",
		benchWeight: 0.35,
		tpsWeight: 0.1,
		noFallback: false,
		refresh: false,
		noAbility: false,
		peak: false,
		asc: false,
		json: false,
		detail: false,
		noColor: false,
		check: false,
		help: false,
	};

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i] ?? "";
		const [flag, inline] = arg.split("=", 2);
		const next = (): string | undefined => inline ?? argv[++i];

		const cursor = { flag: flag ?? "", next };
		if (applyNumericFlag(options, cursor)) continue;
		if (!applyFlag(options, cursor))
			throw new Error(`unknown flag "${cursor.flag}"`);
	}
	return options;
}
