# Todo

Move these into issues once the repository has a remote.

- **Keys from the OS keychain.** Resolve each provider credential in order: `ACE_<NAME>`,
  `<NAME>`, then the keychain item `<NAME>` under service `ace`, read with `Bun.secrets`
  (Keychain on macOS, libsecret on Linux, Credential Manager on Windows). Add
  `ace key set|rm <name>` so keys never live in shell profiles or `.env`. The host resolves keys
  and passes them to workers; the desktop app then needs no `.env`.
- **Show the model on agent replies.** Replies are labelled `ace`; switching models mid-chat is
  invisible in the timeline and to later runs.
- **Diff tab** for the selected chat's lane.
- **Tailnet gateway** so teammates' apps reach this host's channels.
- **Desktop bundle.** The desktop app runs the host from the checkout (`ACE_ROOT`); bundle the
  host and worker so it runs standalone. Electrobun's downloaded CLI needs an ad-hoc re-sign.
- **Third-party notices** for desktop builds: Bun's LGPL components, Electrobun binaries, Shiki
  grammars, and the provenance of `packages/ui`'s WebGPU shader and dither code.
- **Lobby cell** in `services/team`: presence, notifications, channel lifecycle.
- **Terminals and previews** per channel.
