import { loadAbility } from "../../data/bench/index.ts";
import { loadCcCatalog } from "../../data/sources/cc/catalog.ts";
import { loadCcPlan } from "../../data/sources/cc/plans.ts";
import { loadOcGoCatalog, ocGoPlan } from "../../data/sources/opencode.ts";
import { buildRows } from "../engine/index.ts";
import type { Options } from "../options.ts";

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
		options.benchWeight,
		ability.tps,
		options.tpsWeight,
	);
	return { ocEntries, ccEntries, ocPlanInfo, ccPlanInfo, rows, ability };
}
