import type { Row, Tally } from "./types.ts";

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
