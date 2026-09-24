let color = true;

export function setColor(enabled: boolean): void {
	color = enabled;
}

export function paint(code: string, text: string): string {
	return color ? `\u001b[${code}m${text}\u001b[0m` : text;
}

export {
	fmtAbility,
	fmtAllowance,
	fmtCount,
	fmtPerDollar,
	fmtPerThousand,
	fmtRate,
	fmtRequests,
	fmtTps,
	fmtUsd,
	planTitle,
	providerName,
	shortProviderName,
} from "./format.ts";
export {
	bestCost,
	bestIndex,
	bestValue,
	ccRates,
	cheaperSide,
	costStyle,
	enabledStyle,
	freeCc,
	freeOc,
	freeStyle,
	ocRates,
	pricingTriple,
	sideStyle,
	valueStyle,
	winner,
	winnerStyle,
} from "./styles.ts";
