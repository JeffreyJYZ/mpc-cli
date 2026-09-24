import { CC_COLUMNS } from "./columns/cc.ts";
import { META_COLUMNS } from "./columns/meta.ts";
import { OC_COLUMNS } from "./columns/oc.ts";
import type { Column } from "./types.ts";

/** Every column the table can render, keyed by the id used with --columns. */
const COLUMNS: Record<string, Column> = {
	...META_COLUMNS,
	...OC_COLUMNS,
	...CC_COLUMNS,
};

export const COLUMN_IDS = [
	"model",
	...Object.keys(OC_COLUMNS),
	...Object.keys(CC_COLUMNS),
	"win",
	"cost",
	"ability",
	"tps",
	"val",
];

export function columns(ids: string[]): Column[] {
	return ids.map((id) => {
		const column = COLUMNS[id];
		if (!column) throw new Error(`unknown column "${id}"`);
		return column;
	});
}
