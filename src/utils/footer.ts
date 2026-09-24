import type { CompareRow, PlanInfo } from "../types.ts";
import { paint, planTitle, providerName } from "./funcs.ts";
import type { ReportMeta, Row, Tally } from "./types.ts";

export function tally(rows: Row[]): Tally {
	const result: Tally = {
		headToHead: 0,
		ocWins: 0,
		ccWins: 0,
		ties: 0,
		ocOnly: 0,
		ccOnly: 0,
	};
	for (const row of rows) {
		if (row.oc && row.cc) {
			result.headToHead++;
			if (row.oc.payPerRequest === row.cc.payPerRequest) result.ties++;
			else if (row.oc.payPerRequest < row.cc.payPerRequest)
				result.ocWins++;
			else result.ccWins++;
		} else if (row.oc) {
			result.ocOnly++;
		} else if (row.cc) {
			result.ccOnly++;
		}
	}
	return result;
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

function windowPercents(plan: PlanInfo): string {
	if (plan.provider === "oc-go") return "20% / 50%";
	if (plan.fiveHour !== null && plan.weekly !== null && plan.credits > 0) {
		return `${Math.round((plan.fiveHour / plan.credits) * 100)}% / ${Math.round(
			(plan.weekly / plan.credits) * 100,
		)}%`;
	}
	return "—";
}

const LEGEND = [
	["rates", "token price per 1M tokens, in/out/cache"],
	["allow", "monthly credits this plan gives the model"],
	["5h wk mo", "requests the rolling 5-hour / weekly / monthly window buys"],
	["$/1K", "your cost per 1,000 requests, at the plan's price"],
	["req/$", "requests one dollar of subscription buys"],
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

export function footer(rows: CompareRow[], meta: ReportMeta): void {
	const dim = (text: string): string => paint("2", text);
	const plans = [meta.ocPlan, meta.ccPlan].map(planBlock);
	const planWidth = Math.max(...plans.map((p) => p.title.length));
	const [ocBlock, ccBlock] = plans;
	const line = (label: string, text: string): void =>
		console.log(`${dim(label.padEnd(10))}${dim(text)}`);

	line(
		"workload",
		`${meta.workload.input.toLocaleString("en-US")} input · ${meta.workload.cacheRead.toLocaleString("en-US")} cache-read · ${meta.workload.output.toLocaleString("en-US")} output tokens per request`,
	);
	console.log(
		`${dim("plans     ")}${paint("1;36", (ocBlock?.title ?? "").padEnd(planWidth))}  ${dim(ocBlock?.rest ?? "")}`,
	);
	console.log(
		`${dim("          ")}${paint("1;35", (ccBlock?.title ?? "").padEnd(planWidth))}  ${dim(ccBlock?.rest ?? "")}`,
	);
	line(
		"windows",
		`rolling caps as % of monthly allowance: ${planTitle(meta.ocPlan)} ${windowPercents(meta.ocPlan)} · ${planTitle(meta.ccPlan)} ${windowPercents(meta.ccPlan)}`,
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
