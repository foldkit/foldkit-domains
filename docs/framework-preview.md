# Framework preview notes

This app uses the published Blocks and Layers preview from framework commit `54f8bcd443b4fd18952403a3d02e212abf872d58`. All six Foldkit packages are pinned to matching npm canary versions; the lockfile records their registry integrity.

## Package versions

| Packages                                      | Version                       |
| --------------------------------------------- | ----------------------------- |
| `foldkit`, `@foldkit/ui`, `@foldkit/devtools` | `0.170.0-canary.54f8bcd443b4` |
| `@foldkit/devtools-mcp`                       | `0.26.0-canary.54f8bcd443b4`  |
| `@foldkit/oxlint-plugin`                      | `0.15.4-canary.54f8bcd443b4`  |
| `@foldkit/vite-plugin`                        | `0.29.0-canary.54f8bcd443b4`  |

The application and infrastructure use Effect and platform adapters `4.1.0`. Alchemy and its Cloudflare integration are pinned to `2.0.0-beta.85`. Each workspace typechecks with its own compiler; the application retains the scaffolded TypeScript preview.

Use pnpm `12.18.0`, pinned in `package.json`. The workspace allows these six exact preview versions through its minimum release age check. Peer validation uses the published package metadata without ignore rules.

## Rendering and UI integration

The root completes its Block with `ApplicationBlock.makeLayer({ init, update, view, EffectsLayer })`. Foldkit acquires the children registered by init's Composition; ordinary Layer provision selects the Query and UI implementations. Browser startup, SSR, Stories, and Scenes use the same Block and Layer pair.

Foldkit's Vite plugin coordinates client and SSR build identity and injects the installed DevTools overlay into the browser entry. The app supplies its document metadata and early search bootstrap. During development, the server entry disposes its RPC handler before module reevaluation.

The framework supplies the VirtualList scroll fixes for responsive measurements, native scroll observations during layout updates, and preserving the page offset when sorting before the list origin. Browser coverage protects resize anchoring, sorting without page jumps, and returning to the first catalog row with Home.

## Reference source

`repos/foldkit` is a read-only Git subtree of [foldkit/foldkit](https://github.com/foldkit/foldkit), pinned to the same source commit as the installed packages. It supplies matching examples and documentation. Application imports resolve through the installed packages. Formatting commands use the app's root configuration and skip the subtree.

When upgrading Foldkit, pull the subtree at the commit or release tag matching the new package versions:

```sh
git subtree pull --prefix=repos/foldkit https://github.com/foldkit/foldkit.git <matching-release-ref> --squash
```

Replace `FOLDKIT.md` with the template from that same revision, as described in its upgrade instructions.
