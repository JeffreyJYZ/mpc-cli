import type { CompareRow } from "./types.ts";
import { footer } from "./utils/footer.ts";
import { paint, planTitle, setColor } from "./utils/funcs.ts";
import { printTable } from "./utils/table.ts";
import { tally } from "./utils/tally.ts";
import type { ReportMeta } from "./utils/types.ts";

export { COLUMN_IDS, columns } from "./utils/columns.ts";
export { DEFAULT_COLUMNS, DETAIL_COLUMNS } from "./utils/consts.ts";
export { fitColumns, tableWidth } from "./utils/fit.ts";
export {
	fmtUsd,
	planTitle,
	providerName,
	shortProviderName,
} from "./utils/funcs.ts";
export { tally } from "./utils/tally.ts";
export { setColor };

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
			workload: meta.workload,
			plans: { "oc-go": meta.ocPlan, cc: meta.ccPlan },
			tally: tally(rows),
			rows,
		},
		null,
		2,
	);
}
