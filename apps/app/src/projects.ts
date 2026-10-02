import type { Listing, Project } from "@ace/host/protocol";

export type AppProject = Project & { id: string; host: string };

export const projectId = (host: string, path: string) => JSON.stringify([host, path]);

/** The same path on two hosts represents two different project folders. */
export function projects(opened: Project[], channels: Listing[], host: string): AppProject[] {
	const values = new Map<string, AppProject>();
	if (host) {
		for (const project of opened) {
			const id = projectId(host, project.path);
			values.set(id, { ...project, id, host });
		}
	}
	for (const channel of channels) {
		const id = projectId(channel.host, channel.project);
		if (values.has(id)) continue;
		values.set(id, {
			id,
			host: channel.host,
			path: channel.project,
			name: channel.project.replace(/\/+$/, "").split("/").pop() || channel.project,
		});
	}
	return [...values.values()];
}
