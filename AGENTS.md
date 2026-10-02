# Working on Ace

Ace is a collaborative coding environment whose channels run on the team's own machines. Read
[architecture](docs/architecture.md) before changing a system boundary.

[docs/terms.md](docs/terms.md) defines Ace's vocabulary. Use those meanings, and correct anyone
(including the user) who uses a term differently. Change the terms file first when a meaning has
to change.

## Ownership

- `packages/channel` is the channel. It must stay runtime-neutral: no `node:*`, `bun:*`, or Workers
  imports. Storage, models, execution environments, and cross-channel delivery are injected.
- `apps/host` owns everything machine-specific: the CLI, channel workers, the catalog on disk, and
  local transport.
- Client protocol types live in `@ace/channel/protocol`. Clients import them; don't copy them.
- Durable channel state belongs to pi-durable. Don't add a second store for messages, runs, or
  chats.

## Coding

- Read applicable [.claude/rules](.claude/rules/). They apply even when an agent does not
  auto-load Claude rule files.
- Write efficient code with clear ownership. Avoid speculative guards, fallback paths,
  abstractions, and dependencies.
- Don't write tests or examples unless asked. Every test must justify a shipped behavior or a
  failure it catches.
- Smoke-test with real runtimes, models, and provider credentials. No mocks.
- Prefer short names and lowercase kebab-case filenames, except tool-required names.
- Use tabs, double quotes, and strict TypeScript.
- Use `workspace:*` for internal dependencies and root catalogs for shared versions.
- Comments record reasons and constraints, never narration.

## Commands

```sh
bun install
bun ace --help   # CLI
bun types        # type checks
bun run ci       # dprint + oxlint
bun run fix      # apply formatting and lint fixes
```

## Commits

Use `type(target): verb-led description` with `chore`, `fix`, `feat`, or `break`. The target is
the folder name (`channel`, `host`); omit it for repository-wide changes. Never commit secrets or
credentials.
