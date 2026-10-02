# Todo

Move these into issues once the repository has a remote.

- **Keys in the app.** Keys resolve from `ACE_<NAME>`, `<NAME>`, then the keychain, and
  `ace key set` stores them; the app has no settings view to add or see which providers are set.
- **Show the model on agent replies.** Replies are labelled `ace`; switching models mid-chat is
  invisible in the timeline and to later runs.
- **Show why a run failed.** A provider error or refusal ends the run with "stopped before
  answering" in the CLI and nothing in the app; the reason is only in the stored transcript.
- **Diff tab** for the selected chat's lane.
- **Two-machine check** of the tailnet gateway: proxying and discovery have only run against
  this machine's own tailnet listener.
- **Projects across hosts**: identify a project by its repository, not a local path.
- **Desktop release.** `bun desktop build` makes an unsigned, un-notarized app; signing,
  notarization, an icon, and updates (Electrobun needs a `baseUrl`) remain. Electrobun's
  downloaded CLI needs an ad-hoc re-sign. Closing the window ends the host, so channels stop
  while the app is closed.
- **Third-party notices** for desktop builds: Bun's LGPL components, Electrobun binaries, Shiki
  grammars, and the provenance of `packages/ui`'s WebGPU shader and dither code.
- **Lobby cell** in `services/team`: presence, notifications, channel lifecycle.
- **Terminals and previews** per channel.
