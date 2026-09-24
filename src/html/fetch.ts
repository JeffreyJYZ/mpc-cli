export async function fetchText(url: string): Promise<string> {
	const res = await fetch(url, {
		headers: { "user-agent": "mpc/0.1 (+model price compare)" },
	});
	if (!res.ok)
		throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`);
	return res.text();
}
