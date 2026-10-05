# Desktop plan

Ship one `Ace.app` with a desktop client and an independent background host named **Ace Helper**.
The app carries its runtimes; opening it from Finder requires neither a source checkout nor an
`.env` file. Channel workers and pi's durable storage keep their existing ownership.

## Project and navigation contract

Keep the existing Ace shell and shared UI components. The left navigation has Dashboard and
Channels; native window controls have their own space above it. Cmd+O opens a native folder
picker and adds the chosen folder as a project. Opening a project needs no provider key, creates
no channel, and remains available after a restart. Repository import is a later feature.

Dashboard and Channels share the project picker. A dashboard request or New channel creates a
channel in the selected project. Switching projects restores each project's selected channel.
Settings live in the account menu and Cmd+comma. Cmd+B toggles navigation; Cmd+Shift+B toggles the
channel sidebar. Project paths are scoped to their host until repository-based identity lands.

## Process and installation contract

- The desktop connects to Ace Helper. Closing or quitting the desktop leaves hosting available.
- Ace Helper runs as the logged-in user. On macOS, `SMAppService` manages its bundled LaunchAgent.
  The executable and human-facing controls use the name **Ace Helper**; its stable service
  identifier is `dev.ace.desktop.helper`.
  macOS groups its background permission under the parent app's name, **Ace**.
- One worker owns each active channel. Dormant channels remain files, and only pi stores their
  messages, runs, and chats.
- Host shutdown closes workers without durable cancellation. Kill retains its existing meaning.
- Login registration is visible and reversible. A disabled background item must not be silently
  re-enabled. Sleep and logout can take local channels offline.
- CLI and desktop use the same catalog and credentials. Keep `~/.local/state/ace` for channel data;
  store nonsecret preferences under `~/Library/Application Support/Ace` on macOS.
- Resolve application resources from the bundle and keep writable state outside it. Development
  builds have a distinct service identity so they do not replace the installed helper.

## Milestones

1. **Packaged host foundation and Ace Helper.** Resolve runtime configuration before credential
   cleanup; carry configuration and credentials correctly into channel workers; discover Tailscale
   when launched without a terminal; verify host identity before connecting; package the helper
   and its macOS service registration. Validate the helper from an isolated application bundle.
2. **Provider and host settings.** Add provider key entry, validation, replacement, and removal
   using the OS keychain; distinguish missing credentials from denied keychain access; propagate
   changes to running workers. Add nonsecret host preferences shared with the CLI. Restrict local
   settings operations to the owner's authenticated connection.
3. **First-run and lifecycle UX.** Add the project folder picker, tool diagnostics, Tailscale
   status, and background-hosting controls. Handle service approval, reconnect, clean shutdown,
   and restart recovery without requiring a terminal.
4. **Distribution.** Sign and notarize all executables, coordinate updates with the helper and
   workers, and verify access to projects and keychain entries across upgrades. The signing
   pipeline must handle the space in `Ace Helper` when passing executable names and paths.

## Validation

Use real Bun processes, real provider credentials, and isolated channel data. Do not add mocked
providers or a second state store. Check source and packaged worker startup, a real model/tool
run, resource paths containing spaces, and operation without a source checkout or `.env` file.
Verify that unrelated listeners are rejected, owner authentication and origin checks hold, and
the desktop can reconnect to its helper.

Before distribution, verify the signed app from `/Applications` in a clean macOS account: provider
setup, project access, teammate access after the UI exits, login registration and removal, sleep
and wake, and an update with existing channel history. Check **Ace Helper** in Activity Monitor
and Ace's grouped permission in macOS background-item settings.

## Progress

- Created the `desktop` lane on branch `feat/desktop`.
- Implemented the first milestone: a compiled Ace Helper with a bundled LaunchAgent, native
  registration and approval status, host identity checks, bundle-relative resources, preserved
  worker configuration and credentials, and Tailscale discovery outside a terminal.
- The desktop connects to the helper, keeps hosting independent of its window, and exposes
  Ace Helper settings and its log. Development builds use a separate service, port, and catalog.
- Passed repository type and lint checks and built the macOS development app. From a temporary
  app under `/Applications`, registered the real LaunchAgent and completed a real Anthropic
  model and shell-tool run using the existing Keychain credential. An unrelated `.env` containing
  an invalid key did not affect the run, and the tool environment contained no provider key.
