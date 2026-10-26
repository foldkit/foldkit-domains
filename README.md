# Foldkit Domains

A [Foldkit](https://foldkit.dev) example of the [Vercel Domains](https://vercel.com/domains) search interaction. The search field arrives in static HTML, accepts edits before hydration, and moves into the header without replacing the input. Domain names update as you type; prices and availability use placeholders until the current lookup completes.

The catalog contains 556 extensions from Vercel’s [supported domains](https://vercel.com/docs/domains/supported-domains) list. Availability and prices are illustrative. The cart supports adding and removing domains. Replace the `FetchDomains` handler in `src/command.ts` to connect a registrar.

## Run locally

Requires Node.js 22.22.2 or newer and pnpm 12.4.2.

```sh
pnpm install
pnpm dev
```

This app uses the published Blocks and Layers preview at [commit `f3be22cfeefe`](https://github.com/foldkit/foldkit/commit/f3be22cfeefed437164ad614d08b16d9000e0703). All six Foldkit packages are pinned to exact npm versions with the same canary suffix. The lockfile records their registry integrity. The `create-foldkit-app` SSG scaffold supplies the build, development tooling, and framework conventions.

## Build and deploy

```sh
pnpm build
pnpm preview
```

The Vite plugin builds the browser and server bundles and prerenders `/` in one command. Publish `dist/client` to a static host. A query such as `/?q=acme` is restored before the main bundle executes. The server bundle at `dist/server/fetch.js` also exports a Fetch handler for request-time rendering.

Development HTML links the stylesheet directly so the page is styled before client JavaScript runs. Production HTML uses the generated stylesheet manifest.

Development reloads refresh the SSR module graph so Block Definitions and their Commands are recreated together. This avoids duplicate-declaration errors after editing Command modules in the pinned preview.

Build and deploy the HTML and assets together. Foldkit assigns a coordinated build id so an old document cannot hydrate with an unrelated client bundle. Let the plugin generate the id when one `pnpm build` produces both artifacts.

## Code map

- `src/model.ts` and `src/message.ts` declare the state and events.
- `src/init.ts` starts a search from the URL; `src/update.ts` owns search, filter, and cart transitions.
- `src/command.ts` defines the EffectsLayer, including the interruptible lookup and URL synchronization.
- `src/route.ts` defines the bidirectional search router; its query Schema handles URL parsing and encoding. The Model stores the parsed Route. Input changes replace the URL, and `ChangedUrl` updates the Route and starts its lookup.
- `src/resultsList.ts` creates the Foldkit UI VirtualList Block. `src/composition.ts` binds it to the root Model; `src/results.ts` selects visible listings.
- `src/composition.ts` connects the root Definition; `src/block.ts` assembles the application.
- `src/view.ts` contains named views and Tailwind layout utilities; `src/styles.css` defines the Tailwind theme, base styles, reusable components, and single-input positioning.
- `src/icon.ts` renders Lucide icons with Foldkit SVG builders; attribution and licenses are in `THIRD_PARTY_NOTICES.md`.
- `src/entry.server.ts` renders the same Block for static generation and request-time SSR.

Unknown paths render a NotFound page with a link back to search. Request-time rendering returns HTTP 404 for those paths.

Each lookup carries a search generation. Changing or clearing the query immediately invalidates and cancels pending work; the URL-change Message starts the new lookup. An outdated response cannot replace current results, even when a query is repeated. Pending listings have no price, availability, or cart action until their lookup completes.

All Results uses Foldkit UI’s VirtualList in a scrollable panel. Groups of six domains preserve the responsive three-column/two-column grid, and measured heights account for wrapping and viewport changes. VirtualList preserves the scroll anchor as results change. A bounded static skeleton preview covers the initial measurement before VirtualList renders its visible window.

## Before hydration

`src/bootstrap.mjs` runs after the static markup and before the main module. It reads the query from the URL, synchronizes early edits with history, and updates pending domain names. CSS positions the same input in the landing or header location, including on first mobile focus.

Foldkit adopts the existing input node and preserves focus. A controlled `h.Value` reconciles with the initial Model; early edits are not automatically replayed into that Model. The bootstrap stores the query in the URL so init reads it before hydration. A Command removes its listeners when the Runtime takes ownership. Framework support for this handoff is tracked in [foldkit/foldkit#1784](https://github.com/foldkit/foldkit/issues/1784).

The input is editable before the main bundle executes. Measuring page load to interaction across regions requires deployment, network, and device measurements.

## Check the app

```sh
pnpm format:check
pnpm typecheck
pnpm lint
pnpm test
pnpm exec playwright install chromium webkit
pnpm test:e2e
pnpm test:e2e:dev
```

Stories in `src/story.test.ts` exercise search transitions and stale responses. Scenes in `src/scene.test.ts` drive the view through search, filtering, sorting, and cart interactions.

The browser suite builds production output and starts its own preview server on port 5180. Chromium and WebKit cover early typing, focus, selection, input identity, mobile placement, names while prices load, reloads, history, filters, sorting, and the cart. The development check uses port 5181 and holds client scripts back to verify the initial page has its styles. Both suites refuse to reuse an existing server on their port.

The scaffold's `AGENTS.md`, `FOLDKIT.md`, and DevTools MCP configuration support agent-assisted development. The MCP server uses the installed preview package.

## Framework source

`repos/foldkit` is a read-only Git subtree of [foldkit/foldkit](https://github.com/foldkit/foldkit), pinned to `f3be22cfeefed437164ad614d08b16d9000e0703`. It supplies source, examples, and documentation matching the installed preview packages. Application imports resolve through the installed packages. The app's formatting commands use its root configuration and skip the subtree.

When upgrading Foldkit, pull the subtree at the commit or release tag matching the new package versions:

```sh
git subtree pull --prefix=repos/foldkit https://github.com/foldkit/foldkit.git <matching-release-ref> --squash
```

Replace `FOLDKIT.md` with the template from that same revision, as described in its upgrade instructions.

## License

MIT
