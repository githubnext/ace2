# Native dependency patches

These patches apply to Peekaboo 4.8.0, revision
`4d43dc9d80cd2aa3787a27f54b76d692db1dcf8f`.

`peekaboo-click.patch` addresses
[self-targeted Accessibility clicks blocking Ace's native bridge](https://github.com/githubnext/ace2/issues/61).

The patch moves semantic `AXPress` off MainActor so Ace can service its own Accessibility request.
It captures result metadata before dispatch and avoids querying removed non-tab controls after a
press. Exact target validation remains in place. The operation keeps its coordinator lane until
the native call returns, including after client cancellation; no timeout is treated as completed
input.
Ambiguous native press failures retain an indeterminate outcome, preventing Peekaboo from
falling back to another click after input may already have been delivered.

The patch also addresses [editable WebKit controls accepting a press without keyboard focus](https://github.com/githubnext/ace2/issues/106).
A single element click prefers the existing verified focus write for writable `AXTextField` and
`AXTextArea` controls when Accessibility value delivery is allowed. Other controls retain their
normal press behavior. The focus write runs off MainActor while the operation keeps its lane;
the original exact target checks and focus readback remain in force. An ambiguous write failure
retains an indeterminate outcome instead of allowing another input route. Point-click occlusion
and background paste behavior are separate parts of that issue.

`peekaboo-pointer-window.patch` addresses
[WebKit controls being reported as occluded](https://github.com/githubnext/ace2/issues/106).
Positional click validation and pointer receiver identification use Peekaboo's existing
containing-window resolver, including the native `AXWindow` link when a leaf has no direct window
ID. A different or unresolved window remains refused; process, generation, bounds, and target
checks are unchanged. It adds no coordinate-routing or input fallback.

`peekaboo-insert.patch` addresses
[literal newlines submitting web composers](https://github.com/githubnext/ace2/issues/76).
Unicode keyboard events are still keyboard events: WebKit can treat a newline as Return.
The patch exposes one GUI-owned literal insertion operation using a temporary plain-text paste.
It reuses the native clipboard transaction gate, preserves bounded prior contents privately,
and owns the snapshot lease and native process mutation lane through delivery, verification, and cleanup.
Exact process, window, focused receiver, text, and UTF-16 selection establish the intended edit.
Both the original and intended text must fit the complete 65,536-unit verification limit.
An exact receiver in the active frontmost app uses a direct targeted Cmd+V chord. That route
revalidates the retained editor, selection, active app, and process generation before every input
unit. Other targets use Peekaboo's target-only window preparation, including its guarded blank
native title-bar click. The route is fixed before input and never switches after partial delivery.
Preparation and delivery form one native outcome; partial preparation remains uncertain input and
cannot authorize a retry. If the paste key was never posted, clipboard restoration is safe even
when preparation or modifier input was emitted. Typed refusal causes
retain the native guard diagnostic without exposing clipboard contents or the compared text.
An observed meaningful edit authorizes generation-checked restoration; uncertain consumption
leaves the replacement or preserves newer contents, never restoring private prior contents
while a paste may still be pending. It has no typing fallback or delayed restore journal.
The existing clipboard gate durably reserves the target process generation before the paste key.
Unresolved delivery blocks later automated clipboard writes until a live read confirms the intended
edit or that exact process generation ends. Only reservation metadata survives a GUI restart;
no clipboard contents, hashes, or deferred restoration are persisted.

`peekaboo-clipboard-text.patch` adds explicit plain-text clipboard reads and persistent writes for
[clipboard access](https://github.com/githubnext/ace2/issues/72). It applies after the insertion patch
and reuses its GUI clipboard service and reservation gate. Reads require silent clipboard access,
one complete item, a stable generation, and a complete JSON result of at most 24,000 bytes; ordinary
alternate representations do not prevent reading its plain text. Reads do not enter or release the
gate. Writes accept at most 8,192 UTF-16 units, enter the existing gate, and retain native mutation
outcomes without returning clipboard contents. They never paste, snapshot prior contents, restore,
or add a separate journal. Unresolved paste ownership refuses writes across channels and GUI restarts.

The desktop build resolves only `Package.resolved` versions, checks the pin and checkout revision,
and assembles the ordered patch stack in a private Git index. A repeated build compares the
checkout with that complete expected source, since later patches can change earlier patch contexts.
Missing patches are applied in order and verified against the same index before compiling Swift.
The real dependency index is unchanged. Drift fails the build instead of producing unexpected
source. Patch files are excluded from formatting.

When updating Peekaboo, review the upstream fixes and these patches together. Update the revision
guard and patches deliberately, or remove each patch when the dependency includes its fix.
Revalidate real button clicks, changed-focus refusal, literal multiline insertion, clipboard
restoration, partial input, and interruption before shipping
the update.
