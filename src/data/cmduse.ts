export interface RunResult {
	ok: boolean;
	stdout: string;
	stderr: string;
}

/** CommandCode CLI to shell out to; override to test a dev build. */
export function cmduseBin(): string {
	return process.env.CMDUSE_BIN || "cmduse";
}

/**
 * Run a binary with args. Never throws: a missing or failing binary comes back
 * as `ok: false` so callers can pick a fallback rather than crash the report.
 */
export async function runBinary(
	cmd: string,
	args: string[],
): Promise<RunResult> {
	let proc: Bun.Subprocess<"pipe", "pipe", "pipe">;
	try {
		proc = Bun.spawn([cmd, ...args], {
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

export async function runCmduse(args: string[]): Promise<RunResult> {
	return runBinary(cmduseBin(), args);
}
