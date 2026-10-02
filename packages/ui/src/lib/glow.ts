type GlowScheme = "light" | "dark";
type GlowTone = [string, string, string, string];
type GlowPreset = {
	colors: GlowTone;
	padding: number;
	scale: number;
	radius: number;
	intensity: number;
	activity: number;
	speed: number;
};

const glow = {
	dark: {
		colors: ["#67a246", "#84d35c", "#b1dd8c", "#3e652c"],
		padding: 130,
		scale: 0.45,
		radius: 26,
		intensity: 0.75,
		activity: 0.6,
		speed: 1,
	},
	light: {
		colors: ["#96d35f", "#4ece4c", "#77bb41", "#96d35f"],
		padding: 130,
		scale: 0.45,
		radius: 26,
		intensity: 0.75,
		activity: 0.6,
		speed: 1,
	},
} satisfies Record<GlowScheme, GlowPreset>;

export { glow, type GlowPreset, type GlowScheme, type GlowTone };
