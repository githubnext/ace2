# Ace

A collaborative coding environment where people and agents work together in channels that run on
your own machines.

## Run

Requires Bun 1.4 or later and a model provider key, such as `OPENAI_API_KEY`.

```sh
bun install
bun ace new --project ~/code/my-repo
bun ace ask <channel> "what does this repo do?"
bun ace --help
```

The app runs in a browser against the host's gateway, or as the macOS desktop app:

```sh
bun app build && bun ace serve   # http://127.0.0.1:4140
bun desktop dev                  # builds the app and starts its own gateway
```

If `bun desktop dev` exits silently, macOS killed Electrobun's downloaded CLI for an invalid
signature. Re-sign it once with `codesign --force -s - apps/desktop/node_modules/electrobun/bin/electrobun`.

## Documentation

- [Terms](docs/terms.md): what Ace's words mean. Binding.
- [Architecture](docs/architecture.md): how channels, hosts, and shared services fit together.
