# Native desktop inspection

Ace's native harness can inspect applications and windows on the machine running the channel's
tools. It uses [Peekaboo](https://github.com/openclaw/Peekaboo) for macOS Accessibility and screen
capture. The model receives the accessibility text and screenshot, and the same result appears
in the chat's expandable tool output, including after reopening the channel.

## Setup

Native inspection requires macOS 15 or later. Ace embeds Peekaboo's native library; there is no
separate Peekaboo installation or permission grant. In Ace Settings, open This Mac and enable
Accessibility and Screen Recording. macOS grants those permissions to Ace on that machine.
Event Synthesizing is not needed for this inspection-only integration.

Keep Ace open on the machine running the tools. Closing its window is fine, but quitting Ace
stops native inspection even while Ace Helper keeps channels running. Each execution host needs
its own macOS grants. The development, canary, and stable apps have separate identities and grants.

Source builds need Swift 6.2 or later and a valid Apple Development or Developer ID signing
identity to use native inspection. The embedded bridge authenticates its bundled client against
the app's signing team and exact client identifier. Set `ACE_CODESIGN_IDENTITY` when building.
For a host running from source, set `ACE_DESKTOP_CLIENT` to the signed app's
`Contents/MacOS/ace-desktop-client` and use the same `ACE_HOME` as that app. Normal packaged hosts
find the client alongside Ace Helper automatically.

## Tools

- `desktop_apps` lists running native applications and their process IDs.
- `desktop_windows` lists windows for an application process ID.
- `desktop_inspect` reads one explicit process and window ID, returning accessibility text and
  a screenshot without activating the window or changing keyboard focus.

Choose the application from the inventory and the window from that application's window list.
The first integration provides observation. Clicks, typing, and other native actions are not yet
Ace desktop tools.

Captures are resized and compressed before entering pi's existing channel history. Text and
image payloads are bounded so a result also fits the storage limits of a team-deployed hosted
channel. Incomplete accessibility observations retain their warnings. A missing app, missing
permission, unavailable window, or disconnected workspace is reported as a tool error.

## Team and execution

The [tailnet is the team](architecture.md#the-team). The existing collaborator-agent switch
controls access to all available agent tools together, including desktop inspection. Native
inspection has no separate participant roles, allowlists, or per-call approval flow in Ace.
macOS permissions authorize Ace on the machine.

A local channel inspects its host's desktop. A hosted channel sends inspection to its workspace
host through the existing workspace connection. Opening the chat on another device does not
change which machine is inspected. The host calls Ace's bundled native client over a local Unix
socket. Capture and Accessibility services run inside the desktop app, which owns macOS
permissions. The channel receives an injected capability and pi owns the durable tool result.
