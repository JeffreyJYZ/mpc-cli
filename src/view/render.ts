import type { CompareRow } from "~/types.ts";
import { footer } from "./footer.ts";
import { tally } from "./layout/segments.ts";
import { printTable } from "./layout/table.ts";
import type { ReportMeta } from "./schema.ts";
import { paint, planTitle, setColor, setColorMode } from "./text/index.ts";

export { fitColumns, tableWidth } from "./layout/fit.ts";
export { tally } from "./layout/segments.ts";
export { columns } from "./schema.ts";
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
