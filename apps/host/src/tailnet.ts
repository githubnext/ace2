/** The tailnet is the team: it says who a peer is and which machines can host channels. */
import { isIP } from "node:net";

type Status = {
	BackendState: string;
	Self: Node;
	Peer?: Record<string, Node>;
	User?: Record<string, { LoginName: string }>;
};
type Node = {
	HostName: string;
	DNSName: string;
	UserID: number;
	TailscaleIPs: string[];
	Online?: boolean;
	Tags?: string[];
};

export type Machine = { name: string; login: string; address: string };

async function run(args: string[]): Promise<unknown> {
	const child = Bun.spawn(["tailscale", ...args], { stdout: "pipe", stderr: "pipe" });
	const [out, code] = await Promise.all([new Response(child.stdout).text(), child.exited]);
	if (code !== 0) throw new Error(`tailscale ${args[0]} failed`);
	return JSON.parse(out);
}

function machine(node: Node, status: Status): Machine {
	return {
		name: node.DNSName.split(".")[0] || node.HostName,
		login: status.User?.[node.UserID]?.LoginName ?? "",
		address: node.TailscaleIPs.find((ip) => isIP(ip) === 4) ?? node.TailscaleIPs[0]!,
	};
}

async function status(): Promise<Status | undefined> {
	try {
		const value = await run(["status", "--json"]) as Status;
		return value.BackendState === "Running" ? value : undefined;
	} catch {
		return undefined;
	}
}

/** This machine on the tailnet, or nothing when Tailscale is not running. */
export async function self(): Promise<Machine | undefined> {
	const value = await status();
	return value && machine(value.Self, value);
}

/** Online machines owned by people; tagged nodes are servers, not participants. */
export async function peers(): Promise<Machine[]> {
	const value = await status();
	if (!value) return [];
	return Object.values(value.Peer ?? {})
		.filter((node) => node.Online && !node.Tags?.length)
		.map((node) => machine(node, value));
}

/** Only CGNAT and ULA tailnet addresses; anything else did not arrive over Tailscale. */
export function tailnet(ip: string): string | undefined {
	const plain = ip.replace(/^::ffff:/, "");
	if (isIP(plain) === 4) {
		const [a, b] = plain.split(".").map(Number);
		return a === 100 && b! >= 64 && b! <= 127 ? plain : undefined;
	}
	return plain.toLowerCase().startsWith("fd7a:115c:a1e0:") ? plain : undefined;
}

/** The person behind an inbound TCP connection, as Tailscale verified it. Tagged nodes are refused. */
export async function whois(ip: string, port: number): Promise<string> {
	const address = tailnet(ip);
	if (!address) throw new Error("Not a tailnet address");
	const endpoint = isIP(address) === 6 ? `[${address}]:${port}` : `${address}:${port}`;
	const value = await run(["whois", "--json", "--proto=tcp", endpoint]) as {
		Node: { Tags?: string[] };
		UserProfile: { LoginName: string };
	};
	if (value.Node.Tags?.length) throw new Error("Tagged nodes cannot participate");
	return value.UserProfile.LoginName;
}
