# Foldkit Domains

A [Foldkit](https://foldkit.dev) example of the [Vercel Domains](https://vercel.com/domains) search interaction. The search field arrives in static HTML, accepts edits before hydration, and moves into the header without replacing the input. Domain names update as you type; prices and availability use placeholders until the current lookup completes.

The catalog contains 556 extensions from Vercel’s [supported domains](https://vercel.com/docs/domains/supported-domains) list. Availability and prices are illustrative. The cart supports adding and removing domains. Replace the `FetchDomains` handler in `src/command.ts` to connect a registrar.

## Run locally

Requires Node.js 24.11.1 or newer and pnpm 12.4.2.

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

### Cloudflare through Alchemy

[`infra/alchemy.run.ts`](infra/alchemy.run.ts) declares the site with [Alchemy’s Foldkit integration](https://alchemy.run/cloudflare/frontend/foldkit/) and Cloudflare-backed state. Alchemy builds the app with its existing Vite configuration and deploys the generated Fetch handler and static assets together. Prerendered `/` is served as an asset; unknown paths reach the handler and return HTTP 404.

The `infra` workspace pins Alchemy and its Cloudflare integration to `2.0.0-beta.84`, with Effect `4.0.6`. The application uses Effect `4.0.0`, matching the Foldkit preview’s exact peers. Each workspace typechecks with its own compiler; the application retains the scaffolded TypeScript preview.

Connect a Cloudflare account through Alchemy’s profile command, then preview and deploy the `preview` stage:

```sh
pnpm --dir infra exec alchemy profile edit --add Cloudflare
pnpm run plan --stage preview
pnpm run deploy --stage preview
```

The deploy command reports the public URL. Credentials live in the local Alchemy profile or deployment environment, and generated infrastructure output is gitignored. `pnpm dev:cloudflare` runs Alchemy’s native Foldkit development host on port 5195.

The local Workers check builds the application and runs the production browser regressions against workerd, including HTTP 404 recovery. `wrangler.jsonc` configures this local check; the Alchemy Stack owns deployment. Test a deployed preview with its URL:

```sh
pnpm test:e2e:worker
DOMAINS_BASE_URL=https://your-preview.workers.dev pnpm test:e2e:preview
```

Page-load-to-interaction measurements use the deployed preview with browser caching, device, and network conditions recorded. The demo’s 450 ms lookup delay represents pending pricing; input readiness is a separate measurement.

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
pnpm test:e2e:worker
```

The regression suite protects these contracts:

| Invariant                                                                                                       | Coverage          |
| --------------------------------------------------------------------------------------------------------------- | ----------------- |
| Startup reads the URL, validates the label, and schedules the bootstrap handoff                                 | Story             |
| URL changes start lookups; unrelated URL changes retain the current search                                      | Story             |
| Superseded successes and failures cannot replace current state, including repeated queries and retries          | Story             |
| Typing and clearing invalidate pending work before URL synchronization completes                                | Story             |
| Empty queries return to Idle; invalid labels schedule no lookup; valid input recovers                           | Story             |
| Current failures offer retry and successful retries restore results                                             | Story and Scene   |
| Pending names render without prices, availability claims, or cart actions in cards and rows                     | Scene and browser |
| TLD and availability filters compose, empty results recover, and every sort order works                         | Scene             |
| Filter selections apply after pending availability resolves                                                     | Scene             |
| Cart additions are idempotent, unavailable domains are rejected, and searches preserve selections               | Story             |
| Card and row actions agree with the cart, removals update totals, and clear controls emit the required Commands | Scene             |
| Virtualization bounds mounted rows and preserves scrolling through query and viewport changes                   | Scene and browser |
| Bootstrap listeners release at handoff; early edits, focus, selection, and the input node survive hydration     | Browser           |
| Reloads and history restore queries; initial development HTML is styled; unknown routes return HTTP 404         | Browser           |

Stories and Scenes resolve Commands with explicit Messages. They test state transitions, view wiring, and declared lifecycle behavior without running the handlers. Browser tests exercise the bootstrap, Runtime, real DOM, navigation, and layout. The Workers suite runs the same browser regressions against workerd and verifies HTTP 404s and recovery.

[CI](.github/workflows/ci.yml) runs formatting, types, lint, Stories, Scenes, and all three local browser suites on pull requests and pushes to `main`. The `check` job is the required branch check.

The browser suite builds production output and starts its own preview server on port 5180. Chromium and WebKit cover early typing, focus, selection, input identity, mobile placement, names while prices load, reloads, history, filters, sorting, and the cart. The development check uses port 5181 and holds client scripts back to verify the initial page has its styles. The Workers suite uses port 5182. All local suites refuse to reuse an existing server on their port.

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
