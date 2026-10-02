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

A hosted channel lives in a Durable Object and runs its tools on the host that created it, while
that host runs `ace serve` or the desktop app. To try one locally, put `ACE_SECRET` and a model key
in `services/channel/.dev.vars`, then:

```sh
bun --filter @ace/channel-service dev                     # http://localhost:8787
printf %s "$SECRET" | bun ace key set ACE_SECRET          # the value in .dev.vars
bun ace new --hosted http://localhost:8787 --project ~/code/my-repo
```

The team's directory lists every host's channels, so they stay visible while their host sleeps.
Run `services/directory` the same way (`bun --filter @ace/directory dev --port 8788`), then point
each host at it with `bun ace directory http://localhost:8788`.

If `bun desktop dev` or `build` exits silently, macOS killed Electrobun's downloaded CLI for an invalid
signature. Re-sign it once with `codesign --force -s - apps/desktop/node_modules/electrobun/bin/electrobun`.

## Documentation

- [Terms](docs/terms.md): what Ace's words mean. Binding.
- [Architecture](docs/architecture.md): how channels, hosts, and shared services fit together.
