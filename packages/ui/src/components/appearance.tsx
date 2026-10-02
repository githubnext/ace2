import { createContext, type ReactNode, useContext } from "react";

export type Appearance = "native" | "web";

const AppearanceContext = createContext<Appearance>("web");

/** Returns the current appearance mode (`"native"` or `"web"`). */
export function useAppearance() {
	return useContext(AppearanceContext);
}

type Props = {
	children: ReactNode;
	/** Appearance mode. Defaults to `"web"`. */
	value?: Appearance;
};

/** Provides the appearance mode to descendant components. */
export function AppearanceProvider({ children, value = "web" }: Props) {
	return <AppearanceContext value={value}>{children}</AppearanceContext>;
}
