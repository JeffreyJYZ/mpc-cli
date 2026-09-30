import type { CompareRow, PlanInfo, Workload } from "~/types.ts";
import { tally } from "./layout/segments.ts";
import type { ReportMeta } from "./schema.ts";
import {
	paint,
	planTitle,
	providerName,
	shortProviderName,
} from "./text/index.ts";

/** One side's per-request token vector; fields with no measured signal stay out. */
function shapeText(workload: Workload): string {
	const parts = [
		`${workload.input.toLocaleString("en-US")} input`,
		`${workload.cacheRead.toLocaleString("en-US")} cache-read`,
		`${workload.output.toLocaleString("en-US")} output`,
	];
	if (workload.reasoning > 0) {
		parts.push(`${workload.reasoning.toLocaleString("en-US")} reasoning`);
	}
	if (workload.cacheWrite > 0) {
		parts.push(
			`${workload.cacheWrite.toLocaleString("en-US")} cache-write`,
		);
	}
	return parts.join(" · ");
}

function planBlock(plan: PlanInfo): { title: string; rest: string } {
	if (plan.provider === "oc-go") {
		// Per-model limits, no shared pool, so the sum is only an upper bound.
		return {
			title: planTitle(plan),
			rest: `$${plan.price}/mo · per-model limits (sum $${plan.credits})`,
		};
	}
	const window =
		plan.fiveHour !== null && plan.weekly !== null
			? ` · 5h $${plan.fiveHour} / wk $${plan.weekly}`
			: "";
	return {
		title: planTitle(plan),
		rest: `$${plan.price}/mo · $${plan.credits} credits${window}`,
	};
}

function windowPercents(plan: PlanInfo, override?: [number, number]): string {
	if (override) {
		return `${Math.round(override[0] * 100)}% / ${Math.round(override[1] * 100)}%`;
	}
	if (plan.provider === "oc-go") return "20% / 50%";
	if (plan.fiveHour !== null && plan.weekly !== null && plan.credits > 0) {
		return `${Math.round((plan.fiveHour / plan.credits) * 100)}% / ${Math.round(
			(plan.weekly / plan.credits) * 100,
		)}%`;
	}
	return "—";
}

export function footer(rows: CompareRow[], meta: ReportMeta): void {
	const dim = (text: string): string => paint("2", text);
	const plans = [meta.ocPlan, meta.ccPlan].map(planBlock);
	const planWidth = Math.max(...plans.map((p) => p.title.length));
	const [ocBlock, ccBlock] = plans;
	const line = (label: string, text: string): void =>
		console.log(`${dim(label.padEnd(10))}${dim(text)}`);

	// With a measured shape the two sides are priced on different traffic, so
	// saying one workload would be a lie; print one line per side then.
	const ocWorkload = meta.workloads["oc-go"];
	const ccWorkload = meta.workloads.cc;
	const perSide = JSON.stringify(ocWorkload) !== JSON.stringify(ccWorkload);
	line(
		"workload",
		`${perSide ? `${shortProviderName("oc-go")} ` : ""}${shapeText(ocWorkload)} tokens per request`,
	);
	if (perSide) {
		line(
			"",
			`${shortProviderName("cc")} ${shapeText(ccWorkload)} tokens per request`,
		);
	}
	console.log(
		`${dim("plans     ")}${paint("1;36", (ocBlock?.title ?? "").padEnd(planWidth))}  ${dim(ocBlock?.rest ?? "")}`,
	);
	console.log(
		`${dim("          ")}${paint("1;35", (ccBlock?.title ?? "").padEnd(planWidth))}  ${dim(ccBlock?.rest ?? "")}`,
	);
	line(
		"windows",
		`rolling caps as % of monthly allowance: ${planTitle(meta.ocPlan)} ${windowPercents(meta.ocPlan, meta.window)} · ${planTitle(meta.ccPlan)} ${windowPercents(meta.ccPlan, meta.window)}`,
	);
	if (meta.abilityLabel) {
		line(
			"ability",
			`${meta.abilityLabel}${meta.abilityNote ? ` · ${meta.abilityNote}` : ""}`,
		);
	}

	const t = tally(rows);
	const parts = [
		`${providerName("oc-go")} ${t.ocWins}`,
		`${providerName("cc")} ${t.ccWins}`,
	];
	if (t.ties > 0) parts.push(`tie ${t.ties}`);
	line("wins", `head-to-head ${t.headToHead} shared: ${parts.join(" · ")}`);
	line(
		"",
		`exclusive: ${providerName("oc-go")} ${t.ocOnly} · ${providerName("cc")} ${t.ccOnly}`,
	);

	LEGEND.forEach(([key, text], i) => {
		line(i === 0 ? "legend" : "", `${(key ?? "").padEnd(9)}${text}`);
	});
}

export const LEGEND: [string, string][] = [
	["rates", "token price per 1M tokens, in/out/cache"],
	["allow", "monthly credits this plan gives the model"],
	["5h wk mo", "requests the rolling 5-hour / weekly / monthly window buys"],
	["$/1K", "your cost per 1,000 requests, at the plan's price"],
	["req/$", "requests one dollar of subscription buys"],
	[
		"DEAL",
		"active CommandCode promotion: -98%, Free, 2x usage (expiry line is in --json)",
	],
	[
		"WIN",
		"cheaper side: OC / CC / tie · 'x only' = only that provider has it",
	],
	["ability", "benchmark score for the model (source above)"],
	["tps", "output tokens per second (source above)"],
	["COST", "0-100 cost index, lower is better (no ability)"],
	[
		"VAL",
		"0-100 ability-aware value: ability + speed + volume + cache + output",
	],
];
