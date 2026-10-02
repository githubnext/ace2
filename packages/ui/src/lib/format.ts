/**
 * GitHub avatar URL for a user or organization.
 * Prefer the numeric user ID when known; logins redirect.
 */
export function avatar(user: number | string): string {
	return typeof user === "number"
		? `https://avatars.githubusercontent.com/u/${user}?v=4`
		: `https://github.com/${user}.png`;
}
