# TODO

The single tracker for Ace. No GitHub issues: add, reorder, and remove items here, in the same
commit as the work when possible. Order within a section is priority.

## Before dogfooding

Dogfooding means everyone who works on Ace does all Ace development in Ace. If Ace ships a
surface (channels, diffs, terminals), use Ace's. When something forces another tool, the PR says
so (see [the PR template](.github/pull_request_template.md)) and the gap goes here.

- **Rebuild Ace from Ace.** Verify the first signed build through an Ace channel using
  `bun desktop ci canary`, including status and artifact download. The command pins the pushed
  lane's commit and keeps signing credentials in GitHub; publishing requires `--publish`.
  Keep the same Apple signing identity for installed development builds; ad-hoc signatures can
  leave macOS rejecting the updated helper.
- **Native UI inspection from a channel.** Exercise the desktop window and macOS dialogs while
  developing Ace. The desktop lane used Codex's computer-use tools because Ace's channel tools
  cannot inspect or operate native UI yet.
- **Durable data.** Settle where channel data lives, add backup or export, and from the first
  dogfood channel on, never break existing channels without a migration.
- **Two machines on the tailnet** with the dogfooding team. The old repo's equivalent worked;
  confirm this one does.

## During dogfooding

Driven by what the team hits. Known so far:

- **Teammates' terminals**: terminals are owner-only and don't reach peers' or hosted channels'
  workspaces through the gateway.
- **Notify when an agent finishes.**
- **Token and cost display.**
- **Hosted channels**: create them from the app; let them message other channels; let browsers
  reach them, which needs per-person sign-in rather than the hosts' shared secret.
- **Directory freshness**: hosts re-read every 30 seconds, so a new channel can take that long to
  appear on other hosts. Push changes instead of polling if that matters.
- **Projects across hosts**: identify a project by its repository, not a local path.
- **Previews**: on a local host this is mostly running the app; open a lane's dev server from
  the channel.
- **Lobbies**: presence, notifications, channel lifecycle.
- **Phones**: checked only in Chrome's iPhone emulation, not on a real phone. Terminals have no
  Esc/Ctrl/arrow key row, so they're limited to typing commands. Diffs scroll sideways on long
  lines. Chrome asks for local-network permission before the deployed web app can reach a host
  (Safari doesn't). Push notifications need HTTPS and a service worker.

## Release

- **First desktop release.** Publish the notarized canary and verify an upgrade on another Mac.
  Move to a custom download domain before wider stable distribution. Desktop builds use the
  original green Ace icon, with a yellow version for canary. The 0.0.3 canary app and DMG passed
  Apple notarization; native Settings, helper startup, and Cmd+O project opening passed from
  `/Applications`. Credentials are backed up in 1Password
  and configured in both GitHub release environments. See [updates](docs/updates.md) for the
  release procedure and the earlier checks that resumed real model work after updates.
- **Third-party notices** for desktop builds: Bun's LGPL components, Electrobun binaries, Shiki
  grammars, and the provenance of `packages/ui`'s WebGPU shader and dither code.
- **Review the public tree** for internal material and run a secret scan before publishing.
