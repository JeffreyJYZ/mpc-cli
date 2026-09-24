import { loadAbility } from "../../data/bench/index.ts";
import { loadCcCatalog } from "../../data/sources/cc/catalog.ts";
import { loadCcPlan } from "../../data/sources/cc/plans.ts";
import { loadOcGoCatalog, ocGoPlan } from "../../data/sources/opencode.ts";
import { buildRows } from "../engine/index.ts";
import type { ScoreConfig } from "../engine/score.ts";
import type { Options } from "../options.ts";

function scoreConfig(options: Options): ScoreConfig {
	return {
		abilityWeight: options.benchWeight,
		tpsWeight: options.tpsWeight,
		idxWeights: options.idxWeights,
		valWeights: options.valWeights,
		scale: options.scale,
		inheritSuffixes: options.inheritSuffixes,
		window: options.window,
	};
}

export async function collect(options: Options) {
	const [ocEntries, ccEntries, ccPlanInfo] = await Promise.all([
		loadOcGoCatalog(options.peak),
		loadCcCatalog(options.ccPlan),
		loadCcPlan(options.ccPlan),
	]);
	// Ability is loaded after the catalogs so fills can be limited to our rows.
	const keys = new Set(
		[...ocEntries, ...ccEntries].map((entry) => entry.key),
	);
	const ability = options.noAbility
		? {
				intelligence: new Map<string, number>(),
				tps: new Map<string, number>(),
				label: "",
				note: undefined as string | undefined,
			}
		: await loadAbility({
				source: options.bench,
				key: options.benchKey,
				keys,
				fallback: !options.noFallback,
				refresh: options.refresh,
			});
	const ocPlanInfo = ocGoPlan(ocEntries);
	const rows = buildRows(
		ocEntries,
		ccEntries,
		ocPlanInfo,
		ccPlanInfo,
		options.workload,
		ability.intelligence,
		ability.tps,
		scoreConfig(options),
	);
	return { ocEntries, ccEntries, ocPlanInfo, ccPlanInfo, rows, ability };
}
