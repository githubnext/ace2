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

## Documentation

- [Terms](docs/terms.md): what Ace's words mean. Binding.
- [Architecture](docs/architecture.md): how channels, hosts, and shared services fit together.
