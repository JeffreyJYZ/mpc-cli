import { BOUNDARY } from "../types.ts";

export type Table = string[][];

function clean(text: string): string {
	return text
		.replace(/\u00a0/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

/** Collapse a raw cell (boundary markers included) into plain text. */
export function cellText(cell: string): string {
	return clean(cell.split(BOUNDARY).join(" "));
}

/** The first text node of a cell; deal badges live in later nodes. */
export function nameCell(cell: string): string {
	return cellText(cell.split(BOUNDARY)[0] ?? "");
}

/** Parse every <table> on a page into rows of trimmed cell text. */
export async function parseTables(html: string): Promise<Table[]> {
	const tables: Table[] = [];
	let table: Table | null = null;
	let row: string[] | null = null;
	let cell: string | null = null;

	const rewriter = new HTMLRewriter()
		.on("table", {
			element(el) {
				table = [];
				el.onEndTag(() => {
					if (table) tables.push(table);
					table = null;
				});
			},
		})
		.on("tr", {
			element(el) {
				const start = table;
				row = [];
				el.onEndTag(() => {
					if (row && start) start.push(row);
					row = null;
				});
			},
		})
		.on("th, td", {
			element(el) {
				const current = row;
				cell = "";
				el.onEndTag(() => {
					// BOUNDARY marks a text-node boundary so "$60" + "4x" stays
					// two tokens instead of collapsing into "$604x".
					if (current) current.push((cell ?? "").trim());
					cell = null;
				});
			},
			text(chunk) {
				if (cell !== null) cell += `${chunk.text}${BOUNDARY}`;
			},
		});

	await rewriter.transform(new Response(html)).text();
	return tables;
}
