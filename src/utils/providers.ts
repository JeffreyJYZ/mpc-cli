import type { ProviderId } from "../types.ts";

export function providerName(provider: ProviderId): string {
	return provider === "oc-go" ? "OpenCode" : "CommandCode";
}

/** Short provider tag, for the WIN column. */
export function shortProviderName(provider: ProviderId): string {
	return provider === "oc-go" ? "OC" : "CC";
}

/** e.g. "OpenCode Go", "CommandCode GOAT". */
export function planTitle(plan: {
	provider: ProviderId;
	label: string;
}): string {
	return `${providerName(plan.provider)} ${plan.label}`;
}
