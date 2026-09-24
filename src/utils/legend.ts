export const LEGEND: [string, string][] = [
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
