import { cac } from "cac";
import pkg from "../../../package.json" with { type: "json" };
import { DEFAULTS, type Options } from "../options.ts";
import { type Bag, toOptions } from "./map.ts";

export function parseArgs(argv: string[]): Options {
	const cli = cac("mpc");
	cli.option(
		"--cc-plan <id>",
		"CommandCode plan: go, goat, pro, max10, max20",
		{
			default: "goat",
		},
	)
		.option("--in <n>", "input tokens per request", {
			default: DEFAULTS.input,
		})
		.option("--cache <n>", "cache-read tokens per request", {
			default: DEFAULTS.cacheRead,
		})
		.option("--out <n>", "output tokens per request", {
			default: DEFAULTS.output,
		})
		.option("--metric <name>", "val | cost | perreq | req | name", {
			default: "val",
		})
		.option("--model <re>", "only rows whose name matches")
		.option("--only <scope>", "both | all", { default: "all" })
		.option("--fit", "widest column set that fits the terminal")
		.option("--detail", "every column, untrimmed")
		.option("--width <n>", "force table width")
		.option(
			"--columns <ids>",
			"comma-separated columns (--columns help to list)",
		)
		.option("--bench <src>", "cc | aa | aa-web | file:<path> | url:<url>", {
			default: "cc",
		})
		.option("--bench-weight <n>", "ability share of VAL", { default: 0.35 })
		.option("--tps-weight <n>", "speed share of VAL", { default: 0.1 })
		.option("--bench-name <label>", "footer label for the source")
		.option(
			"--bench-key <key>",
			"Artificial Analysis key (else AA_API_KEY)",
		)
		.option("--no-fallback", "do not fill misses from other sources")
		.option("--refresh", "ignore the aa-web cache")
		.option("--no-ability", "hide ability and VAL")
		.option("--peak", "peak-rate rows (OpenCode DeepSeek)")
		.option("--asc", "flip the default sort direction")
		.option("--json", "machine-readable output")
		.option("--no-color", "disable ANSI colour")
		.option("--check", "validate live sources and exit");
	cli.example("mpc --fit");
	cli.example("mpc --cc-plan pro --metric perreq");
	cli.help();
	cli.version(pkg.version);
	const parsed = cli.parse(["node", "mpc", ...argv], { run: false });
	return toOptions((parsed.options ?? {}) as Bag);
}
