# Foldkit preview packages

These six package archives contain the unreleased Foldkit preview at commit `2899c6cbfe8d9a4ec9924d7219567697d33b4d55`. The matching framework source is pinned in `repos/foldkit`.

The app installs these archives through `file:` dependencies. Builds and CI use the committed archives and lockfile, without requiring another local checkout or unpublished npm versions. `manifest.json` records each package version and SHA-512 integrity.

The archives were built from an isolated copy of that commit using its locked dependencies. The framework’s `canaryPackageJsons` helper assigns the commit-addressed versions and exact internal dependency versions. The package build scripts ran in dependency order: Foldkit, UI, Vite plugin, DevTools, DevTools MCP, then the Oxlint plugin. Each package was archived with `pnpm pack`.
