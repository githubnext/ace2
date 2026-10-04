# TODO

The single tracker for Ace. No GitHub issues: add, reorder, and remove items here, in the same
commit as the work when possible. Order within a section is priority.

## Before dogfooding

Dogfooding means everyone who works on Ace does all Ace development in Ace. If Ace ships a
surface (channels, diffs, terminals), use Ace's. When something forces another tool, the PR says
so (see [the PR template](.github/pull_request_template.md)) and the gap goes here.

- **Native UI inspection from a channel.** Exercise the desktop window and macOS dialogs while
  developing Ace. The desktop lane used Codex's computer-use tools because Ace's channel tools
  cannot inspect or operate native UI yet.
- **External harness handoff.** Bring an existing Codex run into a channel. The Issues/PRs and
  helper tool lookup work began in Codex, which Ace does not yet run as a harness: edits stayed
  there, while type checks, lint, and builds ran through an Ace terminal. Browser inspection
  required Codex's computer-use tools. GitHub smoke checks and React Doctor also ran from Codex.
- **Two machines on the tailnet** with the dogfooding team. The old repo's equivalent worked;
  confirm this one does.

## During dogfooding

Driven by what the team hits. Known so far:

- **Teammates' terminals**: terminals are owner-only and don't reach peers' or hosted channels'
  workspaces through the gateway.
- **Notify when an agent finishes.**
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

## Port from old Ace

Features the original Ace (githubnext/ace) had that this one doesn't yet. Plan and Document tabs
are deliberately left out.

- **Several chats in the UI**: the channel view is fixed to chat 1; start another chat and open
  a subagent's chat.
- **Git actions in the UI**: commit, push, publish, merge, rebase, Create PR (`CreatePrMenu` is
  unused), PR review and state, and the lane's git state.
- **Questions**: an agent tool that asks the room and waits on a question card (`Question` in
  `@ace/ui` is unused).
- **File tab**: a file tree with open, edit, save, create, and delete (`FileTree` and `FileView`
  are unused).
- **Channel names**: rename a channel, and let the agent name it and keep a rolling summary.
- **Queued messages**: edit, delete, or steer a message waiting on a busy chat.
- **Edit, delete, and react to messages**: the timeline accepts `onEdit`, `onDelete`, and
  `onReact`, but the app passes none.
- **Non-image uploads** in the composer.
- **Skills and custom agents in the composer**: list the checkout's skills and agents for people
  to pick.
- **Work items**: issue and PR pickers when starting work, `ace://` links, and taking over an
  existing branch or PR.
- **CI tools**: PR checks, workflow runs and logs, rerun, cancel, dispatch, and fix failing
  checks.
- **Issue and PR tools**: create, comment, label, update, and review. Agents can use `gh` from
  the shell today.
- **Command palette and switchers**: channels, tabs, and actions (`CommandPalette` is unused).
- **Pinned channels**: the sidebar hardcodes `pinned: false`.
- **Fork a channel.**
- **Channel info dialog.**
- **Typing and who's here** inside a chat (`Facepile` and `TypingDots` are unused); lobbies cover
  presence across a project.
- **Dashboard**: briefing, pick back up, and team pulse.
- **Sounds and window glow** for attention, beyond notifying when an agent finishes.
- **Dictation** in the composer (`useMic` is unused).

## Release

- **First desktop release.** Canary 0.0.7 is published; verify an upgrade on another Mac.
  Move to a custom download domain before wider stable distribution. Desktop builds use the
  original green Ace icon, with a yellow version for canary. The 0.0.6 canary app and DMG were
  built from an Ace channel in CI and passed Apple notarization; native Settings, helper startup,
  channel creation, and human chat passed from `/Applications`. Credentials are backed up in 1Password
  and configured in both GitHub release environments. See [updates](docs/updates.md) for the
  release procedure and the earlier checks that resumed real model work after updates.
  Provider setup waits until agent invocation. Creation and human chat passed without credentials
  on local, hosted, and packaged runtimes; a retained draft succeeded after adding a real key to
  the local host. Existing channel history survived the installed-app upgrade.
- **Third-party notices** for desktop builds: Bun's LGPL components, Electrobun binaries, Shiki
  grammars, and the provenance of `packages/ui`'s WebGPU shader and dither code.
- **Review the public tree** for internal material and run a secret scan before publishing.
