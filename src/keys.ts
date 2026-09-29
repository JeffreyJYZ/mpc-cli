import { BOUNDARY } from "./types.ts";

/**
 * Collapse a model name from either catalog onto a shared key.
 *
 * "deepseek/deepseek-v4.1-flash" -> "deepseekv41flash"
 * "DeepSeek V4.1 Flash (Off-Peak)" -> "deepseekv41flash"
 * "Qwen/Qwen3.8-Max" -> "qwen38max"
 */
export function normalizeKey(name: string): string {
	let s = name.trim().toLowerCase();
	// Drop parenthetical qualifiers: (Off-Peak), (> 256K tokens), (latest), (exp).
	s = s.replace(/\([^)]*\)/g, " ");
	// Drop a vendor prefix like "deepseek/", "z-ai/", "opencode-go/".
	const parts = s.split("/");
	s = parts[parts.length - 1] ?? s;
	s = s.replace(/[^a-z0-9]+/g, "");
	return ALIASES[s] ?? s;
}

/** Display name: strip parentheticals and collapse whitespace. */
export function displayName(name: string): string {
	return name
		.split(BOUNDARY)
		.join(" ")
		.replace(/\([^)]*\)/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

/**
 * Canonical keys that differ only by vendor/branding between the two catalogs.
 * Keys are already lowercased and stripped of punctuation; map the variant onto
 * the shared canonical form. Applied after normalizeKey's base cleaning.
 */
const ALIASES: Record<string, string> = {
	// CommandCode prefixes these with "Tencent"; OpenCode Go does not.
	tencenthy3: "hy3",
	tencenthy4preview: "hy4preview",
	// CommandCode writes "(exp)"; OpenCode Go writes "-exp".
	deepseekv4flashvision: "deepseekv4flashvisionexp",
	// Alibaba's "Qwen3.8-Flash-Next" is the release name of the model
	// CommandCode lists as "Qwen 3.8 Flash": same creator, same $0.47 output
	// price and release window, CommandCode has no "Next" row, and Artificial
	// Analysis has no plain "Flash" one. Without this the row has no ability or
	// speed at all, since neither index scores it under the marketing name.
	qwen38flashnext: "qwen38flash",
};
