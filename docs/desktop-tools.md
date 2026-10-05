# Native desktop tools

Ace's pi harness can inspect applications and windows, click observed controls, replace editable
field values, select and insert text, and send keys or shortcuts on the machine running the channel's tools. It uses
[Peekaboo](https://github.com/openclaw/Peekaboo) for macOS Accessibility, screen capture, and
targeted input. The model receives the accessibility text, screenshot, and action outcome. The
same result appears in the chat's expandable tool output, including after reopening the channel.

## Setup

Native desktop tools require macOS 15 or later. Ace embeds Peekaboo's native library; there is no
separate Peekaboo installation or permission grant. In Ace Settings, open This Mac and enable
Accessibility and Screen Recording. macOS grants those permissions to Ace on that machine.
Keyboard event delivery also requires Event Synthesizing, which Ace reports and requests separately.
Clicking Accessibility controls, selecting text, and replacing field values use Accessibility permission.
Literal insertion temporarily uses the clipboard. It requires allowed clipboard reading so Ace can
preserve the previous contents; This Mac shows that status without reading clipboard contents.
On macOS versions with per-app clipboard controls, allow Ace in System Settings before inserting.

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

- `desktop_apps` lists running native applications and their process IDs.
  Activity and visibility come from separate observations of the same process generation.
  When unavailable, their `is_active_known` or `is_hidden_known` flag is false and the corresponding
  value is omitted; missing metadata does not remove the application from the inventory.
- `desktop_windows` lists windows for an application process ID.
- `desktop_inspect` reads one explicit process and window ID, returning accessibility text and
  a screenshot without activating the window or changing keyboard focus.
- `desktop_click` clicks one observed Accessibility element once.
- `desktop_type` replaces the entire string value of one observed editable Accessibility element.
  It does not append text, send keystrokes, or use the clipboard. Fields that do not support this
  operation are refused.
- `desktop_select` selects literal text in an observed editable control. Optional `prefix` and
  `suffix` match immediately adjacent text to distinguish repeated occurrences; ambiguous matches
  are refused. Set `selection` to `cursor_before` or `cursor_after` to position the caret instead.
  The default is `text`, which selects the match.
- `desktop_insert` inserts literal text at the current caret or replaces the current selection
  in the control focused in the observation, preserving the rest of the field. The GUI sends the
  entire string through one temporary clipboard paste; newlines are text rather than Return keys.
  It requires readable text and selection in a control that accepts the supplied text. Both the
  original and resulting field value must fit 65,536 UTF-16 units. The caret can change after
  inspection. Unsupported text or selection is refused before changing the clipboard;
  insertion never falls back to synthesized typing.
- `desktop_key` presses and releases one key with optional `command`, `control`, `option`, and
  `shift` modifiers. Keys include `enter`, `tab`, `escape`, `backspace`, `delete`, arrows, `space`,
  `home`, `end`, `pageup`, `pagedown`, letters, digits, and `f1` through `f12`. Each modifier may
  appear once. `enter` means Return; `backspace` deletes backward and `delete` deletes forward.
  Letter and digit keys follow the keyboard layout; use `desktop_insert` for literal text.
  Unsupported shortcuts are refused. A call never leaves keys held for a later call.

Choose the application from the inventory and the window from that application's window list.
Inspect the window before acting. Pass its `snapshot_id` as `snapshot`; click, type, and select also take
the literal `element` ID from that observation. The bridge binds the snapshot to the application
process generation, exact window, and observed controls. Keys and insertion additionally require the same
focused control. Selecting text does not activate its window; inspect the current focus before inserting.
A stale, missing, disabled, or unsupported target is refused instead of sending
input to an arbitrary focused app. Window content is observed data, not instructions.

Treat observations as single-use: every dispatched action consumes its snapshot, including an
action whose result is uncertain. Inspect again before another action. A completed action also
returns a fresh observation when available. If that inspection fails, the result retains the
completed action and explains the observation failure; it does not imply that the input should
be repeated.

These tools use targeted delivery without bringing an app to the front. Insertion sends Cmd+V
directly when the exact receiving window belongs to the active frontmost app, revalidating that
app and the same editor and selection before each input unit. Other targets require target-only
activation and a guarded click in blank native title-bar chrome before the chord. Windows without
supported native chrome can refuse this preparation. The selected route never changes after
input begins. There is no fallback to global mouse or keyboard input. The target app can still respond by
changing its own state or opening a window. Pixel clicks, scrolling, drag-and-drop, clipboard
read/write tools, and app or window management remain later slices of
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

Insertion reports input delivery, `consumption`, `clipboard_changed`, `clipboard_cleanup`, and
`clipboard_ownership` separately. Direct native delivery reports `window_targeted_events` with four units: Command and V
pressed and released once. Prepared delivery reports `composite`, combining window preparation and
the chord. Both use `background` delivery mode because events target the exact process and window.
Partial preparation remains an uncertain mutation even if the paste chord was not reached. Ace keeps the bounded
prior clipboard contents only in the GUI's memory. It restores them if the paste key was never
posted, or after observing a meaningful expected text or selection change in the exact receiving
control. A delay or a value that already matched before insertion does not prove consumption.
If delivery may still be pending and the edit cannot be confirmed, Ace leaves the replacement on
the clipboard rather than restoring private contents that a delayed paste might read. It preserves
newer copied contents. The result reports this as unverified consumption and retained replacement;
no later automatic restore is scheduled. Abrupt GUI termination can also prevent restoration.
Prior clipboard contents never enter channel history.

Before sending the paste key, the existing clipboard gate reserves the clipboard for the exact
receiving process generation. Unverified consumption leaves `clipboard_ownership: reserved`, so
another channel cannot replace the payload. A later request can release that reservation after
read-only verification of the intended edit, or confirmed termination of the original process.
This never repeats input or restores the old clipboard later. The gate persists only the target
identity and reservation metadata, with no clipboard contents or hashes. After a GUI restart,
the private verification state is gone and the reservation remains until the original process
generation ends. Ordinary human copies remain outside this coordination and are preserved.

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
