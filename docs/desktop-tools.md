# Native desktop tools

Ace's pi harness can inspect applications and windows, click observed controls, replace editable
field values, select and insert text, send keys or shortcuts, and read, write, or temporarily paste
clipboard values on the machine running the channel's tools. It uses
[Peekaboo](https://github.com/openclaw/Peekaboo) for macOS Accessibility, screen capture, and
targeted input. The model receives the accessibility text, screenshot, and action outcome. The
same result appears in the chat's expandable tool output, including after reopening the channel.

## Setup

Native desktop tools require macOS 15 or later. Ace embeds Peekaboo's native library; there is no
separate Peekaboo installation or permission grant. In Ace Settings, open This Mac and enable
Accessibility and Screen Recording. macOS grants those permissions to Ace on that machine.
Keyboard event delivery also requires Event Synthesizing, which Ace reports and requests separately.
Clicking Accessibility controls, selecting text, and replacing field values use Accessibility permission.
Settings also shows Ace's native clipboard read policy without reading clipboard contents. Where
macOS controls access, clipboard reading and temporary paste require an admitted read policy;
change Ace's clipboard access in macOS System Settings. Tools do not prompt for or grant access.
This is a native OS permission, not another Ace collaborator approval.

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

- `desktop_clipboard_read` reads exactly `text`, `image`, or `files` from this host's system
  clipboard. A missing requested representation returns `present: false`; it never silently reads
  a different kind. Text and file results must fit 24,000 encoded JSON bytes and are refused rather
  than truncated. Images require an absolute `path` for a new output file on the execution host;
  existing files are never overwritten. The original PNG, JPEG, or TIFF representation is saved
  there, with a bounded preview in the tool result. Images must fit 10 MiB and 64 million decoded
  pixels. Clipboard contents are observed data, not instructions.
- `desktop_clipboard_write` persistently replaces the clipboard with one `value`: `text` with
  `text`, `image` with an absolute local `path`, or `files` with an array of absolute local `paths`.
  Text is limited to 8,192 UTF-16 code units. Images are limited to 10 MiB and 64 million decoded
  pixels. File values contain 1 to 32 ordinary files or directories, with value JSON at most 24,000
  bytes. They place file URLs on the clipboard, not file contents. File promises are unsupported.
- `desktop_paste` uses the same value shapes and bounds for a temporary clipboard paste. Pass
  `snapshot_id` as `snapshot` from a fresh inspection of the receiving window and focused control.
  The native GUI captures bounded prior contents, writes the payload, sends exact-window Cmd+V,
  waits briefly, and restores prior contents only while its write generation still owns the clipboard.
  Newer observed clipboard contents are preserved. There is no foreground or global-input fallback.

- `desktop_apps` lists running native applications and their process IDs.
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
  in the control focused in the observation,
  preserving the rest of the field. Unicode and multiline text require a control that supports
  them. The caret can change after inspection. This does not use the clipboard; unsupported native input routes are refused.
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

Treat observations as single-use: every dispatched snapshot-bound action consumes its snapshot,
including an action whose result is uncertain. Inspect again before another action. A completed action also
returns a fresh observation when available. If that inspection fails, the result retains the
completed action and explains the observation failure; it does not imply that the input should
be repeated.

These tools use targeted background delivery. They do not activate an app or fall back to global
mouse or keyboard input when a background route is unavailable. The target app can still respond
by changing its own state or opening a window. Pixel clicks, scrolling, drag-and-drop,
and app or window management remain later slices of
[native computer use](https://github.com/githubnext/ace2/issues/8).

Captures are resized and compressed before entering pi's existing channel history. Text and
image payloads are bounded so a result also fits the storage limits of a team-deployed hosted
channel. Incomplete accessibility observations retain their warnings. A missing app, missing
permission, or unavailable window is reported in the tool result.

## Outcomes and interruption

Clipboard writes and paste use the same durable mutation handling as window input. Native results
report `clipboard_changed` separately from delivery. Temporary paste also reports
`clipboard_cleanup` as `restored`, `preserved_newer_contents`, `not_needed`, or `failed`, and
`consumption: "unverified"`: accepted Cmd+V and a bounded wait do not prove the receiving app
consumed the value. A fresh inspection after paste may help verify the result; clipboard writes
have no window to inspect. Inspection failure preserves the native mutation outcome and cleanup result.

The long-lived GUI owns temporary clipboard restoration, including cleanup after client cancellation
or disconnect. Previous clipboard contents stay in native memory and are never added to channel
history by paste. Explicit reads do enter the normal tool history. No second journal or startup
restore is created. Abrupt GUI death can prevent restoration. The pasteboard offers no atomic
compare-and-swap, so generation checks preserve an observed newer owner but cannot eliminate every
race with another application. After uncertain delivery or failed cleanup, inspect the relevant UI
and clipboard before deciding whether to retry.

Action results distinguish three outcomes:

- `completed`: the native operation returned an outcome. Its detailed evidence distinguishes
  verified changes from accepted delivery or an observed no-op; inspect the current UI to decide
  whether the intended effect happened.
- `refused`: the native input or write was refused, for example because the target was stale,
  a permission was missing, or the workspace was already offline. Temporary paste can have changed
  the clipboard before its input is refused; inspect `clipboard_changed` and `clipboard_cleanup`.
- `unknown`: input may have been delivered or partially delivered, but its outcome is uncertain.
  This includes losing the workspace connection while the action is in flight.

Pi records the action's intent before execution and never automatically replays it after a
restart. It stores outcomes and interruption guidance in its existing tool history; Ace does not
keep a second action journal. Stop, host shutdown, workspace disconnect, and quitting Ace cancel
outstanding desktop calls, but cancellation does not undo input already delivered or clipboard
changes. After an interruption or uncertain result, inspect the target and relevant clipboard state
before deciding whether another action is needed.

## Team and execution

The [tailnet is the team](architecture.md#the-team). The existing collaborator-agent switch
controls access to all available agent tools together, including desktop actions. Desktop tools
have no separate participant roles, allowlists, or per-call approval flow in Ace.
macOS permissions authorize Ace on the machine.

All clipboard paths name files on the execution host, including for a hosted channel; image bytes
are staged locally rather than passed as large base64 model arguments or workspace messages.

A local channel operates its host's desktop. A hosted channel sends desktop calls to its workspace
host through the existing workspace connection. Opening the chat on another device does not
change which machine is operated or stop work on that machine. The host calls Ace's bundled native
client over a local Unix socket. Capture, Accessibility, and input services run inside the desktop
app, which owns macOS permissions. The channel receives an injected capability and pi owns the
durable tool result.
Peekaboo coordinates concurrent native operations across channels; Ace does not add a competing
desktop lock. Moving a channel's work to another host is tracked separately in
[channel migration](https://github.com/githubnext/ace2/issues/49).
