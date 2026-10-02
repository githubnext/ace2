# Ace

A collaborative coding environment where people and agents work together in channels that run on
your own machines.

## Run

Requires Bun 1.4 or later and a model provider key. Ace reads a key such as `OPENAI_API_KEY` from
`ACE_OPENAI_API_KEY`, then `OPENAI_API_KEY`, then the OS keychain (`bun ace key set OPENAI_API_KEY`).

```sh
bun install
bun ace new --project ~/code/my-repo
bun ace ask <channel> "what does this repo do?"
bun ace --help
```

The app runs in a browser against the host's gateway, or as the macOS desktop app:

```sh
bun app build && bun ace serve   # http://127.0.0.1:4140
bun desktop dev                  # the desktop app, hosting channels itself
bun desktop build                # a standalone Ace.app and .dmg in apps/desktop/artifacts
```

With Tailscale running, the host also shares its channels with the tailnet, and the app shows
teammates' channels. See [the team](docs/architecture.md#the-team).

If `bun desktop dev` or `build` exits silently, macOS killed Electrobun's downloaded CLI for an invalid
signature. Re-sign it once with `codesign --force -s - apps/desktop/node_modules/electrobun/bin/electrobun`.

## Documentation

- [Terms](docs/terms.md): what Ace's words mean. Binding.
- [Architecture](docs/architecture.md): how channels, hosts, and shared services fit together.
