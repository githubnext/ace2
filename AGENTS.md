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
- Existing channels are permanent data. Stored format changes need versioned migrations and a
  check against a backup of an existing channel; never reset a store to make an upgrade work.
  See [channel data](docs/data.md) for storage locations, backups, and recovery.

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
- Preserve Ace's project-first desktop flow and shared UI components. Opening a folder with
  Cmd+O adds a project; creating a channel inside that project is a separate action.

## Tracking and PRs

- [TODO.md](TODO.md) is the only tracker; don't open GitHub issues. Update it in the same commit
  as the work.
- PR bodies follow [the template](.github/pull_request_template.md), including when created with
  `gh pr create --body`. Always fill in **Built in Ace**: if anything outside Ace was used, name it,
  say why Ace couldn't do it, and add the gap to TODO.md.

## Commands

```sh
bun install
bun ace --help   # CLI
bun ace backup <channel> <new-directory>  # local channel data, including committed WAL entries
bun types        # type checks
bun run ci       # dprint + oxlint
bun run fix      # apply formatting and lint fixes
bun desktop ci canary  # signed desktop build from a clean, pushed lane
```

An Ace channel can build releases with its shell tool; see [desktop updates](docs/updates.md)
for status, downloads, and explicit publishing. Signing credentials stay in GitHub.

## Commits

Use `type(target): verb-led description` with `chore`, `fix`, `feat`, or `break`. The target is
the folder name (`channel`, `host`); omit it for repository-wide changes. Never commit secrets or
credentials.
