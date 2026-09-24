import type {
	CatalogEntry,
	CompareRow,
	EntryMetrics,
	PlanInfo,
	ProviderId,
	Workload,
} from "../types.ts";
import { buildMetrics } from "./build.ts";

function indexByKey(
	entries: CatalogEntry[],
	metrics: EntryMetrics[],
): Map<string, EntryMetrics> {
	const byKey = new Map<string, EntryMetrics>();
	entries.forEach((entry, i) => {
		const metric = metrics[i];
		if (metric) byKey.set(entry.key, metric);
	});
	return byKey;
}

export function buildRows(
	ocEntries: CatalogEntry[],
	ccEntries: CatalogEntry[],
	ocPlan: PlanInfo,
	ccPlan: PlanInfo,
	workload: Workload,
	ability: Map<string, number> = new Map(),
	abilityWeight = 0.35,
	tps: Map<string, number> = new Map(),
	tpsWeight = 0.1,
): CompareRow[] {
	const plans = new Map<ProviderId, PlanInfo>([
		["oc-go", ocPlan],
		["cc", ccPlan],
	]);
	// Score every entry from both providers against one shared scale.
	const all = buildMetrics(
		[...ocEntries, ...ccEntries],
		plans,
		workload,
		ability,
		abilityWeight,
		tps,
		tpsWeight,
	);
	const ocByKey = indexByKey(ocEntries, all.slice(0, ocEntries.length));
	const ccByKey = indexByKey(ccEntries, all.slice(ocEntries.length));

	const keys = new Set([...ocByKey.keys(), ...ccByKey.keys()]);
	const rows: CompareRow[] = [];
	for (const key of keys) {
		const ccEntry = ccEntries.find((e) => e.key === key);
		const ocEntry = ocEntries.find((e) => e.key === key);
		rows.push({
			key,
			name: ccEntry?.name ?? ocEntry?.name ?? key,
			oc: ocByKey.get(key),
			cc: ccByKey.get(key),
		});
	}
	return rows;
}
