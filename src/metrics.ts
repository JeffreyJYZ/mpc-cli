import type {
	CatalogEntry,
	CompareRow,
	EntryMetrics,
	ModelPricing,
	PlanInfo,
	ProviderId,
	Workload,
} from "./types.ts";

const PER_MILLION = 1_000_000;

/** USD of list-rate spend for a single request under the fixed workload. */
export function costPerRequest(
	pricing: ModelPricing,
	workload: Workload,
): number {
	return (
		(workload.input * pricing.input +
			workload.cacheRead * pricing.cacheRead +
			workload.output * pricing.output) /
		PER_MILLION
	);
}

function minmax(values: number[]): number[] {
	if (values.length === 0) return [];
	const min = Math.min(...values);
	const max = Math.max(...values);
	if (max === min) return values.map(() => 0.5);
	return values.map((v) => (v - min) / (max - min));
}

/**
 * Blended 0-100 value score across every entry: 60% request volume (log-scaled),
 * 20% cache-read price, 20% output price — lower prices score higher.
 */
function assignIndex(metrics: EntryMetrics[]): void {
	const priced = metrics.filter((m) => Number.isFinite(m.requestsPerMonth));
	const volume = minmax(
		priced.map((m) => Math.log10(Math.max(m.requestsPerMonth, 1))),
	);
	const cache = minmax(priced.map((m) => m.pricing.cacheRead));
	const output = minmax(priced.map((m) => m.pricing.output));

	priced.forEach((m, i) => {
		const nVolume = volume[i] ?? 0.5;
		const nCache = 1 - (cache[i] ?? 0.5);
		const nOutput = 1 - (output[i] ?? 0.5);
		m.index = Math.round(
			100 * (0.6 * nVolume + 0.2 * nCache + 0.2 * nOutput),
		);
	});

	for (const m of metrics) {
		if (!Number.isFinite(m.requestsPerMonth)) m.index = 100;
		else if (m.requestsPerMonth <= 0) m.index = 0;
	}
}

/**
 * Fraction of the monthly allowance each rolling window allows, per
 * provider. opencode Go fixes this at 20%/50%; Command Code derives it from
 * the plan's own 5-hour / weekly dollar caps.
 */
function windowRatios(plan: PlanInfo): { five: number; week: number } {
	if (plan.provider === "oc-go") return { five: 0.2, week: 0.5 };
	if (plan.fiveHour !== null && plan.weekly !== null && plan.credits > 0) {
		return {
			five: plan.fiveHour / plan.credits,
			week: plan.weekly / plan.credits,
		};
	}
	return { five: 1, week: 1 };
}

export function buildMetrics(
	entries: CatalogEntry[],
	plans: Map<ProviderId, PlanInfo>,
	workload: Workload,
): EntryMetrics[] {
	const metrics: EntryMetrics[] = entries.map((entry) => {
		const plan = plans.get(entry.provider);
		if (!plan)
			throw new Error(`no plan loaded for provider ${entry.provider}`);
		const cost = costPerRequest(entry.pricing, workload);
		const free = cost === 0;
		const requestsPerMonth = free
			? Number.POSITIVE_INFINITY
			: entry.allowance / cost;
		const ratios = windowRatios(plan);
		return {
			provider: entry.provider,
			plan: entry.plan,
			pricing: entry.pricing,
			allowance: entry.allowance,
			costPerRequest: cost,
			requestsPerMonth,
			requestsPerFiveHour: ratios.five * requestsPerMonth,
			requestsPerWeek: ratios.week * requestsPerMonth,
			payPerRequest: free ? 0 : (plan.price * cost) / entry.allowance,
			multiplier: plan.price > 0 ? entry.allowance / plan.price : 0,
			index: 0,
			free,
		};
	});
	assignIndex(metrics);
	return metrics;
}

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
): CompareRow[] {
	const plans = new Map<ProviderId, PlanInfo>([
		["oc-go", ocPlan],
		["cc", ccPlan],
	]);
	// Score every entry from both providers against one shared scale.
	const allMetrics = buildMetrics(
		[...ocEntries, ...ccEntries],
		plans,
		workload,
	);
	const ocByKey = indexByKey(
		ocEntries,
		allMetrics.slice(0, ocEntries.length),
	);
	const ccByKey = indexByKey(ccEntries, allMetrics.slice(ocEntries.length));

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
