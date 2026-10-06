# Architecture

Ace is a collaborative coding environment that runs on the team's own machines. Old Ace ran one
process per channel inside a cloud VM; most of its pain was the VM and cloud infrastructure, not
the per-channel process. Ace keeps the process and drops the infrastructure.

Words in this document have the meanings in [terms](terms.md).

Ace is open source software that teams clone, fork, and operate on their own machines and in
their own infrastructure or cloud accounts. Ace will not operate a hosted service. The tailnet
is the sole authority for team membership and collaboration access; see [the team](#the-team).

## Layout

| Path                 | Runs                    | Owns                                                                 |
| -------------------- | ----------------------- | -------------------------------------------------------------------- |
| `packages/channel`   | inside a channel worker | The channel: chats, agents, lanes, and the client protocol types     |
| `apps/host`          | on every machine (Bun)  | The `ace` CLI, channel workers, the channel catalog, local transport |
| `apps/desktop`       | on macOS                | The desktop client and packaging for Ace Helper                      |
| `services/channel`   | Cloudflare Workers      | Hosted channels: one Durable Object per channel                      |
| `services/directory` | Cloudflare Workers      | The team's list of hosts and where each channel lives                |

Clients (the CLI and desktop app) attach to channels; a channel is not a client.

The app's Issues and PRs pages read the selected project's GitHub repository through the host's
GitHub CLI account. A peer can resolve the Git remote of a project already exposed by its channels;
the app's own host performs authenticated GitHub reads. The app caches GitHub responses in
IndexedDB, scoped to its host connection. It refreshes in the background at startup and every
three hours, keeping cached content visible while requests run or fail. GitHub content stays
outside channel history. Issues and PRs share the Channels sidebar and project picker, with
Open, Closed, and All filters in the sidebar. Items open on GitHub; a row's "Open in a channel"
action creates a channel in the selected project and invokes its agent with the item's title and URL.

A channel's details sidebar shows the root chat's changes and branch, the newest pull request from
that branch with its checks, subagents and links from the transcript, and the channel's usage.
The pull request is read through the same GitHub CLI account while the sidebar is open, again when
the branch moves and every minute, and is not cached. A channel can work on many lanes and pull
requests over time; the sidebar follows the chat's current lane.

Avatars come from GitHub logins. Each host resolves its owner's login with `gh api user`, returns
it from `hello` to peers, and publishes it to the directory. The app maps message authors'
Tailscale logins to GitHub avatars and shows initials when no login is known.

## Channel

A channel owns one [pi-durable](https://github.com/earendil-works/pi) Session. A local channel runs
as one worker process over one SQLite file; a hosted channel runs in a team-deployed cell. A chat
is one pi conversation in that Session.

- **Durable state is pi's.** Messages, runs, tool calls, and child chats are pi entries, tasks,
  and conversations. A crash resumes unfinished work from its last checkpoint; tools that are not
  safe to rerun report an interruption to the model instead.
- **The model sees the whole room.** A human message that does not invoke an agent is a pi
  `write`: it enters the transcript without starting a run. Invoking an agent is a pi `input`.
- **Providers are optional until invocation.** Creating a channel or chat, posting human messages,
  and using its workspace require no model or provider credentials. A chat without a model resolves
  its runtime's default on its first invocation: the local host's current preference, or an available
  model on the hosting service. Availability is checked before admitting the input, so a rejected
  invocation queues no work and leaves its draft editable.
- **Model per run.** The chat's model is set when a run is admitted. Changing it while a run is
  active is rejected rather than changing the active run's later turns.
- **Subagents are child chats.** A subagent's chat is owned by the parent's tool task, so killing
  the parent kills the child. Agents in different channels only exchange messages.
- **Lanes are Git worktrees** created by the chat's agent for each unit of work. A chat's working
  directory is its current lane.
- **Kill is durable.** Killing records pi's abort marks before the worker exits, so reopening the
  channel does not resume the killed work.
- **Usage comes from pi's ledger.** A chat reports cumulative model and tool usage from
  `UsageDoc`, including compaction. The app shows input, output, cache tokens, and estimated USD
  at model catalog prices. Reopening the chat reads the same totals; Ace keeps no second ledger.
- **Names and summaries are durable metadata.** The owner can rename a channel. The root chat's
  agent names a randomly named channel and keeps a short summary as work progresses, preserving
  deliberate names unless asked to rename. Metadata lives in a pi session document and is
  projected into host listings. Watch events update open clients; the details sidebar shows the
  full summary. Lane paths and branch prefixes keep the channel's original name.

`packages/channel` must stay runtime-neutral: no `node:*`, `bun:*`, or Workers imports. The host
injects storage, models, and the execution environment. This keeps hosted channels (a channel
inside a Durable Object, with tools served from a team machine) an adapter rather than a rewrite.

Process per channel gives isolation and instant kill, and lets thousands of channels exist as
files: a dormant channel is a closed SQLite file with no process. It is process isolation, not a
security boundary: every worker runs as the host's user and can read the others' files. Agents
have full access to that user's execution environment by design. Collaborator invocation is
controlled by one switch for all available tools.

## Host

`apps/host` keeps channels under `$ACE_HOME/channels/<id>/` (default `~/.local/state/ace`). Each
directory holds `channel.json`, `channel.sqlite`, and the channel's lanes. Clients start a
channel's worker on demand and talk to it over `channel.sock` with newline-delimited JSON. A worker
retires when it has no clients and no live work.

Channel data survives app replacement and upgrades. `ace backup` takes a verified SQLite snapshot
of a local channel while it runs, alongside its catalog record. Project files and lane worktrees
have their own repository backup. Stored format changes require migrations; see [data](data.md).

Opening a folder adds a project to the host's `projects.json`, independently of channel creation
or model credentials. This is a list of local folders, not channel history. Existing catalog
channels also contribute their project paths. Only local owner connections can read or change
the opened-project list; teammates see the project information already present in channel listings.

A channel's project path is the checkout it works in: its agents' working directory and the base
of its lanes. That checkout may be a Git worktree, such as a lane or another tool's worktree. The
host groups every worktree under its repository's main checkout and labels it with the GitHub
remote, so the picker shows one project per repository on a host without rewriting channel
records. Opening a worktree adds its main checkout.

Model credentials come from `ACE_<NAME>`, `<NAME>`, then the OS keychain, for each name pi-ai asks
for, such as `OPENAI_API_KEY`. Agent shells inherit the process environment. Participants allowed
to invoke an agent can use all of its tools, so processes that run tools first move credential-like
variables out of the environment; only the key lookup can read them.

Workers resolve Keychain credentials on each model request, so adding, replacing, or removing a
key through the app or CLI takes effect without restarting workers. Keychain access errors are
distinct from missing keys. Settings exposes provider status and environment overrides, never
stored key values; it validates new keys against the provider before saving them.

The default model for a chat's first agent run is a nonsecret preference in `settings.json` under
`~/Library/Application Support/Ace` on macOS, or `$XDG_CONFIG_HOME/ace` on Linux. The app and CLI
read the same preference; `ACE_MODEL` and an explicit per-channel model still take precedence.
Existing chats keep their chosen model. Adding credentials later makes an unconfigured channel's
agent available without recreating the channel or restarting its worker.

Host configuration is captured before credential cleanup. A worker receives the host's launch
environment, then seals credentials again before running tools. Source workers disable automatic
`.env` loading, so an unrelated working directory cannot change their credentials or configuration.

Stopping the host closes listeners and workspace links, then closes active local workers and their
tool processes without writing durable abort marks. Shutdown identifies workers through their live
Unix sockets; a stale PID file must never cause an unrelated process to be signaled or a dormant
worker to start. A receipt of suspended worker IDs lets the next host startup resume unfinished
work through pi without waiting for a client to reopen a channel.

### Logs

Every host process writes JSON lines to `$ACE_HOME/logs/<process>.jsonl`: `host` (gateway, peers,
directory, workspace links), `channel-<id>` (one per worker), and `cli`. Each process owns its file,
writes synchronously so the lines before a crash survive, and rotates at 10 MB keeping four files.
`ace logs` merges them in time order and filters by `--channel`, `--trace`, `--level`, `--since`,
and `--grep`; `--follow` tails them.

Ids tie lines together: `channel` and `chat` on everything a channel does, `trace` on each
gateway request as it passes through peer hosts and into a worker, `submission` from a request to
its outcome, and `task` and `call` on model responses and tool calls. Channels log requests, model
responses with usage and provider errors, and tool calls with durations; message text is not
logged, but tool arguments are, clipped to 2,000 characters. `debug` lines (listings, watches,
directory syncs, workspace calls) are written only with `ACE_DEBUG=1`. Hosted services log the same
records to Workers Logs.

## Desktop

One `Ace.app` carries the desktop UI and **Ace Helper**, an independently running host executable.
The helper compiles with Bun 1.4 or newer and dispatches channel workers through the same executable.
The UI keeps Electrobun's bundled Bun version to match its native FFI callbacks. The helper resolves web
assets from its application bundle and writes its log under the channel data directory. Closing a
window or quitting the desktop leaves the helper running; reopening the UI verifies the host's
protocol, data directory, and a fresh proof of ownership before attaching.

The host stores a private owner token in `host.token` with mode 0600. The native UI supplies it only
to its local webview; `ace open` supplies it in a URL fragment that the app immediately removes.
The first WebSocket handshake authenticates with this token and sets an HttpOnly, SameSite cookie
for page reloads. The loopback listener checks Host and Origin, and Settings requests are forbidden
on the tailnet listener, including requests from the owner's other machines. A health challenge
binds discovery to the owner token, listening port, and process before the desktop or CLI opens
the app. As with channels, this does not isolate Ace from tools running as the same OS user.

Local app windows report their current channel and tabs to the host while connected. The owner
can list these windows and rename one tab through the CLI. A rename targets a window, channel,
and tab ID, so switching channels before the request arrives rejects it. The host returns success
after the target window applies the change. Tab names stay in the client's existing layout state;
they do not rename channels, chats, or another participant's tabs. The window registry is transient,
and these operations use the authenticated loopback connection, never a tailnet peer.

On macOS, a bundled LaunchAgent runs Ace Helper as the logged-in user. A small native bridge calls
`SMAppService` to register it after first-launch consent and expose its approval status. Registration
starts the helper immediately and at subsequent logins. A disabled background item is left for the
user to enable in System Settings. The stable service identifier is `dev.ace.desktop.helper`; the
executable and desktop controls are named Ace Helper.
macOS groups the background permission under the parent app's name, Ace.

The desktop owns the native project picker and helper controls. Its webview uses a typed native
bridge, authenticates each request with the owner token, and restricts navigation to the local app
origin. Web links that open a new window go to the default browser. Settings exposes Start, Stop,
and Restart through this bridge, and its controls remain available while the host is disconnected.
Stopping unregisters login hosting until the user enables it again. An authenticated command-line
host can serve the UI, but the desktop does not manage that process as Ace Helper.

Git, shell, Tailscale, and directory diagnostics come from the host through the same local-only
boundary as provider settings. The project picker selects a local Git checkout; project creation
errors remain in the form so the person can fix the path or provider setup.

Agents inspect and operate native windows through an injected desktop capability. The desktop embeds
Peekaboo's native bridge inside Ace's UI process, which owns macOS Accessibility, Screen
Recording, and Event Synthesizing permissions. The host invokes a bundled client over a local Unix socket. The bridge
accepts only the client's exact identifier signed by Ace's team; the client verifies the host's
signing team. Tools expose application and window inventories, observation, element or screenshot
clicks, scrolling, atomic drags, replacement of editable field values, text selection/insertion, and keys or shortcuts. Screenshot
points are normalized and mapped through the snapshot's native capture geometry. Control input uses background delivery bound to a
snapshot's exact process, window, and controls; every dispatched action requires a new observation.
Read-only menu inventory uses signed native responses and application inventories before and after
the read to bind one observed process generation. Its possible native cache and unknown completeness
remain explicit; an optional exact literal title path filters the returned subtree before channel
history without granting input authority. The native traversal still reads the full menu and may
trigger application population callbacks. Native menu traversal is currently
synchronous and can delay GUI responsiveness or cancellation. Menu commands use a separate
literal-array native operation: fresh bounded AX reads select one enabled leaf, followed by one
press without opening ancestors or making a separate activation request; the app or macOS may
bring it forward in response. The signed result binds the original
application generation. Commands targeting the native Ace process itself are unsupported and
refused before input; its menu inventory remains available. Detached AX work retains the existing
process mutation lane until the
actual call returns, including after cancellation; ambiguous native timeout remains unsafe to
repeat. Command delivery is distinct from its application effect, and no automatic follow-up
observation changes that outcome.
Separate activation, quit, close, focus, minimize, restore, move, and resize tools accept generation-bound inventory targets, with exact
window bounds where applicable. The native service revalidates those receipts before dispatch;
activation and focus explicitly change the foreground desktop. Inspection never activates a target
implicitly. App-only action receipts refresh inventories without inventing a selected window.
Normal quit reports completion only after native termination confirmation; an accepted request that
leaves the app running stays uncertain. It never retries, force-quits, or chooses a dialog response.
Exact-window close selects one supported background Accessibility route before input and never
falls through after dispatch. Confirmed disappearance survives later inventory failure; an accepted
close that remains open is uncertain with unsafe retry and fresh inventory when available.
Explicit launch accepts an absolute app path or bundle ID and deliberately requests foreground
launch/readiness through the native global mutation lane. The signed response binds the selector
to the resulting process generation; later inventory failure preserves that result. Launch exposes
no document/URL, extra-instance, or relaunch options. The app may still open after caller timeout
or interruption, so uncertain launch is never replayed and native ownership lasts until it settles.
Minimize verifies native window state and returns fresh inventory without capturing the minimized
window; restoring it remains an explicit action with a refreshed target.
Move and resize use native background Accessibility, verify resulting geometry, and return refreshed
window targets; the original bounds remain part of the pre-mutation identity check.
Literal insertion uses one GUI-owned temporary plain-text paste, with the existing native mutation
lane and clipboard transaction gate held through delivery and cleanup. The GUI preserves bounded
prior clipboard contents privately and restores them only when no paste key was sent or the expected
edit was observed in the same control. Uncertain consumption leaves the replacement or preserves newer contents; no
restore journal or automatic retry is created. Clipboard read policy is reported in This Mac.
The same clipboard gate retains a content-free reservation while a dispatched paste is unresolved.
Later automated writes require observed consumption or termination of the exact receiver process
generation. The reservation survives GUI restart; clipboard contents and comparison state do not.
Explicit clipboard tools read complete bounded plain text, an image preview, or advertised local
file references, or persistently replace text or an image; they do not paste. Reads use the existing silent permission policy and require
a stable generation, without entering or releasing the mutation gate. The GUI copies one bounded
image representation, renders an oriented preview off its main actor, and verifies the generation
again. Source and preview metadata stay distinct; the bounded preview uses the existing image
result and durable history without clipboard files or a second store. File reads return exact
advertised URLs and decoded paths without filesystem access; macOS may filter references before
exposing them to Ace. Image writes take an execution-host path: the host alone reads a bounded
regular file, and the GUI decodes its immutable copy before publishing the original representation.
Only source metadata is returned. Writes enter the same gate,
including pending-paste admission, and expose content-free native outcomes without window inspection.
Explicitly read content enters ordinary tool history as observed data; no permission layer is added.
Pi records their intent and never automatically replays an interrupted action. Results distinguish
completed operations, refusals before dispatch, and uncertain delivery. The host bounds
accessibility text and resizes screenshots before returning them. Explicit pixel inspection preserves
exact-target capture checks without publishing action authority; failed observations retain their
error and report later target availability when it can be read. Quitting Ace stops desktop tools;
Ace Helper can keep channels running. Hosted channels forward the capability to their workspace.
Pi stores the result; channel clients project its images into the existing tool output. Peekaboo
coordinates concurrent native operations. The collaborator-agent
switch applies to desktop tools with the rest of the agent's tools. See
[native desktop tools](desktop-tools.md) for setup, supported actions, and interruption behavior.

The installed development app uses `dev.ace.desktop.dev`, port 4141, and `~/.local/state/ace-dev`,
keeping it separate from stable and Canary. Its preferences live under `Ace-dev`, and its Keychain
service is `ace-dev`. It is signed locally for `SMAppService`; distribution signing and
notarization are handled by the release pipeline. All development builds share that fixed app
identity and local signing identity, so macOS grants one Ace-dev permission entry. A separate
profile in the signed bundle derives each checkout's port, data, preferences, Keychain service,
native client identifier, and persistent WebKit partition from the checkout path, and only
uses the host that `bun run dev` starts from the same checkout. It never registers Ace Helper.
Source dev builds can run alongside Canary, but must not coexist with a registered installed
Ace-dev helper: macOS can resolve that shared service identity from another dev bundle. The dev runner opens the exact app
through LaunchServices so macOS attributes permission checks to Ace-dev rather than its parent
terminal or coding app, and tracks that instance for shutdown. `ACE_CONFIG_HOME` and
`ACE_KEYCHAIN_SERVICE` can target an isolated profile for other smoke checks. Sparkle checks for updates while Ace is open;
installation explicitly pauses and unregisters the helper before replacing the application. The
relaunched app restores hosting and resumes interrupted workers. See [updates](updates.md) for
the handoff, signed feeds, hosting, and release credentials.

## Hosted channels

Teams deploy `services/channel` to run the same `packages/channel` core in a Durable Object,
one per channel. Hosted describes channel placement, not an Ace-operated service.
The object provides what the host's worker provides locally (single ownership of the store,
isolation, and routing by channel ID) and adds hibernation and placement off any one machine.
pi's portable SQLite core runs on the object's own SQL through `storage.ts`.

A Durable Object has no file system or shell, so a hosted channel's tools run on a **workspace**:
the host that created it. That host dials out to the object and serves each chat's file and shell
calls from its lanes, using the same execution environment as a local worker
(`packages/channel/src/workspace.ts`). The project checkout stays the source of truth. While the
workspace is disconnected, the channel stays reachable for chat, tools report the workspace as
offline, and a call in flight when it drops is reported to the model as failed.

- The workspace socket hibernates, so an idle hosted channel costs nothing while its host stays
  connected. Client sockets carry live pi event streams and keep the object awake.
- An alarm re-wakes the object while a run is active, so an evicted object resumes the run.
- Hosts share the team's secret with the service (`ACE_SECRET` on hosts and Workers) and state each message's author. They verify their own users over the tailnet, so the
  service trusts hosts, not individual people.
- Model keys are Worker secrets.

## Shared services

Shared state that must outlive any one machine lives in cells: Durable Objects deployed to
the team's Cloudflare account, or celld on a team machine. The team deploys and operates these
services. Each service is named for its job.

`services/directory` holds the team's hosts and where each channel lives. Every host publishes its
whole channel set on each change and every 30 seconds, then reads everyone's. It answers lookups
only: channel traffic goes to the channel's host over the tailnet, or to the hosted channel. So a
channel stays listed while its host is asleep. The app shows a local channel whose host is
unreachable as offline, and reaches a hosted channel directly. Hosts find the directory through
`ace directory <url>` and authenticate with the team's `ACE_SECRET`.

Lobbies (presence, notifications) are not built.

## The team

The tailnet is the team and the sole authority for team membership and collaboration access.
Its identities and access rules decide which people and machines can reach each other. Ace has
no separate accounts, invitations, roles, or team access controls. Every human author is a
Tailscale login, so a person is the same participant on every host.

The channel owner can turn collaborator agent invocation on or off with `ace share <channel> on|off`.
This is one switch for all of the agent's available tools, including native desktop tools when
supported. It prevents new collaborator invocations; active work continues until stopped or
killed. There are no separate per-tool grants or approval policies within a channel.

Local owner tokens and browser-origin checks authenticate local connections. Team-deployed
services use `ACE_SECRET` to authenticate hosts and trust the participant identities those hosts
supply; the services do not check tailnet membership themselves. These mechanisms carry the
team's existing trust and do not define another way for a participant to join the team.

Each host's gateway serves its owner's app over loopback. Its tailnet listeners name each caller
with `tailscale whois` and accept peer hosts or the owner's browser from an allowed origin.
Teammates use their own host to reach shared channels. Local-only settings remain on loopback.
Hosts find online, untagged peers through `tailscale status`. A host shows its app every peer's
channels and proxies their requests; the peer that runs a channel stamps every author. Only a
channel's host creates it; only the host's owner, from any of their machines, archives, deletes,
or kills.

## Not yet built

Terminals and previews, attachments, lobby cells, and external harnesses (Claude Code, Codex).
Hosted channels cannot message other channels yet. Projects are still keyed by a host's main
checkout, so a teammate's checkout of the same repository shows as a separate project.
