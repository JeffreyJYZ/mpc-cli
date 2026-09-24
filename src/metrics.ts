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

/** Speed-variant suffixes that share the base model's weights. */
const SPEED_SUFFIXES = ["ultraspeed", "highspeed", "fastx", "fast"];

/**
 * Benchmark lookup. A speed variant (`...Fast`, `...HighSpeed`, `...UltraSpeed`)
 * has the base model's weights, so it inherits the base ability when the
 * benchmark has no row of its own. Throughput is not inherited, since serving
 * differs.
 */
export function lookupAbility(
	scores: Map<string, number>,
	key: string,
): number | null {
	const direct = scores.get(key);
	if (direct !== undefined) return direct;
	// FlashX is the faster tier of Flash, not of the base model: "glm53flashx"
	// inherits "glm53flash", not "glm53".
	if (key.endsWith("flashx")) {
		const flash = scores.get(`${key.slice(0, -"flashx".length)}flash`);
		if (flash !== undefined) return flash;
	}
	for (const suffix of SPEED_SUFFIXES) {
		if (key.endsWith(suffix)) {
			const base = scores.get(key.slice(0, -suffix.length));
			if (base !== undefined) return base;
		}
	}
	return null;
}

function minmax(values: number[]): number[] {
	if (values.length === 0) return [];
	const min = Math.min(...values);
	const max = Math.max(...values);
	if (max === min) return values.map(() => 0.5);
	return values.map((v) => (v - min) / (max - min));
}

/**
 * Min-max over log10 values. Throughput and token prices span orders of
 * magnitude, so a single outlier would otherwise squash everyone else toward
 * one end of the scale. Non-positive values clamp to a floor.
 */
function logMinmax(values: number[]): number[] {
	return minmax(values.map((v) => Math.log10(Math.max(v, 1e-6))));
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
	const cache = logMinmax(priced.map((m) => m.pricing.cacheRead));
	const output = logMinmax(priced.map((m) => m.pricing.output));

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
 * provider. OpenCode Go fixes this at 20%/50%; CommandCode derives it from
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
	ability: Map<string, number> = new Map(),
	abilityWeight = 0.35,
	tps: Map<string, number> = new Map(),
	tpsWeight = 0.1,
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
			ability: lookupAbility(ability, entry.key),
			tps: tps.get(entry.key) ?? null,
			index: 0,
			valueIndex: null,
			free,
		};
	});
	assignIndex(metrics);
	assignValueIndex(metrics, abilityWeight, tpsWeight);
	return metrics;
}

/**
 * Ability-aware value score. Ability and speed get their own weights; the rest
 * splits volume/cache/output 50/25/25. Unscored models stay null. A model with
 * no speed figure gets the neutral 0.5 rather than a penalty.
 */
function assignValueIndex(
	metrics: EntryMetrics[],
	abilityWeight: number,
	tpsWeight: number,
): void {
	const wAbility = Math.min(Math.max(abilityWeight, 0), 1);
	const wTps = Math.min(Math.max(tpsWeight, 0), 1 - wAbility);
	const scored = metrics.filter((m) => m.ability !== null);
	const ability = minmax(scored.map((m) => m.ability ?? 0));
	const speeded = metrics.filter((m) => m.tps !== null);
	const speed = logMinmax(speeded.map((m) => m.tps ?? 1));
	const priced = metrics.filter((m) => Number.isFinite(m.requestsPerMonth));
	const volume = minmax(
		priced.map((m) => Math.log10(Math.max(m.requestsPerMonth, 1))),
	);
	const cache = logMinmax(priced.map((m) => m.pricing.cacheRead));
	const output = logMinmax(priced.map((m) => m.pricing.output));

	const volumeByIndex = new Map<EntryMetrics, number>();
	priced.forEach((m, i) => {
		volumeByIndex.set(m, volume[i] ?? 0.5);
	});
	const cacheByIndex = new Map<EntryMetrics, number>();
	priced.forEach((m, i) => {
		cacheByIndex.set(m, cache[i] ?? 0.5);
	});
	const outputByIndex = new Map<EntryMetrics, number>();
	priced.forEach((m, i) => {
		outputByIndex.set(m, output[i] ?? 0.5);
	});
	const abilityByIndex = new Map<EntryMetrics, number>();
	scored.forEach((m, i) => {
		abilityByIndex.set(m, ability[i] ?? 0.5);
	});
	const speedByIndex = new Map<EntryMetrics, number>();
	speeded.forEach((m, i) => {
		speedByIndex.set(m, speed[i] ?? 0.5);
	});

	const rest = Math.max(0, 1 - wAbility - wTps);
	const wVolume = rest * 0.5;
	const wCache = rest * 0.25;
	const wOutput = rest * 0.25;

	for (const m of scored) {
		if (!Number.isFinite(m.requestsPerMonth)) {
			m.valueIndex = 100;
			continue;
		}
		m.valueIndex = Math.round(
			100 *
				(wAbility * (abilityByIndex.get(m) ?? 0.5) +
					wTps * (speedByIndex.get(m) ?? 0.5) +
					wVolume * (volumeByIndex.get(m) ?? 0.5) +
					wCache * (1 - (cacheByIndex.get(m) ?? 0.5)) +
					wOutput * (1 - (outputByIndex.get(m) ?? 0.5))),
		);
	}
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
	const allMetrics = buildMetrics(
		[...ocEntries, ...ccEntries],
		plans,
		workload,
		ability,
		abilityWeight,
		tps,
		tpsWeight,
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
