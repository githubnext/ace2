# Native dependency patches

`peekaboo-click.patch` applies to Peekaboo 4.8.0, revision
`4d43dc9d80cd2aa3787a27f54b76d692db1dcf8f`. It addresses
[self-targeted Accessibility clicks blocking Ace's native bridge](https://github.com/githubnext/ace2/issues/61).

The patch moves semantic `AXPress` off MainActor so Ace can service its own Accessibility request.
It captures result metadata before dispatch and avoids querying removed non-tab controls after a
press. Exact target validation remains in place. The operation keeps its coordinator lane until
the native call returns, including after client cancellation; no timeout is treated as completed
input.
Ambiguous native press failures retain an indeterminate outcome, preventing Peekaboo from
falling back to another click after input may already have been delivered.

The desktop build resolves only `Package.resolved` versions, checks the pin and checkout revision,
and applies the patch before compiling Swift. A repeated build accepts it only when the reverse
patch check succeeds. If neither direction applies, the build fails with Git's diagnostics rather
than building an unexpected source state. Patch files are excluded from formatting.

When updating Peekaboo, review the upstream fix and this patch together. Update the revision guard
and patch deliberately, or remove both when the dependency includes the fix. Revalidate real
button clicks, target refusal, and interruption before shipping the update.
