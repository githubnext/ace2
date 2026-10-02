# TODO

The single tracker for Ace. No GitHub issues: add, reorder, and remove items here, in the same
commit as the work when possible. Order within a section is priority.

## Before dogfooding

Dogfooding means everyone who works on Ace does all Ace development in Ace. If Ace ships a
surface (channels, diffs, terminals), use Ace's. When something forces another tool, the PR says
so (see [the PR template](.github/pull_request_template.md)) and the gap goes here.

- **Rebuild Ace from Ace.** The installed Ace is a separate build from the checkout agents edit.
  Rebuilding and reinstalling it must not lose channels or runs in progress; check an update
  during a run.
- **Native UI inspection from a channel.** Exercise the desktop window and macOS dialogs while
  developing Ace. The desktop lane used Codex's computer-use tools because Ace's channel tools
  cannot inspect or operate native UI yet.
- **Diff tab** for the selected chat's lane.
- **Images in the composer.** pi accepts image content; the app doesn't send it.
- **Terminals** per channel, opened in a chat's lane.
- **Durable data.** Settle where channel data lives, add backup or export, and from the first
  dogfood channel on, never break existing channels without a migration.
- **Two machines on the tailnet** with the dogfooding team. The old repo's equivalent worked;
  confirm this one does.

## During dogfooding

Driven by what the team hits. Known so far:

- **Steer a busy agent**: send while a run is active.
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

## Release

- **Desktop release.** Signing, notarization, an icon, and updates (Electrobun needs a
  `baseUrl`). Electrobun's downloaded CLI needs an ad-hoc re-sign.
- **Third-party notices** for desktop builds: Bun's LGPL components, Electrobun binaries, Shiki
  grammars, and the provenance of `packages/ui`'s WebGPU shader and dither code.
- **Review the public tree** for internal material and run a secret scan before publishing.
