let color = true;

export function setColor(enabled: boolean): void {
	color = enabled;
}

export function paint(code: string, text: string): string {
	return color ? `\u001b[${code}m${text}\u001b[0m` : text;
}
