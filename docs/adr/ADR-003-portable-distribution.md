# ADR-003: Prepare portable distribution

Status: Accepted

## Context

The package must install independently of the developer's checkout and contain
no personal paths, live screenshots, machine identifiers, or migration code.
It also bundles an adapted upstream palette that needs source attribution.

## Decision

Remove the development-only TUI cleanup. Resolve the app directory from explicit
options, documented environment variables, or the current user's home.
Preflight conflicting destination files and require explicit replacement of
different mods. Back up changed files. Keep fixtures and the preview fictional.
Bundle the palette icon and retain upstream license and modification notices.
Distribute the project under Apache License 2.0, matching the bundled upstream code.

## Consequences

### Positive

The same source package works from a checkout or downloaded archive. No runtime
references point to the development machine. Existing custom mods require an
explicit replacement decision. The Gallery recipe documents the actual behavior.

### Negative

The installer remains macOS-focused and does not provide a multi-file transaction.
Backups may contain user data and must stay outside source archives.
Publishing and migrating an existing installation are separate operational steps.

### Alternatives Considered

Copying a complete app configuration would expose unrelated settings and state.
Keeping development cleanup in the public installer would touch unrelated software.
Using a live session screenshot would expose identifiers and directory names.

## Decision Gate

| Criterion | Assessment |
| --- | --- |
| Benefit | Reproducible installation without developer-specific data. |
| Necessity | Public distribution needs portable paths and clean assets. |
| Burden | No new runtime dependency; reuse Node's filesystem APIs. |
| Conflict | Preserve unrelated settings and preflight existing mod conflicts. |
| Performance | A few local file reads and writes during installation. |
| Security | No network in installer or panel; no private preview data. |
| Bottleneck | Missing app configuration stops installation with an error. |
| Currency | Desktop API previously validated on Herdr.app 0.1.13. |

## Files Changed

| File | Purpose |
| --- | --- |
| install.mjs | Portable target resolution and conflict checks. |
| info.test.mjs | Fictional fixtures and installer regression coverage. |
| mods/herdr-info-palette/main.js | Attribution and bundled icon reference. |
| mods/herdr-info-palette/command.svg | Remove dependency on a frame asset path. |
| keys.json | Minimal mergeable keyboard configuration. |
| .gitignore | Exclude generated declarations, local data and backups. |
| README.md | Public installation and migration instructions. |
| RECIPE.md | Gallery reconstruction brief. |
| preview.png | Illustration containing only fictional data. |
| THIRD_PARTY_NOTICES.md | Upstream attribution and modifications. |
| third_party/Apache-2.0.txt | Preserve the upstream license. |
| LICENSE | Apache License 2.0 for the project. |
| docs/adr/ADR-002-native-desktop-mod.md | Remove development-session history. |
| docs/adr/ADR-001-native-popup.md | Remove the retired TUI experiment notes. |
