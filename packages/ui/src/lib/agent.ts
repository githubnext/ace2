import type * as t from "../types";

const CUSTOM = [
	"var(--agent-1)",
	"var(--agent-2)",
	"var(--agent-3)",
	"var(--agent-4)",
	"var(--agent-5)",
	"var(--agent-6)",
];

function hash(value: string) {
	let hash = 0;
	for (let char of value) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
	return hash;
}

function agentColor(agent?: t.AgentSelection) {
	if (!agent) return;
	if (agent.custom) return CUSTOM[hash(agent.custom.name) % CUSTOM.length];
	if (agent.mode === "plan") return "var(--agent-plan)";
	if (agent.mode === "autopilot") return "var(--agent-autopilot)";
	return "var(--agent-build)";
}

function agentLabel(agent?: t.AgentSelection) {
	if (!agent) return;
	if (agent.custom) return agent.custom.displayName;
	if (agent.mode === "plan") return "Plan";
	if (agent.mode === "autopilot") return "Autopilot";
	return "Build";
}

export { agentColor, agentLabel };
