interface CmdusePlan {
	name: string;
	price: string;
	creditsMonthly: string;
	fiveHour: string;
	weekly: string;
}

export function money(value: string): number | null {
	const m = value.match(/\$?\s*([0-9]+(?:\.[0-9]+)?)/);
	return m ? Number(m[1]) : null;
}

export async function cmdusePlans(): Promise<CmdusePlan[]> {
	let proc: Bun.Subprocess<"pipe", "pipe", "pipe">;
	try {
		proc = Bun.spawn(["cmduse", "plans", "--json"], {
			stdout: "pipe",
			stderr: "pipe",
		});
	} catch {
		throw new Error(
			"`cmduse` not found on PATH — install the command-code CLI to read live plan limits.",
		);
	}
	const [out, err, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	if (code !== 0) {
		throw new Error(`cmduse plans --json failed (${code}): ${err.trim()}`);
	}
	return JSON.parse(out) as CmdusePlan[];
}
