# Foldkit Domains

[Try the demo](https://domains.foldkit.dev)

A [Vercel Domains](https://vercel.com/domains) search example built with the CAFE stack: Cloudflare, Alchemy, [Foldkit](https://foldkit.dev), and Effect. The search field arrives in static HTML, accepts edits before hydration, and moves into the header without replacing the input. Domain names update as you type; prices and availability use placeholders until the lookup completes. The first lookup checks the four Top Results, then the visible list loads further domain results.

The catalog contains 556 extensions from Vercel’s [supported domains](https://vercel.com/docs/domains/supported-domains) list. All availability and prices are deterministic sample data, served by an Effect RPC backend on the same Cloudflare Worker. Domain searches make no external API calls and require no registrar credentials. The demo cart supports adding and removing domains; it does not reserve or purchase them.

## Run locally

Requires Node.js 24.11.1 or newer and pnpm 12.4.2.

```sh
pnpm install
pnpm dev
```

This app uses the unreleased Blocks and Layers preview at commit `90746b32d2ca8bc0476de7a051ace396ca590ae0`. All six Foldkit packages are pinned to the matching published npm canary versions, with exact versions and archive integrity in the lockfile. A fresh checkout builds without another framework checkout. The `create-foldkit-app` SSG scaffold supplies the build, development tooling, and framework conventions.

## Build and deploy

```sh
pnpm build
pnpm preview --port 5196
```

The Vite plugin builds the browser and server bundles and prerenders `/` in one command. `dist/client` contains the HTML and assets; `dist/server/fetch.js` exports the Fetch handler for request-time rendering and RPC. Alchemy deploys them together. A query such as `/?q=acme` is restored before the main bundle executes.

Development HTML links the stylesheet directly so the page is styled before client JavaScript runs. Production HTML uses the generated stylesheet manifest.

`pnpm preview` runs the built Fetch handler and assets in local workerd, including the sample-domain RPC backend. A static file server can display the page but cannot answer searches.

Development uses a shared build identity across client and SSR environments, working around separate identities in the pinned preview. Foldkit’s Vite plugin refreshes the SSR module graph during development updates, and the server entry disposes its RPC handler before reevaluation.

Build and deploy the HTML and assets together. Foldkit assigns a coordinated build id so an old document cannot hydrate with an unrelated client bundle. Let the plugin generate the id when one `pnpm build` produces both artifacts.

### Cloudflare through Alchemy

The `preview` stage serves the app at [domains.foldkit.dev](https://domains.foldkit.dev). Alchemy manages the custom hostname on the Website Worker in the Cloudflare account that owns the `foldkit.dev` zone. Other stages do not claim this hostname.

[`infra/alchemy.run.ts`](infra/alchemy.run.ts) declares the site with [Alchemy’s Foldkit integration](https://alchemy.run/cloudflare/frontend/foldkit/) and Cloudflare-backed state. Alchemy builds the app with its existing Vite configuration and deploys the generated Fetch handler and static assets together. Prerendered `/` is served as an asset; domain API requests reach the Effect backend, and unknown page paths return HTTP 404.

The application and infrastructure use Effect `4.0.6`, one of the patch versions verified by the Foldkit preview. Alchemy and its Cloudflare integration are pinned to `2.0.0-beta.84`. Each workspace typechecks with its own compiler; the application retains the scaffolded TypeScript preview.

Connect a Cloudflare account through Alchemy’s profile command, then preview and deploy the `preview` stage:

```sh
pnpm --dir infra exec alchemy profile edit --profile default --add Cloudflare
pnpm run plan --stage preview
pnpm run deploy --stage preview
```

The deploy command reports the public URL. Cloudflare deployment credentials belong in the local Alchemy profile or deployment environment, and generated infrastructure output is gitignored. `pnpm dev:cloudflare` runs Alchemy’s native Foldkit development host on port 5195. Both development and production use the same sample-domain RPC handlers.

The local Workers check builds the application and runs the production browser regressions against workerd, including HTTP 404 recovery. `wrangler.jsonc` configures this local check; the Alchemy Stack owns deployment. The deployed suite checks browser behavior and the real RPC endpoint, including concurrent searches. Set `DOMAINS_BASE_URL` to the deployment to test:

```sh
pnpm test:e2e:worker
DOMAINS_BASE_URL=https://domains.foldkit.dev pnpm test:e2e:preview
```

Input readiness does not wait for a lookup. Uncached first-range requests use a 150 ms debounce; progressive ranges bypass it. The browser loads sample data asynchronously through RPC.

## Code map

`src/client/` owns the Foldkit application, browser startup, SSR renderer, and Story/Scene tests. `src/server/` owns the Worker entry and sample-domain RPC handlers. `src/shared/` owns domain and RPC contracts, the candidate catalog, and sample-data generation. Shared code imports neither implementation. The Worker entry connects backend routing to frontend SSR. Lint enforces these import boundaries, with execution-test exceptions for exercising the real RPC client and server together.

- `src/client/model.ts` and `src/client/message.ts` declare state and events. `init.ts` starts a search from the URL; `update.ts` maps Messages to search, filter, and cart transitions.
- `src/client/steps/` owns reusable parent Steps shared by update, composition, and init. `domainPlanning.ts` selects the next required candidate range without creating Commands. `searchViewState.ts` derives search status and checked domains from Query data.
- `src/client/domainsQuery.ts` defines the KeyedQuery Block, one-minute freshness, a 100-settled-entry retention bound, and the typed RPC fetch handler. `command.ts` defines the EffectsLayer, including Clock reads and URL synchronization; `services.ts` supplies the Runtime-scoped RPC client.
- `src/shared/domainsRpc.ts` shares RPC payload, success, and failure Schemas. `src/client/rpc.ts` constructs the typed client; `src/server/rpc.ts` supplies HTTP transport and request bounds; `src/server/search.ts` serves deterministic sample results without outbound requests.
- `src/shared/domain.ts` defines domains, pricing, labels, candidates, and ranges. `src/shared/demoDomains.ts` generates sample results. `src/client/domain/` exports listings, filters, sorting, formatting, candidate-range planning, and the Cart Schema through its barrel.
- `src/client/filterListboxes.ts` defines typed filter and sort Listbox Blocks. Desktop Listboxes and mobile sheets share transitions through `steps/filters.ts`; mobile choices apply directly and close their animated sheet. The TLD sheet searches the full catalog.
- `src/client/route.ts` defines the bidirectional search router. The Model stores the parsed Route. Input changes replace the URL, and `ChangedUrl` updates the Route before starting its lookup.
- `src/client/resultsList.ts` creates the VirtualList Block and locates pending listings in the viewport and overscan area. `composition.ts` binds it, Query, filter Listboxes, and cart/filter Dialogs to the root Model. `resultListings.ts` selects the displayed listings; `block.ts` assembles the application.
- `src/client/view.ts` contains named views and layout utilities; `styles.css` defines the Tailwind theme, reusable components, and single-input positioning. `icon.ts` renders Lucide icons; attribution is in `THIRD_PARTY_NOTICES.md`.
- `src/client/entry.server.ts` renders the same Block for static generation and request-time SSR. `src/server/entry.ts` delegates page rendering, routes `/rpc` and `/rpc/` to the Effect RPC server, and disposes its handler on development reload.

Unknown paths render a NotFound page with a link back to search and return HTTP 404.

### Following a search

Start with `steps/search.ts`: input changes request URL replacement, and `ChangedUrl` stores the Route before starting the four Top Results. Changing or clearing the query cancels pending requests. A separate search generation rejects outdated planning Clock Messages; Query owns per-key fetch generations.

`steps/domainLoading.ts` owns request execution. Scheduling reads Effect Clock through a Command. Its completion checks the current search, pending requests, and cache freshness before calling the bound Query operation. Accepted Query completions enter `applyDomainResult`, which plans further domain requests and informs the results list.

`domainPlanning.ts` answers which candidate range is needed next, returning an `Option<DomainCandidateRange>`. It selects the complete catalog for availability filtering or price sorting; otherwise it asks `resultsList.ts` for the first pending listing in the viewport and overscan area. The planner waits for pending work and leaves failed ranges for explicit retry. `loadRequiredDomains` schedules the selected range. Query data supplies the displayed domain results through `searchViewState.ts`, without copying the cached domains into another Model field.

Pending listings have no price, availability, or cart action until their results arrive. After the four Top Results, the rest of the first page uses a separate non-overlapping range. Scrolling requests missing pages while preserving checked domains. Progressive ranges bypass the input debounce.

All Results uses Foldkit UI’s VirtualList with `ScrollContainer.Window()` and positioned rows. The document scrolls beneath the sticky navigation, and the results occupy their full content height. Groups of six domains preserve the responsive three-column, two-column, and single-column grid, and matching width-based estimates guide layout and progressive domain loading. Measured heights account for wrapping and viewport changes. VirtualList preserves the scroll anchor as results change. A bounded static skeleton preview covers the initial measurement before VirtualList renders its visible window.

## Sample domain search

The browser calls `SearchDomains` through Effect RPC over HTTP at `/rpc`. Client and server share the label validator, domain result Schema, candidate-range bounds, and typed `Unavailable` failure. The RPC client is acquired once for the browser Runtime; each lookup is an interruptible Foldkit Command. Each server-side RPC transport lives in its HTTP request’s Scope.

The backend generates deterministic availability and USD registration/renewal prices from the normalized label and curated candidate catalog. It returns a validated offset/limit slice and makes no outbound network requests. Sample data is labeled beside Top Results and in the footer; the cart explicitly makes no purchase or reservation. Unconfirmed sample names have no price or cart action.

The browser requests four candidates initially, then the other 56 first-page candidates and later pages as they enter the virtual list’s viewport and overscan area. A later-page transport failure preserves checked domains and offers an explicit retry. Price sorting and availability filtering request the complete catalog. Partial counts identify how many candidates have loaded.

KeyedQuery owns the frontend cache in the root Model. Its key includes the normalized label, offset, and limit. Fresh results are reused for one minute after completion, bypassing debounce and RPC. Hits update recency without extending freshness. At most 100 settled entries are retained; pending entries are protected. Changing a query cancels its pending requests, and Query generations reject stale, canceled, and duplicate completions. Cached results are not copied into another Model collection.

Requests larger than 1 KiB or without JSON content are rejected at the HTTP boundary. The browser Command has a twenty-second deadline and maps transport failures to a retriable error. Interrupting a superseded Command aborts the browser HTTP request. The app exercises caching, retry, progressive loading, and cancellation against the sample backend.

## Before hydration

`src/client/bootstrap.ts` supplies the inline script that runs after the static markup and before the main module. Its input ID and media queries come from `src/client/searchInput.ts`, shared with the hydrated app. It reads the query from the URL, synchronizes early edits with history, and updates pending domain names. CSS positions the same input in the landing or header location, including on first mobile focus.

Foldkit adopts the existing input node and preserves focus. A controlled `h.Value` reconciles with the initial Model; early edits are not automatically replayed into that Model. The bootstrap stores the query in the URL so init reads it before hydration. A Command removes its listeners when the Runtime takes ownership. Framework support for this handoff is tracked in [foldkit/foldkit#1784](https://github.com/foldkit/foldkit/issues/1784).

The input is editable before the main bundle executes.

## Check the app

```sh
pnpm format:check
pnpm typecheck
pnpm lint
pnpm test
pnpm exec playwright install chromium webkit
pnpm test:e2e:dev
pnpm test:e2e:worker
```

`pnpm test:e2e:worker` includes the production browser suite and Worker/RPC integration checks. `pnpm test:e2e` is available as a narrower local command.

The regression suite protects these contracts:

| Invariant                                                                                                       | Coverage              |
| --------------------------------------------------------------------------------------------------------------- | --------------------- |
| Startup reads the URL, validates the label, and schedules the bootstrap handoff                                 | Init                  |
| URL changes start lookups; unrelated URL changes retain the current search                                      | Story                 |
| Superseded successes and failures cannot replace current state, including repeated queries and retries          | Story                 |
| Typing and clearing invalidate pending work before URL synchronization completes                                | Story                 |
| Empty queries return to Idle; invalid labels schedule no lookup; valid input recovers                           | Story                 |
| Fresh cached queries and pages restore immediately; stale ranges revalidate without renewing freshness on hits  | Story and browser     |
| Current failures offer retry; failed stale refreshes retain checked results and successful retries replace them | Story and Scene       |
| Pending names render without prices, availability claims, or cart actions in cards and rows                     | Scene and browser     |
| TLD and availability filters compose, empty results recover, and every sort order works                         | Story, Scene, browser |
| Filter selections apply after pending availability resolves                                                     | Story and browser     |
| Cart additions are idempotent, unavailable domains have no purchase controls, and searches preserve selections  | Story and Scene       |
| Card and row actions agree with the cart, removals update totals, and clear controls emit the required Commands | Scene                 |
| Virtualization bounds mounted rows and preserves scrolling through query and viewport changes                   | Scene and browser     |
| Bootstrap listeners release at handoff; early edits, focus, selection, and the input node survive hydration     | Browser               |
| Reloads and history restore queries; initial development HTML is styled; unknown routes return HTTP 404         | Browser               |

Mobile browser regressions in `e2e/domains.mobile.spec.ts` cover narrow portrait and landscape layouts, viewport resizing, readable filter selections, touch target sizes, and submitting or clearing the search. Submission dismisses the touch keyboard before and after hydration. The cart uses Foldkit UI’s Dialog for modal focus, Escape and backdrop dismissal, and page scroll locking; a parent Command returns focus to the cart button after close, including browsers where tapping a button does not focus it.

Accessibility regressions in `e2e/domains.a11y.spec.ts` run axe scans across the landing page, focused empty search, pending and ready results, empty filters, lookup failures, empty and populated carts, and unknown routes at 320, 390, and 1440 CSS pixels. Keyboard tests cover the visible skip link, the complete virtual catalog, modal focus containment and return, cart removal, retry, reduced-motion skeletons, accessible pricing and error descriptions, and narrow-screen text spacing. Status announcements retain their DOM nodes and sit outside busy results content. Cart count changes use a persistent polite live region. Arrow keys, Page Up, Page Down, and Home scroll the page instantly through a Command while the results list is focused. End requests the final virtual row through the bound VirtualList operation. VirtualList observes the document viewport. The macOS WebKit tests use [Option-Tab for full webpage navigation](https://support.apple.com/en-gb/guide/safari/cpsh003/mac). These checks exercise browser semantics and keyboard behavior; listening with a screen reader is a separate manual check.

Stories and Scenes resolve Commands with explicit Messages. They test Model transitions, view wiring, and declared lifecycle behavior without running handlers. Root update Stories under `src/client/story/` cover URL ownership, validation, planning Clock admission, cached query/range reuse, progressive loading, explicit page retry, cancellation races, and cart admission. Generic Query freshness, retention, and completion admission also have framework coverage. App tests exercise the public bound operations and their application consequences. Assert domain results, scheduled work, and user-visible recovery rather than the incidental order of internal bookkeeping. Add browser coverage when real focus, hydration, scrolling, or geometry is the contract; use execution tests for transport, interruption, and RPC request lifetimes.

The search Scene types into the accessible input, resolves URL replacement, explicitly delivers `Navigation.changedUrl`, resolves the Clock and Query fetch, and checks the displayed domain results. Other Scenes protect filters, pricing and cart-action visibility, cart totals, multi-year pricing, accessibility semantics, and keyboard scrolling. `src/client/domainsQuery.test.ts` executes the domain-fetching Effect with the production RPC client, a controlled transport, and Effect TestClock to cover typed failures, timeout, and transport abortion. Query wiring tests cover debounce and the originating request metadata. Direct init tests protect URL-derived startup and bootstrap handoff.

Backend tests execute the production RPC Layer through the typed client. They cover deterministic sample results, complete and partial catalog ranges, label and range validation, malformed JSON, oversized streamed bodies, JSON content requirements, response caching headers, and the absence of outbound HTTP requests.

Browser tests exercise bootstrap, Runtime, real DOM, navigation, and layout with the sample backend and controlled RPC fixtures. They also cover immediate cached backspace restoration without RPC, renewed requests after cache expiry, lookup failures, retry, unconfirmed availability, multi-year totals, and renewal pricing. The Workers suite verifies HTTP 404 recovery against the real sample backend. Its dedicated RPC fixture runs the production handler inside workerd, protecting range handling, deterministic repeat results, independent overlapping requests, and the HTTP request bounds. CI does not depend on third-party domain availability, prices, or uptime.

[CI](.github/workflows/ci.yml) runs formatting, types, lint, Stories, Scenes, development and Worker browser suites on pull requests and pushes to `main`. The `check` job is the required branch check.

The browser suite builds production output and starts its own workerd preview server on port 5180. Chromium and WebKit cover early typing, focus, selection, input identity, mobile placement, names while prices load, reloads, history, filters, sorting, and the cart. The development check uses port 5181 and holds client scripts back to verify the initial page has its styles and checks that client/SSR identities allow hydration. The Workers suite uses port 5182 for the app and port 5183 for its sample RPC fixture. All local suites refuse to reuse an existing server on their port.

The deployed app includes the Foldkit DevTools button. Select it to inspect Message payloads, Model changes, Commands, and Mounts. Inspect mode shows the selected Message’s state in the inspector while searches and the virtualized results stay live. `@foldkit/devtools` is a production dependency so the Vite plugin includes the overlay in the shipped build. The browser entry explicitly imports the plugin's overlay module for SSR builds. The panel remembers whether each visitor left it open.

The scaffold's `AGENTS.md`, `FOLDKIT.md`, and DevTools MCP configuration support agent-assisted development. The MCP server uses the installed preview package.

## Social sharing assets

The server-rendered HTML includes Open Graph and large-image card metadata for
`https://domains.foldkit.dev`. Search URLs share the app’s canonical homepage
and branded card. The 1200 × 630 sharing image lives at `public/og/domains.png`.

Edit `assets/social-card.svg` or `public/favicon.svg`, then run
`pnpm generate:social` to regenerate the PNG sharing image, favicon, and Apple
touch icon. Commit the generated assets alongside their sources. Page metadata
lives in `src/client/site.ts` and `src/client/documentHead.ts`.

## Framework source

`repos/foldkit` is a read-only Git subtree of [foldkit/foldkit](https://github.com/foldkit/foldkit), pinned to `90746b32d2ca8bc0476de7a051ace396ca590ae0`. It supplies source, examples, and documentation matching the installed preview packages. Application imports resolve through the installed packages. The app's formatting commands use its root configuration and skip the subtree.

The UI dependency patch preserves responsive scroll anchors and accepts native
scroll observations when their offset changes during a pending row-layout update.
Browser coverage protects both resize anchoring and returning to the first
catalog row with Home.

When upgrading Foldkit, pull the subtree at the commit or release tag matching the new package versions:

```sh
git subtree pull --prefix=repos/foldkit https://github.com/foldkit/foldkit.git <matching-release-ref> --squash
```

Replace `FOLDKIT.md` with the template from that same revision, as described in its upgrade instructions.

## License

MIT
