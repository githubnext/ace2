# Architecture

Ace is a collaborative coding environment that runs on the team's own machines. Old Ace ran one
process per channel inside a cloud VM; most of its pain was the VM and cloud infrastructure, not
the per-channel process. Ace keeps the process and drops the infrastructure.

Words in this document have the meanings in [terms](terms.md).

## Layout

| Path               | Runs                           | Owns                                                                 |
| ------------------ | ------------------------------ | -------------------------------------------------------------------- |
| `packages/channel` | inside a channel worker        | The channel: chats, agents, lanes, and the client protocol types     |
| `apps/host`        | on every machine (Bun)         | The `ace` CLI, channel workers, the channel catalog, local transport |
| `apps/desktop`     | on every machine               | The desktop client, with the host built in                           |
| `services/channel` | Cloudflare Workers             | Hosted channels: one Durable Object per channel                      |
| `services/team`    | hosted, one per team (planned) | The directory and lobby cells                                        |

Clients (the CLI, later the desktop app) attach to channels; a channel is not a client.

## Channel

A channel is one worker process over one [pi-durable](https://github.com/earendil-works/pi)
Session stored in one SQLite file. A chat is one pi conversation in that Session.

- **Durable state is pi's.** Messages, runs, tool calls, and child chats are pi entries, tasks,
  and conversations. A crash resumes unfinished work from its last checkpoint; tools that are not
  safe to rerun report an interruption to the model instead.
- **The model sees the whole room.** A human message that does not invoke an agent is a pi
  `write`: it enters the transcript without starting a run. Invoking an agent is a pi `input`.
- **Model per run.** The chat's model is set when a run is admitted. Changing it while a run is
  active is rejected rather than changing the active run's later turns.
- **Subagents are child chats.** A subagent's chat is owned by the parent's tool task, so killing
  the parent kills the child. Agents in different channels only exchange messages.
- **Lanes are Git worktrees** created by the chat's agent for each unit of work. A chat's working
  directory is its current lane.
- **Kill is durable.** Killing records pi's abort marks before the worker exits, so reopening the
  channel does not resume the killed work.

`packages/channel` must stay runtime-neutral: no `node:*`, `bun:*`, or Workers imports. The host
injects storage, models, and the execution environment. This keeps hosted channels (a channel
inside a Durable Object, with tools served from a team machine) an adapter rather than a rewrite.

Process per channel gives isolation and instant kill, and lets thousands of channels exist as
files: a dormant channel is a closed SQLite file with no process. It is process isolation, not a
boundary: every worker runs as the host's user and can read the others' files. Agents have full
access by design, so the boundary that would matter is around tool execution, not the store.

## Host

`apps/host` keeps channels under `$ACE_HOME/channels/<id>/` (default `~/.local/state/ace`). Each
directory holds `channel.json`, `channel.sqlite`, and the channel's lanes. Clients start a
channel's worker on demand and talk to it over `channel.sock` with newline-delimited JSON. A worker
retires when it has no clients and no live work.

Model credentials come from `ACE_<NAME>`, `<NAME>`, then the OS keychain, for each name pi-ai asks
for, such as `OPENAI_API_KEY`. Agent shells inherit the process environment and anyone admitted to
a channel can invoke its agent, so processes that run tools first move credential-like variables
out of the environment; only the key lookup can read them.

## Hosted channels

`services/channel` runs the same `packages/channel` core in a Durable Object, one per channel.
The object provides what the host's worker provides locally (single ownership of the store,
isolation, and routing by channel ID) and adds hibernation and placement off any one machine.
pi's portable SQLite core runs on the object's own SQL through `storage.ts`.

A Durable Object has no file system or shell, so a hosted channel's tools run on a **workspace**:
the host that created it. That host dials out to the object and serves each chat's file and shell
calls from its lanes, using the same execution environment as a local worker
(`packages/channel/src/workspace.ts`). The project checkout stays the source of truth. While the
workspace is disconnected, the channel stays reachable for chat, tools report the workspace as
offline, and a call in flight when it drops is reported to the model as failed.

- The workspace socket hibernates, so an idle hosted channel costs nothing while its host stays
  connected. Client sockets carry live pi event streams and keep the object awake.
- An alarm re-wakes the object while a run is active, so an evicted object resumes the run.
- Hosts share the team's secret with the service (`ACE_HOSTED_SECRET` on hosts, `ACE_SECRET` on the
  Worker) and state each message's author. They verify their own users over the tailnet, so the
  service trusts hosts, not individual people.
- Model keys are Worker secrets.

## Shared services

Shared state that must outlive any one machine (the directory and each project's lobby) lives in
cells: Durable Objects deployed to Cloudflare, or celld on a team machine.

## The team

The tailnet is the team: it decides which people and machines can reach a host. Every author is a
Tailscale login, so a person is the same participant on every host. Within a channel there are no
tool permissions; the owner can only turn agent invocation by others on or off.

Each host's gateway listens twice. Loopback serves the app as the host's owner. The machine's
tailnet address takes host-to-host sockets only, names each caller with `tailscale whois`, and
refuses anything with an `Origin` header, so a web page on a teammate's machine cannot act as them.
Hosts find online, untagged peers through `tailscale status`. A host shows its app every peer's
channels and proxies their requests; the peer that runs a channel stamps every author. Only a
channel's host creates it; only the host's owner, from any of their machines, archives, deletes,
or kills.

## Not yet built

Terminals and previews, attachments, lobby and directory cells, and external harnesses (Claude
Code, Codex). Hosted channels cannot message other channels yet, and only their workspace host
lists them. Projects are still a local path, so a teammate's checkout of the same
repository shows as a separate project.
