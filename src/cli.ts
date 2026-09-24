#!/usr/bin/env bun
import { runCheck } from "./cli/check.ts";
import { collect } from "./cli/collect.ts";
import { COLUMN_HELP } from "./cli/help.ts";
import { parseArgs } from "./cli/parser.ts";
import { matches, sortRows } from "./cli/sort.ts";
import {
	COLUMN_IDS,
	DEFAULT_COLUMNS,
	DETAIL_COLUMNS,
	fitColumns,
	renderJson,
	renderText,
	setColor,
} from "./render.ts";

export type { Metric, Options } from "./cli/args.ts";
export { parseArgs } from "./cli/parser.ts";

export async function run(argv: string[]): Promise<number> {
	const options = parseArgs(argv);
	if (options.columns?.includes("help")) {
		console.log(COLUMN_HELP);
		return 0;
	}

	setColor(
		!options.noColor &&
			Boolean(process.stdout.isTTY) &&
			!process.env.NO_COLOR,
	);

	const requested =
		options.columns ??
		(options.detail || options.fit ? DETAIL_COLUMNS : DEFAULT_COLUMNS);
	const unknown = requested.filter((id) => !COLUMN_IDS.includes(id));
	if (unknown.length > 0) {
		throw new Error(
			`unknown column(s): ${unknown.join(", ")} — valid: ${COLUMN_IDS.join(", ")}`,
		);
	}

	const { ocEntries, ccEntries, ocPlanInfo, ccPlanInfo, rows, ability } =
		await collect(options);

	if (options.check) {
		return runCheck(options, ocEntries, ccEntries, rows, ability);
	}

	const result = sortRows(
		rows.filter(
			(r) =>
				matches(r, options.model) &&
				(options.only === "all" || (r.oc && r.cc)),
		),
		options.metric,
		options.asc,
	);

	const meta = {
		ocPlan: ocPlanInfo,
		ccPlan: ccPlanInfo,
		workload: options.workload,
		abilityLabel: options.noAbility
			? undefined
			: (options.benchName ?? ability.label),
		abilityNote: options.noAbility ? undefined : ability.note,
	};
	if (options.json) {
		console.log(renderJson(result, meta));
		return 0;
	}

	const limit = options.width ?? process.stdout.columns ?? 120;
	const fitted =
		options.fit && !options.columns
			? fitColumns(result, requested, limit)
			: { ids: requested, dropped: [] as string[] };
	renderText(result, meta, fitted.ids, fitted.dropped);
	console.log(
		`\n${result.length} models · OpenCode Go vs CommandCode ${ccPlanInfo.label} · ${ocEntries.length} OpenCode / ${ccEntries.length} CommandCode entries`,
	);
	return 0;
}
