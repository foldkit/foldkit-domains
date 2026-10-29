# Foldkit preview packages

These six package archives contain the unreleased Foldkit preview at commit `b75b14110d6ad3fc51c548c5d6c938dad2dc5016`. The matching framework source is pinned in `repos/foldkit`.

The app installs these archives through `file:` dependencies. Builds and CI use the committed archives and lockfile, without requiring another local checkout or unpublished npm versions. `manifest.json` records each package version and SHA-512 integrity.

The archives were built from an isolated copy of that commit using its locked dependencies. The framework’s `canaryPackageJsons` helper assigns the commit-addressed versions and exact internal dependency versions. The package build scripts ran in dependency order: Foldkit, Vite plugin, UI, DevTools, DevTools MCP, then the Oxlint plugin. Each package was archived with `pnpm pack`.

The UI package installs with the pnpm patch declared in `pnpm-workspace.yaml`. It delivers a changed container-width measurement before a scroll observation from responsive reflow, preserving VirtualList's logical anchor in Safari. The patch is applied at installation; each archive retains the manifest's source identity and integrity.
