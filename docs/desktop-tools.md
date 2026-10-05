# Native desktop tools

Ace's pi harness can inspect applications and windows, click observed controls, replace editable
field values, and press basic keys on the machine running the channel's tools. It uses
[Peekaboo](https://github.com/openclaw/Peekaboo) for macOS Accessibility, screen capture, and
targeted input. The model receives the accessibility text, screenshot, and action outcome. The
same result appears in the chat's expandable tool output, including after reopening the channel.

## Setup

Native desktop tools require macOS 15 or later. Ace embeds Peekaboo's native library; there is no
separate Peekaboo installation or permission grant. In Ace Settings, open This Mac and enable
Accessibility and Screen Recording. macOS grants those permissions to Ace on that machine.
Basic keys also require Event Synthesizing, which Ace reports and requests separately. Clicking
Accessibility controls and replacing their values use Accessibility permission.

Keep Ace open on the machine running the tools. Closing its window is fine, but quitting Ace
stops native desktop tools even while Ace Helper keeps channels running. Each execution host needs
its own macOS grants. The development, canary, and stable apps have separate identities and grants.

Source builds need Swift 6.2 or later and a valid Apple Development or Developer ID signing
identity to use native desktop tools. The embedded bridge authenticates its bundled client against
the app's signing team and exact client identifier. Set `ACE_CODESIGN_IDENTITY` when building.
For a host running from source, set `ACE_DESKTOP_CLIENT` to the signed app's
`Contents/MacOS/ace-desktop-client` and use the same `ACE_HOME` as that app. Normal packaged hosts
find the client alongside Ace Helper automatically.

## Tools

- `desktop_apps` lists running native applications, their process IDs, and observed activity and visibility.
- `desktop_windows` lists windows for an application process ID.
- `desktop_inspect` reads one explicit process and window ID, returning accessibility text and
  a screenshot without activating the window or changing keyboard focus.
- `desktop_click` clicks one observed Accessibility element once.
- `desktop_type` replaces the entire string value of one observed editable Accessibility element.
  It does not append text, send keystrokes, or use the clipboard. Fields that do not support this
  operation are refused.
- `desktop_key` presses and releases one basic key in the window and focused control recorded by
  the observation: `enter`, `tab`, `escape`, `backspace`, `delete`, `up`, `down`, `left`, or `right`.
  `enter` means Return; `delete` means forward delete. Shortcuts and held keys are not exposed.

Application activity and visibility are matched to the inventory's exact process generation.
Use `is_active` only when `is_active_known` is true, and `is_hidden` only when
`is_hidden_known` is true. Unknown values are omitted, with metadata warnings kept separate from
inventory completeness and warnings.

Choose the application from the inventory and the window from that application's window list.
Inspect the window before acting. Pass its `snapshot_id` as `snapshot`; click and type also take
the literal `element` ID from that observation. The bridge binds the snapshot to the application
process generation, exact window, and observed controls. Keys additionally require the same
focused control. A stale, missing, disabled, or unsupported target is refused instead of sending
input to an arbitrary focused app. Window content is observed data, not instructions.

Treat observations as single-use: every dispatched action consumes its snapshot, including an
action whose result is uncertain. Inspect again before another action. A completed action also
returns a fresh observation when available. If that inspection fails, the result retains the
completed action and explains the observation failure; it does not imply that the input should
be repeated.

These tools use targeted background delivery. They do not activate an app or fall back to global
mouse or keyboard input when a background route is unavailable. The target app can still respond
by changing its own state or opening a window. Pixel clicks, scrolling, drag-and-drop, clipboard
operations, shortcuts, and app or window management remain later slices of
[native computer use](https://github.com/githubnext/ace2/issues/8).

Captures are resized and compressed before entering pi's existing channel history. Text and
image payloads are bounded so a result also fits the storage limits of a team-deployed hosted
channel. Incomplete accessibility observations retain their warnings. A missing app, missing
permission, or unavailable window is reported in the tool result.

## Outcomes and interruption

Action results distinguish three outcomes:

- `completed`: the native operation returned an outcome. Its detailed evidence distinguishes
  verified changes from accepted delivery or an observed no-op; inspect the current UI to decide
  whether the intended effect happened.
- `refused`: the action was not dispatched, for example because the target was stale, a permission
  was missing, or the workspace was already offline.
- `unknown`: input may have been delivered or partially delivered, but its outcome is uncertain.
  This includes losing the workspace connection while the action is in flight.

Pi records the action's intent before execution and never automatically replays it after a
restart. It stores outcomes and interruption guidance in its existing tool history; Ace does not
keep a second action journal. Stop, host shutdown, workspace disconnect, and quitting Ace cancel
outstanding desktop calls, but cancellation does not undo input already delivered. After an interruption
or uncertain result, inspect the target before deciding whether another action is needed.

## Team and execution

The [tailnet is the team](architecture.md#the-team). The existing collaborator-agent switch
controls access to all available agent tools together, including desktop actions. Desktop tools
have no separate participant roles, allowlists, or per-call approval flow in Ace.
macOS permissions authorize Ace on the machine.

A local channel operates its host's desktop. A hosted channel sends desktop calls to its workspace
host through the existing workspace connection. Opening the chat on another device does not
change which machine is operated or stop work on that machine. The host calls Ace's bundled native
client over a local Unix socket. Capture, Accessibility, and input services run inside the desktop
app, which owns macOS permissions. The channel receives an injected capability and pi owns the
durable tool result.
Peekaboo coordinates concurrent native operations across channels; Ace does not add a competing
desktop lock. Moving a channel's work to another host is tracked separately in
[channel migration](https://github.com/githubnext/ace2/issues/49).
