import {
	extractNumericColumn,
	fetchText,
	parseTables,
} from "../scrape/index.ts";
import { type BenchData, emptyData } from "./types.ts";

// CommandCode only publishes Intelligence and Tok/s on the GOAT/Pro catalogs.
const PAGES = [
	"https://commandcode.ai/docs/plans/goat",
	"https://commandcode.ai/docs/plans/pro",
];
const TPS_HEADER = /tok\s*\/?\s*s|tokens?\s*per\s*sec/i;

export async function loadCc(): Promise<BenchData> {
	const pages = await Promise.all(
		PAGES.map(async (url) => parseTables(await fetchText(url))),
	);
	const data = emptyData();
	for (const tables of pages) {
		for (const [key, score] of extractNumericColumn(
			tables,
			/intelligence/i,
		)) {
			if (!data.intelligence.has(key)) data.intelligence.set(key, score);
		}
		for (const [key, tps] of extractNumericColumn(tables, TPS_HEADER)) {
			if (!data.tps.has(key)) data.tps.set(key, tps);
		}
	}
	return data;
}
