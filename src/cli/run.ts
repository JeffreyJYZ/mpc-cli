#!/usr/bin/env bun
import { loadUsage } from "../data/usage.ts";
import { renderUsage } from "../view/layout/usage.ts";
import {
	COLUMN_IDS,
	DEFAULT_COLUMNS,
	DETAIL_COLUMNS,
	fitColumns,
	renderCsv,
	renderJson,
	renderMarkdown,
	renderText,
	setColorMode,
	setThresholds,
	tally,
} from "../view/render.ts";
import { describeConfig, resolveBag } from "./config.ts";
import { project } from "./engine/project.ts";
import { runCheck } from "./flow/check.ts";
import { collect } from "./flow/collect.ts";
import { matches, sortRows } from "./flow/sort.ts";
import { COLUMN_HELP } from "./options.ts";
import { type Bag, toOptions } from "./parse/map.ts";

export type { Metric, Options } from "./options.ts";
export { parseArgs } from "./parse/cac.ts";

function columnIds(bag: Bag, options: ReturnType<typeof toOptions>): string[] {
	const presets = (bag.presets ?? {}) as Record<string, unknown>;
	const named = options.preset ? presets[options.preset] : undefined;
	if (options.columns) return options.columns;
	if (named) {
		return Array.isArray(named)
			? named.map(String)
			: String(named)
					.split(",")
					.map((id) => id.trim())
					.filter(Boolean);
	}
	if (options.preset) throw new Error(`unknown preset "${options.preset}"`);
	return options.detail || options.fit ? DETAIL_COLUMNS : DEFAULT_COLUMNS;
}

export async function run(argv: string[]): Promise<number> {
	const bag = await resolveBag(argv);
	if (bag.printConfig === true) {
		process.stdout.write(describeConfig(bag));
		return 0;
	}
	const options = toOptions(bag);
	if (options.columns?.includes("help")) {
		console.log(COLUMN_HELP);
		return 0;
	}

	setColorMode(options.colorMode);
	setThresholds(options.costThresholds, options.valThresholds);

	const requested = columnIds(bag, options);
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

	if (options.usage) {
		const usage = await loadUsage(
			options.usageFile,
			options.usageWindow,
			options.usageLog,
		);
		const projection = project(
			usage.entries,
			{ "oc-go": ocEntries, cc: ccEntries },
			{ "oc-go": ocPlanInfo, cc: ccPlanInfo },
			{ months: options.usageMonths },
		);
		if (options.format === "json" || options.json) {
			console.log(
				JSON.stringify({ source: usage.label, ...projection }, null, 2),
			);
			return 0;
		}
		renderUsage(projection, {
			label: usage.label,
			window: usage.window,
			account: usage.account,
			months: options.usageMonths,
			plans: { "oc-go": ocPlanInfo, cc: ccPlanInfo },
		});
		return 0;
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
		window: options.window,
	};

	if (options.format === "json" || options.json) {
		console.log(renderJson(result, meta));
		return 0;
	}
	if (options.format === "csv") {
		process.stdout.write(renderCsv(result, tally(result)));
		return 0;
	}
	if (options.format === "md") {
		process.stdout.write(renderMarkdown(result, [ocPlanInfo, ccPlanInfo]));
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
