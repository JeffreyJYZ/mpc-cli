import type { Options } from "~/cli/options.ts";
import {
	DETAIL_COLUMNS,
	MEDIUM_COLUMNS,
	MINIMAL_COLUMNS,
} from "~/view/render.ts";

const TIERS = ["minimal", "medium", "detail"] as const;
type Tier = (typeof TIERS)[number];

const SETS: Record<Tier, string[]> = {
	minimal: MINIMAL_COLUMNS,
	medium: MEDIUM_COLUMNS,
	detail: DETAIL_COLUMNS,
};

/**
 * The tier the flags asked for. The default is the full set — `--fit` used to
 * be opt-in, but trimming to the terminal is now what plain `mpc` does.
 */
function tierOf(options: Options): Tier {
	const picked = TIERS.filter((tier) => options[tier]);
	if (picked.length > 1) {
		throw new Error(
			`--${picked.join(" and --")} conflict — pick one column preset`,
		);
	}
	return picked[0] ?? "detail";
}

/** The columns to render: an exact `--columns` list, a config preset, or a tier. */
export function resolveColumns(options: Options): string[] {
	if (options.columns) return options.columns;
	if (options.preset) {
		const named = options.presets[options.preset];
		if (!named) throw new Error(`unknown preset "${options.preset}"`);
		return named;
	}
	return SETS[tierOf(options)];
}

/** Every tier trims to the terminal width except `--detail` and an exact list. */
export function trimsToWidth(options: Options): boolean {
	return !options.columns && !options.detail && options.fit;
}
