import type { CompareRow, PlanInfo, Workload } from "../types.ts";

export type Row = CompareRow;

/** One table column. */
export interface Column {
	header: string;
	value: (row: Row) => string;
	right?: boolean;
	/** Optional SGR code applied to the padded cell (green 32, dim 2, ...). */
	style?: (row: Row) => string | undefined;
	/** Lower values are dropped first when the table is too wide. */
	drop?: number;
	/** When false the cell is not padded to the column width. */
	pad?: boolean;
}

export type GroupKey = "model" | "oc" | "cc" | "misc";

export interface GroupLabel {
	title: string;
	color: string;
}

/** A contiguous run of columns belonging to one group. */
export interface Segment {
	key: GroupKey;
	columns: Column[];
	widths: number[];
	/** Total printed width including the gaps between columns. */
	width: number;
}

export interface FitResult {
	ids: string[];
	dropped: string[];
	width: number;
}

export interface Tally {
	/** Rows present on both sides. */
	headToHead: number;
	ocWins: number;
	ccWins: number;
	ties: number;
	ocOnly: number;
	ccOnly: number;
}

export interface ReportMeta {
	ocPlan: PlanInfo;
	ccPlan: PlanInfo;
	workload: Workload;
	/** Ability source label, e.g. "CommandCode Intelligence". */
	abilityLabel?: string;
	abilityNote?: string;
}
