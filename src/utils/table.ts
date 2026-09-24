import { columns } from "./columns.ts";
import { BAR, BAR_RULE, GAP } from "./consts.ts";
import { paint } from "./funcs.ts";
import type {
	Column,
	FitResult,
	GroupKey,
	GroupLabel,
	Row,
	Segment,
} from "./types.ts";

function groupOf(id: string): GroupKey {
	if (id === "model") return "model";
	if (id.startsWith("oc-")) return "oc";
	if (id.startsWith("cc-")) return "cc";
	return "misc";
}

function buildSegments(
	ids: string[],
	cols: Column[],
	widths: number[],
): Segment[] {
	const segs: Segment[] = [];
	ids.forEach((id, i) => {
		const column = cols[i];
		if (!column) return;
		const key = groupOf(id);
		const last = segs[segs.length - 1];
		if (!last || last.key !== key) {
			segs.push({
				key,
				columns: [column],
				widths: [widths[i] ?? 0],
				width: 0,
			});
		} else {
			last.columns.push(column);
			last.widths.push(widths[i] ?? 0);
		}
	});
	for (const seg of segs) {
		seg.width =
			seg.widths.reduce((a, b) => a + b, 0) +
			GAP.length * (seg.widths.length - 1);
	}
	return segs;
}

function measure(
	rows: Row[],
	ids: string[],
): { cols: Column[]; widths: number[] } {
	const cols = columns(ids);
	const widths = cols.map((c) => c.header.length);
	for (const row of rows) {
		cols.forEach((c, i) => {
			const len = c.value(row).length;
			if (len > (widths[i] ?? 0)) widths[i] = len;
		});
	}
	return { cols, widths };
}

function cellText(
	col: Column,
	text: string,
	width: number,
	alignRight: boolean,
): string {
	if (col.pad === false) return text;
	return alignRight && col.right ? text.padStart(width) : text.padEnd(width);
}

function renderSegment(
	seg: Segment,
	cells: string[],
	alignRight: boolean,
	styles?: (string | undefined)[],
): string {
	return seg.columns
		.map((col, i) => {
			const text = cellText(
				col,
				cells[i] ?? "",
				seg.widths[i] ?? 0,
				alignRight,
			);
			const code = styles?.[i];
			return code ? paint(code, text) : text;
		})
		.join(GAP);
}

/** Printed width of the whole table, in characters (ANSI colour not counted). */
export function tableWidth(rows: Row[], ids: string[]): number {
	const { cols, widths } = measure(rows, ids);
	const segs = buildSegments(ids, cols, widths);
	if (segs.length === 0) return 0;
	return (
		segs.reduce((sum, seg) => sum + seg.width, 0) +
		BAR.length * (segs.length - 1)
	);
}

/**
 * Drop optional columns, widest-first, until the table fits `limit`. Columns
 * with the same `drop` value are removed together, so both providers stay
 * symmetric.
 */
export function fitColumns(
	rows: Row[],
	ids: string[],
	limit: number,
): FitResult {
	let current = [...ids];
	const dropped: string[] = [];
	while (limit > 0 && tableWidth(rows, current) > limit) {
		const levels = current
			.map((id) => columns([id])[0]?.drop)
			.filter((drop): drop is number => drop !== undefined);
		if (levels.length === 0) break;
		const lowest = Math.min(...levels);
		const remove = new Set(
			current.filter((id) => columns([id])[0]?.drop === lowest),
		);
		if (remove.size === 0) break;
		current = current.filter((id) => !remove.has(id));
		dropped.push(...remove);
	}
	return { ids: current, dropped, width: tableWidth(rows, current) };
}

export function printTable(
	rows: Row[],
	columnIds: string[],
	labels: Partial<Record<GroupKey, GroupLabel>>,
): void {
	const { cols, widths } = measure(rows, columnIds);
	const segs = buildSegments(columnIds, cols, widths);
	const bar = paint("2", BAR);

	if (segs.some((seg) => labels[seg.key])) {
		console.log(
			segs
				.map((seg) => {
					const label = labels[seg.key];
					if (!label) return " ".repeat(seg.width);
					const left = Math.max(
						0,
						Math.floor((seg.width - label.title.length) / 2),
					);
					return paint(
						label.color,
						label.title
							.padStart(left + label.title.length)
							.padEnd(seg.width),
					);
				})
				.join(bar),
		);
	}

	console.log(
		segs
			.map((seg) =>
				paint(
					"1",
					renderSegment(
						seg,
						seg.columns.map((c) => c.header),
						false,
					),
				),
			)
			.join(bar),
	);
	console.log(
		segs.map((seg) => "─".repeat(seg.width)).join(paint("2", BAR_RULE)),
	);
	for (const row of rows) {
		console.log(
			segs
				.map((seg) =>
					renderSegment(
						seg,
						seg.columns.map((c) => c.value(row)),
						true,
						seg.columns.map((c) => c.style?.(row)),
					),
				)
				.join(bar),
		);
	}
}
