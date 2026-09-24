export function minmax(values: number[]): number[] {
	if (values.length === 0) return [];
	const min = Math.min(...values);
	const max = Math.max(...values);
	if (max === min) return values.map(() => 0.5);
	return values.map((v) => (v - min) / (max - min));
}

/**
 * Min-max over log10 values. Throughput and token prices span orders of
 * magnitude, so a single outlier would otherwise squash everyone else toward
 * one end of the scale. Non-positive values clamp to a floor.
 */
export function logMinmax(values: number[]): number[] {
	return minmax(values.map((v) => Math.log10(Math.max(v, 1e-6))));
}
