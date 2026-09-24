/** CommandCode CLI to shell out to; override to test a dev build. */
export function cmduseBin(): string {
	return process.env.CMDUSE_BIN || "cmduse";
}

export interface CmduseResult {
	ok: boolean;
	stdout: string;
	stderr: string;
}

/**
 * Run `cmduse` with args. Never throws: a missing or failing binary comes back
 * as `ok: false` so callers can pick a fallback.
 */
export async function runCmduse(args: string[]): Promise<CmduseResult> {
	let proc: Bun.Subprocess<"pipe", "pipe", "pipe">;
	try {
		proc = Bun.spawn([cmduseBin(), ...args], {
			stdout: "pipe",
			stderr: "pipe",
		});
	} catch (error) {
		return { ok: false, stdout: "", stderr: String(error) };
	}
	const [stdout, stderr, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	return { ok: code === 0, stdout, stderr };
}