- Also verified source workers, explicit credential inheritance into compiled workers, web
  assets at paths containing spaces, rejection of an unrelated listener, and continued hosting
  after the client disconnected. Unregistered and removed the temporary app and channel data.
- Implemented provider Settings for Anthropic and OpenAI: checked saves, connection checks,
  replacement, removal confirmation, and clear missing, overridden, or inaccessible Keychain
  states. A rejected replacement preserves the saved key. Only provider status reaches the UI.
- Removed the credential cache so live workers see new and removed keys on their next model
  request. The app refreshes its model choices after settings changes. Default models persist
  outside the bundle and are shared with `ace model` and new CLI channels.
- Added an owner token, authenticated host discovery, Host and Origin checks, and a local-only
  settings boundary. `ace open` opens the authenticated browser client; provider keys never
  enter URL fragments or browser storage.
- Rejected forged discovery responses, discovery relays from a different port, and settings
  access over a real Tailscale connection even when the peer had the host owner's identity.
- Verified real Anthropic model/tool runs from source and the installed bundle, live-worker key
  updates without a restart, shared CLI preferences, and invalid-key rejection by Anthropic and
  OpenAI. React Doctor reported 100/100 with no issues.
- Checked the packaged UI's invalid-key feedback, saved-key state, connection check, default-model
  selector, Settings shortcut, window reopening, and native background-settings link. Kept the UI
  on Electrobun's bundled Bun to preserve native callback compatibility; the helper independently
  carries Bun 1.4 for SQLite. Confirmed macOS groups the background item under the app's name.
- Replacing the helper in place inside an installed ad-hoc test bundle triggered a macOS launch
  constraint rejection. A later smoke check verified unregistering the old helper and replacing
  the whole bundle with fresh files at the same path: the existing app and service identity,
  projects, and channels survived. Updating the existing Ace-dev install still hit the rejection,
  so fresh files alone do not make ad-hoc upgrades reliable. Development builds accept an
  Apple-issued identity through `ACE_CODESIGN_IDENTITY`. Startup dialogs include the full failure
  message. The signed 0.0.2 update passed authenticated helper startup after refreshing the app's
  LaunchServices registration, preserving the existing channel and both provider Keychain items.
- The final fresh install under `/Applications` passed authenticated startup and native Settings,
  ignored the unrelated `.env`, and kept the helper available after the UI exited. Removed the
  temporary apps, service registrations, Keychain entries, and channel data.
- Rebased the lane onto main's directory and hosted-channel routing changes (`9f4d528`). Preserved
  the shared `ACE_SECRET` lookup, nonsecret host configuration, and offline channel listings.
- Implemented the third milestone: a native project folder picker, inline setup errors, Git and
  shell checks, Tailscale and directory status, and Start, Stop, and Restart controls in This Mac.
  Native controls require the owner token and remain usable while the helper is stopped. The
  desktop distinguishes a source CLI host from its managed helper before changing processes.
- Host shutdown now closes active workers and their tools without cancelling pi's durable work,
  closes hosted workspace links, and stops discovery and directory activity. It identifies live
  workers through their sockets rather than trusting PID files, and leaves dormant channels alone.
- Passed type and lint checks. A real Anthropic run with an active shell tool survived a host
  restart: shutdown removed its worker and tool, and a new worker resumed the run. Also verified
  pending-request cleanup, stale PID safety, and that shutdown does not start dormant workers.
- React Doctor scored the latest changes 92/100, with one control-flow complexity warning in
  the This Mac settings component.
- Ran both shared services in real local Workers. Verified directory publication after credential
  sealing, offline listings, routing to a directory-only hosted channel, and denial of local
  diagnostics to a real tailnet peer.
- From an isolated app under `/Applications`, verified picker cancellation and paths with spaces
  and commas, missing-key and invalid-project feedback, a compiled-worker Anthropic/tool run using
  Keychain, native Settings, Stop/Start/Restart, and transcript recovery. Quit now ends both the UI
  runtime and desktop launcher while Ace Helper stays running.
- Restored the existing Ace navigation and native appearance, window-control placement,
  vibrancy, minimum window size, and title-bar zoom. Replaced the channel-first setup form with
  Cmd+O project opening, a project dashboard, and project-scoped channel selection.
- Project metadata persists independently of channels and credentials. Real source checks
  verified canonical paths, duplicate opening, restart recovery, no implicit channel creation,
  and rejection of project operations and project broadcasts over a real tailnet connection.
