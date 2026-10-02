// Mirrors Tailwind's default responsive breakpoint names and values.
export const screen = {
	sm: "40rem",
	md: "48rem",
	lg: "64rem",
	xl: "80rem",
} as const;

export const media = {
	sm: `(width >= ${screen.sm})`,
	md: `(width >= ${screen.md})`,
	lg: `(width >= ${screen.lg})`,
	xl: `(width >= ${screen.xl})`,
	ltSm: `(width < ${screen.sm})`,
	ltMd: `(width < ${screen.md})`,
	ltLg: `(width < ${screen.lg})`,
	ltXl: `(width < ${screen.xl})`,
} as const;
