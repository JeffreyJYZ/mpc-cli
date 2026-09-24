/** Match a table header cell, ignoring sort arrows and punctuation. */
export function headerIndex(header: string[], pattern: RegExp): number {
	return header.findIndex((h) => {
		const norm = h
			.replace(/[^a-z0-9 ]+/gi, " ")
			.replace(/\s+/g, " ")
			.trim();
		return pattern.test(norm);
	});
}
