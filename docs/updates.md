# Desktop updates

Ace ships one application bundle containing the UI, Ace Helper, and the channel worker runtime.
[Sparkle 2](https://sparkle-project.org/documentation/) verifies and replaces that whole bundle.
Its installers are temporary processes; Ace Helper remains the persistent background service.
The current release target is Apple silicon on macOS 14 or later.

## Experience

Ace checks automatically every six hours while open and shows an update notification. Settings →
Updates and Ace → Check for Updates share version, progress, and error reporting. Users can turn
automatic checks off. **Install and Restart** is an explicit action.

Automatic downloads and installation on ordinary quit are disabled. Quitting normally leaves
Ace Helper running. After choosing to install, this machine's channels and workspace tools pause
while the update downloads and installs. Unfinished local channel work resumes automatically after
restart. Terminal shells close and do not resume. Hosted channels stay reachable, but their
workspace disconnects during the update.

Updates require a running, enabled Ace Helper. Command-line hosts and helpers disabled in macOS
are left alone. Development builds have no feed. The first Sparkle-enabled build requires a manual
installation; previous builds do not understand this feed. Stop Ace Helper before manually
replacing an existing installation, then reopen Ace. Builds predating resume receipts need their
channels reopened once to resume any unfinished runs.

## Handoff and recovery

The desktop's authenticated native bridge owns the updater. Two owner-only loopback requests
coordinate the host:

1. `update-prepare` blocks new work, drains admitted requests, closes workspace tools, and suspends
   local workers. It acknowledges only after their identified processes exit. Stale PID files are
   never used to choose a process to signal.
2. `update-cancel` resumes workers and workspace links if the update ends before the helper exits.

Before stopping workers, the host atomically writes their IDs to `$ACE_HOME/resume.json`. On
startup it wakes those workers and removes successfully resumed IDs. Failed starts remain in the
receipt and are logged. Ordinary helper restarts use the same mechanism. There is no second store
for tasks or messages: all resumable work remains in pi-durable, and shutdown never writes abort
marks.

The desktop writes `$ACE_HOME/desktop-update.json` before preparing the host. It unregisters Ace
Helper and waits for its process to exit before allowing Sparkle to start a download or installer.
This prevents an old helper from spawning workers from a replaced bundle. The relaunched app
restores the helper and removes the desktop receipt after recovery.

Failures and download cancellation resume the helper while Ace is open. If the desktop is forcibly
terminated or power is lost, opening Ace recovers the receipt. A recovery error remains visible
with a **Resume Ace Helper** action. Keeping workers running during a download is deferred until
there is an equally safe installer handoff; a slow download currently means a longer pause.

Projects, databases, preferences, logs, and Keychain credentials are outside the app bundle.
Installed apps need neither `.env` nor a checkout. Stable and canary have separate identifiers,
helper registrations, ports, data directories, preferences, and Keychain services.
Stable and development builds use the original green Ace icon; canary uses the same artwork in
yellow. Both icon sets include all macOS sizes and are compiled into the signed application bundle.

## Build and verification

Electrobun 1.18.1's updater deletes the current app before moving its replacement, does not
authenticate its metadata or archive, and has no helper handoff. Ace instead extracts the actual
application from Electrobun's build archive; its self-extracting wrapper and `Updater.applyUpdate()`
are unused.

The Sparkle SDK and Electrobun CLI downloads are pinned by version and SHA-256. Sparkle's license
is included in the bundle. Code is signed inside out, including Ace Helper and Sparkle's nested
installers. Paths containing spaces are passed as individual command arguments.

A release requires Developer ID signing, hardened runtime, notarization, and stapled tickets for
both the app and disk image. The image contains the app and an Applications shortcut. Sparkle
signs its archive and feed with Ed25519; the app embeds only the public key and enables
`SURequireSignedFeed` and `SUVerifyUpdateBeforeExtraction`. Feed URLs must use HTTPS.
Sparkle's 20-day feed-signing recovery window remains enabled for lost-key recovery; archive
verification and Apple signatures still apply during that recovery path.

Increment `apps/desktop/package.json` for each release. Sparkle compares bundle versions and does
not offer ordinary downgrades. Revert a bad release by shipping a fixed build under a higher
version. The initial pipeline uses complete disk images; delta generation is deferred.

## Hosting and publishing

Keep the source repository private. Only signed release artifacts go to a public Cloudflare R2
bucket over HTTPS. The app contains no GitHub or Cloudflare credential. Publishing uses R2's
bucket-scoped S3 credentials through Bun; it does not need an account-wide Cloudflare API token.

The initial canary uses the existing `luau-updates` bucket under its own `/ace` prefix, at
`https://pub-5bdeb2efd19f42f09df9efad8b20c91e.r2.dev/ace`. Luau's feed and signing key are separate.
Move to a custom download domain before wider stable distribution: Cloudflare's
[public development URL](https://developers.cloudflare.com/r2/buckets/public-buckets/#public-development-url)
is rate-limited and intended for development traffic.

```text
stable/macos-arm64/appcast.xml
stable/macos-arm64/ace-stable-0.0.3-macos-arm64.dmg
canary/macos-arm64/appcast.xml
canary/macos-arm64/ace-canary-0.0.3-macos-arm64.dmg
```

Images have immutable URLs and one-year cache headers. Retain old images for clients that already
selected them. Feeds contain the latest release and use `Cache-Control: no-store`; configure the
domain's cache rules to respect that header.

The publisher verifies an existing feed's signature and refuses a version regression or changed
bytes at an existing archive URL. It uploads and downloads the archive to verify its public bytes,
then uploads and reads back the feed. The feed is the final commit point. Channel releases are
serialized by the workflow.

## Building from Ace

An agent in an Ace channel can use its shell tool to run `bun desktop ci canary` from its lane.
The machine needs Bun, Git, and an authenticated GitHub CLI (`gh auth login`) with permission to
run this repository's workflows. Commit and push the lane first. The command refuses uncommitted
changes or a remote branch that differs from the lane, and pins the build to that exact commit.
Apple, Sparkle, and R2 credentials stay in the GitHub release environment.

The command returns immediately with the workflow URL and run ID. Use `bun desktop ci status
<run-id>` to follow progress, then `bun desktop ci download <run-id>` to retrieve the successful
build. Downloads go under `apps/desktop/artifacts/ci/<run-id>/`; the command checks the DMG's
SHA-256 against its release manifest and reports the source revision.

Use `stable` instead of `canary` for the main app. Building does not publish; add `--publish`
explicitly to build and publish a release. New builds are refused during 22:00–02:00 UTC, and
the workflow checks that window again before loading credentials. Status and downloads work at
any time. Native app inspection is still a separate dogfooding gap.

Keep the same Developer ID identity for installed development builds with
`ACE_CODESIGN_IDENTITY`; replacing one with an ad-hoc signature can invalidate Ace Helper's
macOS background permission.

## Credentials and first release

Release credentials are backed up in **1Password → Dev → Ace desktop releases**. Both GitHub
environments, `desktop-canary` and `desktop-stable`, are configured from that item. They share
Nate's existing Developer ID identity and notarization key, and a dedicated Ace Sparkle key.
The item contains the following values for rebuilding either environment:

| Kind     | Name                       | Value                                                        |
| -------- | -------------------------- | ------------------------------------------------------------ |
| Variable | `ACE_CODESIGN_IDENTITY`    | Developer ID Application name or SHA-1                       |
| Secret   | `ACE_CERTIFICATE_P12`      | Base64 P12 export containing the certificate and private key |
| Secret   | `ACE_CERTIFICATE_PASSWORD` | P12 password                                                 |
| Secret   | `ACE_NOTARY_PRIVATE_KEY`   | App Store Connect API `.p8` contents                         |
| Variable | `ACE_NOTARY_KEY_ID`        | API key ID                                                   |
| Variable | `ACE_NOTARY_ISSUER`        | API issuer UUID                                              |
| Secret   | `ACE_SPARKLE_PRIVATE_KEY`  | Exported Sparkle Ed25519 seed, base64                        |
| Variable | `ACE_UPDATE_PUBLIC_KEY`    | Matching Sparkle public key                                  |
| Variable | `ACE_UPDATE_URL`           | Public HTTPS base URL, without a channel suffix              |
| Variable | `ACE_UPDATE_BUCKET`        | R2 bucket name                                               |
| Variable | `CLOUDFLARE_ACCOUNT_ID`    | Account containing the bucket                                |
| Secret   | `R2_ACCESS_KEY_ID`         | R2 S3 access key scoped to the download bucket               |
| Secret   | `R2_SECRET_ACCESS_KEY`     | Matching R2 S3 secret key                                    |

Use the backed-up signing keys for subsequent releases. Never commit exports. Follow Sparkle's
[key rotation guidance](https://sparkle-project.org/documentation/#rotating-signing-keys): change
the Apple identity or Ed25519 key in one release, never both together. Signed disk images provide
a key recovery route when archive validation is required before extraction.

Manually run **Desktop release** on the intended commit outside 22:00–02:00 UTC. It defaults to
canary and publishing off, so the notarized artifact is reviewable before the first public release.
With publishing enabled, it uploads and verifies the release. There is no recurring schedule.
CI uses a temporary signing keychain and removes credentials even when the build fails.

For a local release with the certificate installed, export the corresponding variables and set
`ACE_NOTARY_KEY` to the `.p8` file path:

```sh
bun desktop release canary
bun desktop publish
```

`release` builds and verifies without publishing. `publish` uploads the prepared artifact.

## Validation

The October 2, 2026 local check used a separate app identifier, helper, and data directory. Native
Sparkle upgrades from 0.0.3 to 0.0.4 (ZIP) and 0.0.4 to 0.0.5 (signed DMG with hardened runtime)
replaced the app, re-registered Ace Helper, and resumed interrupted real Anthropic runs without
opening their channels. Old workers exited, channel data remained, and recovery receipts cleared.

Corrupted feeds and archives were rejected. Download cancellation restored hosting. A canceled
preparation could not stop workers after a delayed request drained, and preparation waited for a
real terminal shell to exit. Canary packaging and workflow syntax checks passed, as did repository
type, formatting, and lint checks. A real host accepted update coordination over authenticated
loopback and rejected both operations from tailnet peers and the owner's tailnet browser.

The first Developer ID canary, 0.0.3, passed Apple's notarization for both the app and disk image;
both tickets were stapled and verified. The app extracted from the image passed Gatekeeper as
`Notarized Developer ID`. Real R2 uploads, public downloads, cache headers, and cleanup passed.
Both GitHub release environments contain the verified configuration; the workflow has not run yet.

The notarized app is installed at `/Applications/Ace Canary.app`. Native checks covered first-launch
Ace Helper registration, opening a folder with Cmd+O before provider setup, the project dashboard,
and Updates settings. Opening the folder added a project and created no channel. The initial feed
has not been published, so an update check currently reports a feed retrieval error. Verify the
first published notarized upgrade on another Mac before wider distribution.
