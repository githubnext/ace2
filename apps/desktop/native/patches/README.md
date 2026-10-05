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

`peekaboo-clipboard.patch` implements
[GUI-owned clipboard access and temporary paste](https://github.com/githubnext/ace2/issues/72).
It adds typed, authenticated Bridge read/write/paste operations and multi-item file URLs to the
existing clipboard service. Image bytes travel between the bundled client and GUI; filesystem
access stays in the client/host. Read results preserve complete text or file lists within 24 KB,
and one PNG/JPEG/TIFF image within 10 MiB and 64 million pixels. An advertised representation
that cannot be materialized is an error, not an empty clipboard.

Temporary paste retains all prior items and representations in GUI memory, capped at 32 MiB,
128 items, and 512 representations. Unavailable or promised contents refuse before a write.
The existing clipboard transaction gate covers capture, payload setup, claim-guarded exact-window
Cmd+V, a bounded cancellation-independent settle, and generation-checked restoration. The native
keyboard leaf owns its existing desktop lane; the composite clipboard RPC must not acquire a
second outer lane. The GUI owns the snapshot lease too.

Bridge request tracking retains cancelled or disconnected request tasks until their handlers finish,
and checked shutdown drains them. Cleanup preserves a newer clipboard generation and reports
restored, preserved-newer, or failed separately from input delivery. Delivery does not prove that an
app consumed the paste. Mutation replies contain no saved or replacement clipboard payload.
Prior contents are never journaled; a GUI crash or force-kill cannot guarantee restoration.
Native silent-read policy still applies, and Settings only reports its content-free state.

The desktop build resolves only `Package.resolved` versions, checks the pin and checkout revision,
and applies each patch before compiling Swift. A repeated build accepts each only when its reverse
patch check succeeds. If neither direction applies, the build fails with Git's diagnostics rather
than building an unexpected source state. Patch files are excluded from formatting.

When updating Peekaboo, review the upstream fixes and all patches together. Update the revision
guard and patches deliberately, or remove each patch when the dependency includes its fix.
Revalidate real button clicks, changed-focus refusal, partial input, clipboard preservation and
newer-generation handling, and interruption before shipping the update.
