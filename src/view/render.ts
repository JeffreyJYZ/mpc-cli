import type { CompareRow } from "~/types.ts";
import { footer } from "./footer.ts";
import { tally } from "./layout/segments.ts";
import { printTable } from "./layout/table.ts";
import type { ReportMeta } from "./schema.ts";
import { paint, planTitle, setColor, setColorMode } from "./text/index.ts";

export { fitColumns, tableWidth } from "./layout/fit.ts";
export { tally } from "./layout/segments.ts";
export { COLUMN_IDS, columns } from "./schema.ts";
export { renderCsv, renderMarkdown } from "./text/export.ts";
export {
	fmtUsd,
	planTitle,
	providerName,
	shortProviderName,
} from "./text/index.ts";
export { setThresholds } from "./text/styles.ts";
export { setColor, setColorMode };

export function renderText(
	rows: CompareRow[],
	meta: ReportMeta,
	columnIds: string[],
	dropped: string[] = [],
): void {
	printTable(rows, columnIds, {
		oc: { title: planTitle(meta.ocPlan), color: "1;36" },
		cc: { title: planTitle(meta.ccPlan), color: "1;35" },
	});
	if (dropped.length > 0) {
		console.log(
			paint(
				"2",
				`\ndropped for width: ${[...new Set(dropped)].join(", ")} (use --columns to force, --width <n> to widen)`,
			),
		);
	}
	console.log();
	footer(rows, meta);
}

export function renderJson(rows: CompareRow[], meta: ReportMeta): string {
	return JSON.stringify(
		{
			workloads: meta.workloads,
			plans: { "oc-go": meta.ocPlan, cc: meta.ccPlan },
			tally: tally(rows),
			rows,
		},
		null,
		2,
	);
}

export const GAP = "  ";
export const BAR = " │ ";
export const BAR_RULE = "─┼─";

/** Fewest columns that still answer "which model, how many requests, who wins". */
export const MINIMAL_COLUMNS = ["model", "oc-reqmo", "cc-reqmo", "win", "val"];

/** The everyday middle set: allowance plus the three rate views per side. */
export const MEDIUM_COLUMNS = [
	"model",
	"oc-allow",
	"oc-reqmo",
	"oc-per1k",
	"oc-reqdollar",
	"cc-allow",
	"cc-reqmo",
	"cc-per1k",
	"cc-reqdollar",
	"win",
	"cost",
	"val",
];

/** Every column: the width-trimmed default, and `--detail` untrimmed. */
export const DETAIL_COLUMNS = [
	"model",
	"oc-rates",
	"oc-allow",
	"oc-req5h",
	"oc-reqwk",
	"oc-reqmo",
	"oc-per1k",
	"oc-reqdollar",
	"cc-rates",
	"cc-allow",
	"cc-req5h",
	"cc-reqwk",
	"cc-reqmo",
	"cc-per1k",
	"cc-reqdollar",
	"ability",
	"tps",
	"deal",
	"win",
	"cost",
	"val",
];
