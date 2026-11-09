# ADR-002: Use native desktop mods for tab details

Status: Accepted. Distribution behavior extended by ADR-003.

## Context

Herdr.app 0.1.13 exposes live tab and terminal metadata to native JavaScript
mods. The standard command palette has a fixed named-command list. Tab details
needs to appear in that palette and preserve existing commands.

## Decision

Use a native information mod and an adapted copy of the shipped palette.
Capture the tab at opening and read fresh metadata for rendering and copying.
Retain machine-qualified remote addresses and explicitly label unavailable data.
Use Herdr's native clipboard API only after the user clicks Copy details.

## Consequences

### Positive

No runtime dependencies, extra processes, shell commands, or custom app binary
are needed. The installed mods are independent of their source checkout.

### Negative

The palette copy needs reconciliation after upstream UI changes. User-owned
keys do not automatically receive new defaults. Standard metadata may omit
agent chat session IDs.

### Alternatives Considered

Editing the built-in frame directly is overwritten on startup. A separate
shortcut would not provide the requested command palette entry.

## Files Changed

| File | Purpose |
| --- | --- |
| mods/herdr-info/main.js | Metadata panel and copy handler. |
| mods/herdr-info/mod.json | Panel placement. |
| mods/herdr-info-palette/main.js | Adapted command palette. |
| mods/herdr-info-palette/mod.json | Palette placement. |
| install.mjs | Install mod files and merge the keybinding. |
| info.test.mjs | Exercise mod and installer entry points. |
| README.md | Installation and limits. |
