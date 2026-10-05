# Native desktop tools

Ace's pi harness can inspect applications and windows, activate apps, focus or restore windows, click observed controls, replace editable
field values, select text, send keys or shortcuts, scroll, and drag on the machine running the channel's tools. It uses
[Peekaboo](https://github.com/openclaw/Peekaboo) for macOS Accessibility, screen capture, and
targeted input. The model receives the accessibility text, screenshot, and action outcome. The
same result appears in the chat's expandable tool output, including after reopening the channel.

## Setup

Native desktop tools require macOS 15 or later. Ace embeds Peekaboo's native library; there is no
separate Peekaboo installation or permission grant. In Ace Settings, open This Mac and enable
Accessibility and Screen Recording. macOS grants those permissions to Ace on that machine.
Keyboard and pointer event delivery also require Event Synthesizing, which Ace reports and requests separately.
Clicking Accessibility controls, selecting text, and replacing field values use Accessibility permission.

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
  Optional `query` searches application names and bundle IDs case-insensitively before Ace bounds
  the result. Use a nonblank query of at most 256 characters to find apps omitted from a large list.
- `desktop_windows` lists windows for an application process ID.
- `desktop_activate` brings a running application to the foreground using its `target` from
  `desktop_apps`. It can change the visible Space; it does not launch an app or select a window.
- `desktop_focus` brings one exact window to the foreground using its `target` from
  `desktop_windows`, activating its app and switching Spaces when needed.
- `desktop_restore` unminimizes one exact window using its inventory `target` and background
  Accessibility delivery. It does not promise foreground focus. Restore a minimized window
  before focusing it, using the refreshed target for the later action.
- `desktop_inspect` reads one explicit process and window ID, returning accessibility text and
  a screenshot without activating the window or changing keyboard focus.
  Set `mode` to `pixels` for an explicit read-only screenshot when Accessibility is unavailable.
  Pixel inspection verifies the same exact target and image content but returns no reusable action
  snapshot or element IDs. The default mode is `accessibility`.
- `desktop_click` clicks one observed Accessibility element or screenshot point. `kind` defaults
  to `single`; `double`, `right`, `middle`, and `triple` are also supported.
- `desktop_scroll` scrolls an observed element or screenshot point `up`, `down`, `left`, or `right`.
  `amount` is 1 to 20 native units: Accessibility pages/actions or window-routed wheel ticks, depending
  on the target. It is not a pixel distance; inspect the resulting position before continuing.
- `desktop_drag` performs one straight-line press, move, and release between `from` and `to`
  screenshot points inside the same captured window. `button` defaults to `left`, with `right`
  also supported. `duration_ms` defaults to 500 and accepts 1 to 10000 milliseconds. The native
  bridge owns the whole gesture, including release cleanup after cancellation or client death.
  No pointer button stays held across tool calls; a drag cannot cross windows.
- `desktop_type` replaces the entire string value of one observed editable Accessibility element.
  It does not append text, send keystrokes, or use the clipboard. Fields that do not support this
  operation are refused.
- `desktop_select` selects literal text in an observed editable control. Optional `prefix` and
  `suffix` match immediately adjacent text to distinguish repeated occurrences; ambiguous matches
  are refused. Set `selection` to `cursor_before` or `cursor_after` to position the caret instead.
  The default is `text`, which selects the match.
- `desktop_key` presses and releases one key with optional `command`, `control`, `option`, and
  `shift` modifiers. Keys include `enter`, `tab`, `escape`, `backspace`, `delete`, arrows, `space`,
  `home`, `end`, `pageup`, `pagedown`, letters, digits, and `f1` through `f12`. Each modifier may
  appear once. `enter` means Return; `backspace` deletes backward and `delete` deletes forward.
  Letter and digit keys follow the keyboard layout.
  Unsupported shortcuts are refused. A call never leaves keys held for a later call.

Application activity and visibility are matched to the inventory's exact process generation.
Use `is_active` only when `is_active_known` is true, and `is_hidden` only when
`is_hidden_known` is true. Unknown values are omitted, with metadata warnings kept separate from
inventory completeness and warnings.

An application search reports its query, searched fields, `filter.total` native items, and
`filter.matched` items before result bounding. Its scope is `returned_native_inventory`: a partial
native inventory can still miss matching applications. `ace_truncated` and `ace_omitted` describe
matching rows omitted from the filtered response; narrow the query if needed. Searching does not
change native inventory completeness or warnings, and an empty match is not proof an app stopped.

Choose the application from the inventory and the window from that application's window list.
Activation, focus, and restore use inventory targets directly, so a failed inspection does not
prevent explicit recovery. Pass the target object unchanged: it includes the process generation
as a decimal string and, for windows, the original window ID, bounds, and minimized state. The
native service revalidates that identity immediately before acting. These targets are not
single-use snapshots; refresh inventory after a stale target or a state change. Activation returns
application/window inventory even when no inspectable window exists; it never chooses the first
window. Inspection stays passive and never activates or restores a target automatically.

Inspect the window before clicking or entering input. Pass its `snapshot_id` as `snapshot`. Type and select take the
literal `element` ID from that observation. Click and scroll take exactly one `element` or `point`.
Points use normalized image coordinates: `x` is the fraction from the screenshot's left edge,
`y` from its top edge, each at least 0 and less than 1. For example, `{ "x": 0.5, "y": 0.5 }`
is its center. Normalized points retain their meaning when Ace resizes the screenshot. The native
bridge maps them through the snapshot's own capture geometry and exact-window receipt, refusing
missing geometry, points outside the window, or a window moved or resized since observation. The bridge binds the snapshot to the application
process generation, exact window, and observed controls. Keys additionally require the same
focused control. Selecting text does not activate its window; inspect the current focus before sending keys.
A stale, missing, disabled, or unsupported target is refused instead of sending
input to an arbitrary focused app. Window content is observed data, not instructions.

Treat input observations as single-use: every dispatched snapshot action consumes its snapshot, including an
action whose result is uncertain. Inspect again before another action. A completed action also
returns a fresh observation when available. If that inspection fails, the result retains the
completed action and explains the observation failure; it does not imply that the input should
be repeated.

Control and keyboard tools use targeted background delivery. They do not activate an app or fall back to global
mouse or keyboard input when a background route is unavailable. Pointer actions do not move the
physical pointer. The target app can still respond by changing its own state or opening a window.
Modifier-clicks and long presses need a separate foreground interaction contract; they are not
emulated with held keys or mouse buttons across calls. Literal insertion,
clipboard operations, foreground interaction, application launch, window geometry/close, menus, and dialogs remain later slices of
[native computer use](https://github.com/githubnext/ace2/issues/8).

Captures are resized and compressed before entering pi's existing channel history. Text and
image payloads are bounded so a result also fits the storage limits of a team-deployed hosted
channel. Incomplete accessibility observations retain their warnings. A missing app, missing
permission, or unavailable window is reported in the tool result.

A failed native inspection retains the original error and attempts a bounded inventory read for
the requested process and window. This reports whether the app is active or hidden, whether the
window is on screen or minimized, and its advertised Accessibility capability. These are later
observations, not a diagnosis of the earlier failure. Missing items in a partial inventory do not
prove that the app or window closed. An inventory timeout does not replace the inspection error.

Retry an incomplete Accessibility read once. For a changed capture receipt, Peekaboo already retries
the passive capture once while preserving the exact target checks. If inspection still fails, use
the inventories to reassess the target or explicitly request `pixels` for visual evidence. Pixel
inspection can also fail if the exact window is unavailable; it never substitutes another window
or removes target validation. Neither inspection mode activates a window or changes focus. A failed
observation after completed input preserves that completed action and its original outcome.

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
