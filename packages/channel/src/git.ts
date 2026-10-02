import type { Context } from "@earendil-works/chord";
import type { ExecutionEnv } from "@earendil-works/pi-durable/env";

export function quote(value: string): string {
	return `'${value.replaceAll("'", `'\\''`)}'`;
}

/**
 * Runs git and returns stdout. Pathspecs are literal so file names can't act as globs, and reads
 * take no optional locks so they never contend with the agent's own git commands.
 */
export async function git(
	env: ExecutionEnv,
	args: string,
	context: Context,
	options: { cwd?: string; ok?: number[] } = {},
): Promise<string> {
	let output = "";
	const result = await env.exec(`GIT_LITERAL_PATHSPECS=1 GIT_OPTIONAL_LOCKS=0 git ${args}`, {
		...(options.cwd ? { cwd: options.cwd } : {}),
		onOutput: (chunk) => (output += chunk),
	}, context);
	if (!result.ok) throw result.error;
	if (!(options.ok ?? [0]).includes(result.value.exitCode)) {
		throw new Error(output.trim() || `git exited ${result.value.exitCode}`);
	}
	return output;
}
