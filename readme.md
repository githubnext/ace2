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
bun app build && bun ace serve   # start the local host
bun ace open                     # in another terminal: open its authenticated browser app
bun desktop dev                  # desktop UI and the independent Ace Helper
bun desktop build                # stable artifacts; distribution signing is still required
```

Open Settings in the app to check, save, replace, or remove Anthropic and OpenAI keys in Keychain.
The default model is shared with the CLI's `ace model` command. Provider keys are never returned
to the UI, and running workers read changes on their next model request. Environment overrides
still take priority and are identified in Settings.

Press Cmd+O in the desktop to open a folder as a project. Opening a project needs no provider key
and creates no channel. Dashboard and Channels share the project picker; start a channel from
the project's dashboard or sidebar. Each project remembers its selected channel.

Settings → This Mac shows Git, shell,
Tailscale, and directory status, plus Start, Stop, and Restart controls for Ace Helper. Quitting
the UI leaves hosting available. Stopping the helper takes local channels offline and suspends
their work; restarting it and reopening a channel resumes that work.

Development desktop builds use their own catalog, settings, and Keychain service (`ace-dev`).
The installed stable app and CLI use `ace`. Build with Bun 1.4 or later; the packaged UI uses
Electrobun's compatible bundled runtime, and Ace Helper carries its own compiled runtime.

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

To deploy both to your Cloudflare account, give the Workers and every host the same secret:

```sh
SECRET=$(openssl rand -hex 32)
printf %s "$SECRET" | bun ace key set ACE_SECRET
for s in channel directory; do (cd services/$s && bunx wrangler deploy && printf %s "$SECRET" | bunx wrangler secret put ACE_SECRET); done
(cd services/channel && bunx wrangler secret put ANTHROPIC_API_KEY)   # and any other model keys
bun ace directory https://ace-directory.<your-subdomain>.workers.dev
```

If `bun desktop dev` or `build` exits silently, macOS killed Electrobun's downloaded CLI for an invalid
signature. Re-sign it once with `codesign --force -s - apps/desktop/node_modules/electrobun/bin/electrobun`.

## Documentation

- [Terms](docs/terms.md): what Ace's words mean. Binding.
- [Architecture](docs/architecture.md): how channels, hosts, and shared services fit together.
- [Desktop plan](docs/desktop.md): packaging, settings, onboarding, and distribution.