- Packaged UI checks covered native Cmd+O, opening projects before provider setup, channel
  creation, project switching, and a real Anthropic shell-tool reply. Fixed a render loop by
  caching object snapshots in the shared local-storage hook.
- Follow-up work is tracked in the [dogfooding](https://github.com/githubnext/ace2/issues/5) and
  [desktop distribution](https://github.com/githubnext/ace2/issues/7) meta issues. Team directory
  configuration and providers beyond Anthropic/OpenAI still use the CLI; directory status in
  Settings is read-only.

## UI testing

Use the development `Ace-dev.app` from `apps/desktop/dist/dev-macos-arm64`, copied to
`/Applications/Ace-dev.app`. It uses port 4141 and its own `ace-dev` catalog and Keychain service,
plus `~/Library/Application Support/Ace-dev` for preferences. Build it with `bun run stage` then
`ACE_BUILD_CHANNEL=dev bunx electrobun build --env=dev` from `apps/desktop`.

For an installed development build, set `ACE_CODESIGN_IDENTITY` to the SHA-1 identity reported by
`security find-identity -v -p codesigning` when building. Use the same valid Apple Development
identity for subsequent builds. The hook signs every native executable and the app with that
identity. Without it, the build uses ad-hoc signing for isolated checks. Apple recommends an
[Apple-issued identity for both the app and helper](https://developer.apple.com/forums/thread/799910)
when testing service management; ad-hoc updates can fail macOS launch constraints.
Increment the desktop package version before distributing another installed build.

On first launch, enable Ace Helper, then press Cmd+O to open a project folder. Verify that the
dashboard opens with no provider key and that opening a folder creates no channel. Add a provider
key in Settings before starting an agent. Check the Dashboard and Channels navigation, project
switching, key validation and replacement, picker cancellation, and starting a channel.
In Settings → This Mac, try restarting the helper, then stopping and starting it. Finally quit
and reopen the app; its channel history should remain available. No `.env` or source checkout is
required to run the installed bundle. This build is signed locally, not notarized for distribution.

When replacing a development install, stop Ace Helper in Settings → This Mac and quit Ace first.
Move the old bundle aside and copy the new bundle into `/Applications` as a complete directory;
do not overwrite executables inside the installed bundle. Start Ace and enable Ace Helper again.
For a scripted copy, refresh the app's LaunchServices registration with
`/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f /Applications/Ace-dev.app`
before registering its helper.
Keep the `ace-dev` data, preferences, and Keychain service. Changing the signing identity may
require approving Keychain access again. Signed distribution updates still need their own
validation.

## Browser development

`ace serve` serves the built app; use `ace open` from another terminal to authenticate a browser.
For Vite, set `ACE_APP_URL=http://127.0.0.1:1111` when running both commands, and run `bun app dev`.
The explicit app URL authorizes that development origin; the Vite proxy rewrites Host to the
local gateway. Desktop builds use their bundled web assets by default.

## Rename a tab from an agent or the CLI

An Ace agent can use its shell tool to discover open local windows and rename a tab. From this
checkout, run:

```sh
bun ace tabs --json
bun ace tab rename <window-id> <channel-id> <tab-id> "Build checks"
```

Choose the intended window and tab from the listing. The channel ID is required because tab IDs
belong to that channel's layout; a request fails if the window has switched channels. The result
contains the updated window after its layout accepts the rename. Names are trimmed and limited
to 80 characters. Pass `""` as the name to restore the tab's default label. The same commands are
available as `ace tabs` and `ace tab rename` when the CLI is on `PATH`.
The Chat tab keeps the channel's name; use `ace rename` to change that name instead.

The commands connect to an already running local host and never start one. Use its `ACE_HOME`
profile and pass `--port <port>` when it differs from `ACE_PORT` or the default 4140. For example,
the installed canary uses `ACE_HOME="$HOME/.local/state/ace-canary"` and `--port 4142`; the development
app uses `ACE_HOME="$HOME/.local/state/ace-dev"` and `--port 4141`. Authentication checks the host's
identity and protocol before connecting. Listing or renaming tabs over the tailnet is unavailable.

Only the explicitly selected window changes live. Names use the existing saved layout for that
channel in the browser profile; another window sharing that profile can load the saved name on
reload, and a later layout save from either window can overwrite the other's saved labels.
Independent window persistence is tracked in [#45](https://github.com/githubnext/ace2/issues/45).
A tab label does not change the channel's durable name or another participant's view.
Closed windows and windows without an open channel do not appear in the listing.
