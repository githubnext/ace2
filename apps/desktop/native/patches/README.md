# Native dependency patches

Both patches apply to Peekaboo 4.8.0, revision
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

The desktop build resolves only `Package.resolved` versions, checks the pin and checkout revision,
and applies each patch before compiling Swift. A repeated build accepts each only when its reverse
patch check succeeds. If neither direction applies, the build fails with Git's diagnostics rather
than building an unexpected source state. Patch files are excluded from formatting.

When updating Peekaboo, review the upstream fixes and both patches together. Update the revision
guard and patches deliberately, or remove each patch when the dependency includes its fix.
Revalidate real button clicks, changed-focus refusal, partial input, and interruption before shipping
the update.
