# Framework preview notes

This app exercises the unreleased Blocks and Layers API. Its package archives and reference source are pinned to one framework commit so a fresh checkout builds independently of another local repository.

## Package snapshot

The framework source is commit `29b3f80e4048996e43f3d3b1262870a96c3b005b` from `codex/preview-startup-testing-20261106`. The six packages are built from that commit and stored under `vendor/foldkit/29b3f80e4048/`; application dependencies use project-relative `file:` paths. These are local commit archives, not published npm releases.

| Packages                                      | Version                       |
| --------------------------------------------- | ----------------------------- |
| `foldkit`, `@foldkit/ui`, `@foldkit/devtools` | `0.170.0-canary.29b3f80e4048` |
| `@foldkit/devtools-mcp`                       | `0.26.0-canary.29b3f80e4048`  |
| `@foldkit/oxlint-plugin`                      | `0.15.4-canary.29b3f80e4048`  |
| `@foldkit/vite-plugin`                        | `0.29.0-canary.29b3f80e4048`  |

The adjacent `manifest.json` records the source tree, build process, exact package versions, archive hashes, internal dependencies, and package verification. The source commit's release tooling stamps coherent canary versions and exact internal peers. The lockfile records the local archive integrity.

The application and infrastructure use Effect and platform adapters `4.1.0`. Alchemy and its Cloudflare integration are pinned to `2.0.0-beta.85`. Each workspace typechecks with its own compiler; the application retains the scaffolded TypeScript preview.

Use pnpm `12.18.0`, pinned in `package.json`. It includes the fix for [incorrect peer warnings for local tarballs](https://github.com/pnpm/pnpm/issues/15298). Peer validation runs against the archives without ignore rules.

## Rendering and UI integration

Foldkit's Vite plugin coordinates client and SSR build identity and injects the installed DevTools overlay into the browser entry. The app supplies its document metadata and early search bootstrap. During development, the server entry disposes its RPC handler before module reevaluation.

The framework supplies the VirtualList scroll fixes for responsive measurements, native scroll observations during layout updates, and preserving the page offset when sorting before the list origin. Browser coverage protects resize anchoring, sorting without page jumps, and returning to the first catalog row with Home.

## Reference source

`repos/foldkit` is a read-only Git subtree of [foldkit/foldkit](https://github.com/foldkit/foldkit), pinned to the same source commit as the archives. It supplies matching examples and documentation. Application imports resolve through the installed packages. Formatting commands use the app's root configuration and skip the subtree.

When upgrading Foldkit, pull the subtree at the commit or release tag matching the new package versions:

```sh
git subtree pull --prefix=repos/foldkit https://github.com/foldkit/foldkit.git <matching-release-ref> --squash
```

Replace `FOLDKIT.md` with the template from that same revision, as described in its upgrade instructions.
