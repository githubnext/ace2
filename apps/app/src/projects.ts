import type { Listing, Project } from "@ace/host/protocol";

export type AppProject = Project & { id: string; host: string };

/** Hosts before project roots list each checkout as its own project. */
export const root = (channel: Pick<Listing, "project" | "root">) => channel.root || channel.project;

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
		const path = root(channel);
		const id = projectId(channel.host, path);
		if (values.has(id)) continue;
		const value: AppProject = {
			id,
			host: channel.host,
			path,
			name: channel.repo?.split("/")[1] || path.replace(/\/+$/, "").split("/").pop() || path,
		};
		if (channel.repo) value.repo = channel.repo;
		values.set(id, value);
	}
	return [...values.values()];
}
