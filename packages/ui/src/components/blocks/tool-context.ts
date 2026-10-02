import { createContext, use } from "react";

type ToolToggle = (id: string) => void;
type ToolContextValue = {
	expandedResults?: ReadonlySet<string>;
	toggle: ToolToggle;
	toggleResult?: ToolToggle;
};

const ToolContext = createContext<ToolContextValue | ToolToggle | null>(null);
const ToolProvider = ToolContext.Provider;

function useToolToggle() {
	let context = useToolContext();
	return context?.toggle ?? null;
}

function useToolContext() {
	let context = use(ToolContext);
	if (typeof context === "function") return { toggle: context };
	return context;
}

export { ToolProvider, useToolContext, useToolToggle };
