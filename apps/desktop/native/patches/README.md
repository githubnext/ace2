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

`peekaboo-typing.patch` addresses
[stale keyboard focus being reported as uncertain delivery](https://github.com/githubnext/ace2/issues/69).
The exact-window typing service checks the observed focused control before each input unit.
Its initial, read-only validator can fail before any input is sent, but an error without an action
outcome loses that fact when the bridge conservatively maps mutation failures to an unknown outcome.

The patch converts typed invalid-input failures from that initial focus validator to an attributed
pre-dispatch refusal. It preserves the original diagnostic and checks cancellation before making
that conversion. Other errors, including existing action failures and indeterminate delivery,
pass through unchanged. The continuation validator and delivery paths are unchanged, so failure
after any emitted input remains uncertain. Target and focused-control validation are not relaxed.

`peekaboo-insert.patch` addresses
[literal newlines submitting web composers](https://github.com/githubnext/ace2/issues/76).
Unicode keyboard events are still keyboard events: WebKit can treat a newline as Return.
The patch exposes one GUI-owned literal insertion operation using a temporary plain-text paste.
It reuses the native clipboard transaction gate, preserves bounded prior contents privately,
and owns the snapshot lease and native process mutation lane through delivery, verification, and cleanup.
Exact process, window, focused receiver, text, and UTF-16 selection establish the intended edit.
Both the original and intended text must fit the complete 65,536-unit verification limit.
The operation uses Peekaboo's target-only window preparation before Cmd+V, including its guarded
blank native title-bar click. It revalidates the retained editor and selection before sending the
chord. Preparation and delivery form one native outcome; partial preparation remains uncertain
input and cannot authorize a retry or early restoration of private clipboard contents.
An observed meaningful edit authorizes generation-checked restoration; uncertain consumption
leaves the replacement or preserves newer contents, never restoring private prior contents
while a paste may still be pending. It has no typing fallback or delayed restore journal.

The desktop build resolves only `Package.resolved` versions, checks the pin and checkout revision,
and applies each patch before compiling Swift. A repeated build accepts each only when its reverse
patch check succeeds. If neither direction applies, the build fails with Git's diagnostics rather
than building an unexpected source state. Patch files are excluded from formatting.

When updating Peekaboo, review the upstream fixes and these patches together. Update the revision
guard and patches deliberately, or remove each patch when the dependency includes its fix.
Revalidate real button clicks, changed-focus refusal, literal multiline insertion, clipboard
restoration, partial input, and interruption before shipping
the update.
