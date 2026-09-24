/**
 * Canonical keys that differ only by vendor/branding between the two catalogs.
 * Keys are already lowercased and stripped of punctuation; map the variant onto
 * the shared canonical form. Applied after normalizeKey's base cleaning.
 */
export const ALIASES: Record<string, string> = {
	// CommandCode prefixes these with "Tencent"; OpenCode Go does not.
	tencenthy3: "hy3",
	tencenthy4preview: "hy4preview",
	// CommandCode writes "(exp)"; OpenCode Go writes "-exp".
	deepseekv4flashvision: "deepseekv4flashvisionexp",
};
