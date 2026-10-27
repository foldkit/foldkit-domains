# Foldkit Domains

A [Foldkit](https://foldkit.dev) example of the [Vercel Domains](https://vercel.com/domains) search interaction. The search field arrives in static HTML, accepts edits before hydration, and moves into the header without replacing the input. Domain names update as you type; prices and availability use placeholders until their quotes arrive. The first lookup checks 60 candidates, and scrolling loads further pages.

The catalog contains 556 extensions from Vercel’s [supported domains](https://vercel.com/docs/domains/supported-domains) list. Availability and registration/renewal quotes come from Vercel’s [public registrar search API](https://vercel.com/docs/domains/registrar-api), through an Effect backend on the same Cloudflare Worker. The cart supports adding and removing domains; it does not reserve or purchase them. The public search works without registrar credentials. An optional server-only token supports authenticated requests.

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
pnpm preview --port 5196
```

The Vite plugin builds the browser and server bundles and prerenders `/` in one command. `dist/client` contains the HTML and assets; `dist/server/fetch.js` exports the Fetch handler for request-time rendering and RPC. Alchemy deploys them together. A query such as `/?q=acme` is restored before the main bundle executes.

Development HTML links the stylesheet directly so the page is styled before client JavaScript runs. Production HTML uses the generated stylesheet manifest.

`pnpm preview` runs the built Fetch handler and assets in local workerd, including the real domain API. A static file server can display the page but cannot answer searches.

Development uses a shared build identity across client and SSR environments, working around separate identities in the pinned preview. Development reloads refresh the SSR module graph so Block Definitions and their Commands are recreated together. This avoids duplicate-declaration errors after editing Command modules in the pinned preview.

Build and deploy the HTML and assets together. Foldkit assigns a coordinated build id so an old document cannot hydrate with an unrelated client bundle. Let the plugin generate the id when one `pnpm build` produces both artifacts.

### Cloudflare through Alchemy

[`infra/alchemy.run.ts`](infra/alchemy.run.ts) declares the site with [Alchemy’s Foldkit integration](https://alchemy.run/cloudflare/frontend/foldkit/) and Cloudflare-backed state. Alchemy builds the app with its existing Vite configuration and deploys the generated Fetch handler and static assets together. Prerendered `/` is served as an asset; domain API requests reach the Effect backend, and unknown page paths return HTTP 404.

The `infra` workspace pins Alchemy and its Cloudflare integration to `2.0.0-beta.84`, with Effect `4.0.6`. The application uses Effect `4.0.0`, matching the Foldkit preview’s exact peers. Each workspace typechecks with its own compiler; the application retains the scaffolded TypeScript preview.

Connect a Cloudflare account through Alchemy’s profile command, then preview and deploy the `preview` stage:

```sh
pnpm --dir infra exec alchemy profile edit --add Cloudflare
pnpm run plan --stage preview
pnpm run deploy --stage preview
```

The deploy command reports the public URL. Credentials live in the local Alchemy profile or deployment environment, and generated infrastructure output is gitignored. `pnpm dev:cloudflare` runs Alchemy’s native Foldkit development host on port 5195. Both Vite development hosts use the in-process backend. The built `pnpm preview` host exercises Durable Objects and their production routing.

The local Workers check builds the application and runs the production browser regressions against workerd, including HTTP 404 recovery. `wrangler.jsonc` configures this local check; the Alchemy Stack owns deployment. Alchemy declares the `DOMAIN_QUOTES` and `REGISTRAR_BUDGET` SQLite-backed Durable Object bindings alongside Website. The local Wrangler fixture uses an additive migration for both classes. The site name and public URL stay stable across updates; do not rename or delete these classes when rolling back application code. Test a deployed preview with its URL:

```sh
pnpm test:e2e:worker
DOMAINS_BASE_URL=https://your-preview.workers.dev pnpm test:e2e:preview
```

Page-load-to-interaction measurements record browser caching, device, and network conditions. Input readiness does not wait for the registrar. Live quote latency includes a 350 ms input debounce, Worker execution, and registrar requests; it is measured separately from input readiness.

## Code map

- `src/model.ts` and `src/message.ts` declare the state and events.
- `src/init.ts` starts a search from the URL; `src/update.ts` owns search, filter, and cart transitions. `src/quoteLoading.ts` plans missing viewport pages and retries.
- `src/command.ts` defines the EffectsLayer, including the interruptible API lookup and URL synchronization; `src/services.ts` supplies the Runtime-scoped RPC client.
- `src/domainsRpc.ts` shares the RPC payload, success, and failure Schemas. `src/rpc.ts` constructs the typed client; `src/server/rpc.ts` supplies HTTP transport and request bounds. `src/server/sharedSearch.ts` forwards production lookups to a per-label Durable Object. `src/server/domainSearchCoordinator.ts` owns completed quote storage and shared lookups; `src/server/registrarCoordinator.ts` owns provider admission and cooldown. `src/server/search.ts` supplies the in-process development backend; `src/server/registrar.ts` validates registrar responses.
- `src/domain.ts` models available quotes and unconfirmed results, candidate names, filtering, and sorting. Test-only quotes live in `src/domain.fixture.ts`.
- `src/route.ts` defines the bidirectional search router; its query Schema handles URL parsing and encoding. The Model stores the parsed Route. Input changes replace the URL, and `ChangedUrl` updates the Route and starts its lookup.
- `src/resultsList.ts` creates the Foldkit UI VirtualList Block. `src/composition.ts` binds it and the cart’s Dialog to the root Model; `src/visibleResultListings.ts` selects visible listings.
- `src/composition.ts` connects the root Definition; `src/block.ts` assembles the application.
- `src/view.ts` contains named views and Tailwind layout utilities; `src/styles.css` defines the Tailwind theme, base styles, reusable components, and single-input positioning.
- `src/icon.ts` renders Lucide icons with Foldkit SVG builders; attribution and licenses are in `THIRD_PARTY_NOTICES.md`.
- `src/entry.server.ts` renders the same Block for static generation and request-time SSR and routes `/rpc` and `/rpc/` to the Effect RPC server.

Unknown paths render a NotFound page with a link back to search. Request-time rendering returns HTTP 404 for those paths.

Each lookup carries a search generation. Changing or clearing the query immediately invalidates and cancels pending work; the URL-change Message starts the new lookup. An outdated response cannot replace current results, even when a query is repeated. Pending listings have no price, availability, or cart action until their quotes arrive. Each search begins with the first 60 candidates; scrolling requests missing pages while preserving checked quotes.

All Results uses Foldkit UI’s VirtualList in a scrollable panel. Groups of six domains preserve the responsive three-column/two-column grid, and measured heights account for wrapping and viewport changes. VirtualList preserves the scroll anchor as results change. A bounded static skeleton preview covers the initial measurement before VirtualList renders its visible window.

## Live domain search

The browser calls `SearchDomains` through Effect RPC over HTTP at `/rpc`. Client and server share the label validator, domain result Schema, and typed `RateLimited` / `Unavailable` failures. The RPC client is acquired once for the browser Runtime; each lookup remains an interruptible Foldkit Command. Each server-side RPC transport lives in its HTTP request’s Scope. Production requests route to a Durable Object named for the normalized label; its completed quote cache and pending lookups are shared across Worker isolates. A second Durable Object owns the shared registrar budget. The backend accepts a validated offset and limit into the curated 556-extension catalog. The browser requests 60 candidates initially, then missing pages as they enter the virtual list’s viewport and overscan area. A later-page failure preserves checked quotes and offers a retry for that page. Price sorting and availability filtering fetch the complete catalog; partial counts identify how many candidates have been checked. Registrar calls contain at most 200 exact names, with at most two batches in flight per search. The registrar coordinator admits individual provider batches within configured second and minute windows and a concurrency limit. Its FIFO queue holds at most 300 waiting batches for at most two seconds. Admission counters and provider cooldown deadlines are persisted; active permits and queue entries belong to the live object and release on completion or cancellation. The provider’s response must contain exactly the requested names in order. Missing, duplicate, reordered, malformed, or negative-price results fail the search instead of becoming quotes for another domain.

For authenticated registrar access, supply `VERCEL_API_TOKEN` in the deployment environment. Alchemy binds it as a Cloudflare secret, and only the server's registrar transport reads it. Do not prefix it with `VITE_` or put it in application state, browser configuration, Git, or chat. Missing credentials select the public endpoint behavior; invalid credentials produce a lookup failure. A token does not establish a higher throughput quota.

The native capacity suite runs 300 simultaneous identical cold-window searches and verifies one provider request, then runs 300 distinct queries against a controlled registrar with 50 ms latency and a configured 24-call concurrency limit. Those tests measure this backend’s behavior. They do not establish Vercel’s live throughput or uptime. Public launch for hundreds of simultaneous distinct searches requires Vercel to confirm the supported burst and sustained quota and its account, team, or IP scope. Configure the coordinator to that allowance; a token alone does not establish a higher quota.

| Server setting                  | Default | Meaning                                            |
| ------------------------------- | ------- | -------------------------------------------------- |
| `REGISTRAR_REQUESTS_PER_SECOND` | `10`    | Provider calls admitted in one fixed second window |
| `REGISTRAR_REQUESTS_PER_MINUTE` | `60`    | Provider calls admitted in one fixed minute window |
| `REGISTRAR_MAX_CONCURRENT`      | `8`     | Simultaneous provider calls                        |

These are conservative application limits, not a published provider entitlement. Alchemy reads them from the deployment environment. All production labels share the `vercel` coordinator identity; changing a quota updates that object’s configuration without creating a new budget.

A confirmed available name includes its USD registration amount, renewal amount, registration term, and premium status. A two-year quote displays its total amount with “/ 2 years”; price sorting compares registration amounts. Renewal terms appear in the quote’s title and the cart. The registrar’s `available: false` also covers names it could not confirm. Those results are modeled as Unconfirmed, shown as “Not available” with that explanation, and carry no price or cart action.

Completed successful quotes are stored for one minute in the label’s SQLite-backed Durable Object. Cache keys include the label, offset, and limit; expiry alarms reclaim stored quotes. A label bounds cached windows and simultaneous pending windows. Concurrent requests for an identical window share one lookup inside that object, with independent response bodies. Failures are not cached. Cached and coalesced results do not consume additional provider budget. The registrar coordinator limits each physical client identity to 30 uncached provider batches per minute, with a bounded in-memory identity table. That abuse guard resets when the object restarts; the persisted provider budget and cooldown do not. Client, application, and provider rate limits produce a typed `RateLimited` failure identifying its source and retry delay. Provider retry headers or a validated retry delay in the response body determine the cooldown, with a one-minute fallback when none is supplied. The browser sends no further RPC requests during a retry window, and the shared registrar coordinator pauses new provider calls across labels during a provider cooldown. RPC encodes success and declared failures in its HTTP response; the interface does not infer domain errors from HTTP status codes. Requests larger than 1 KiB or without JSON content are rejected at the HTTP boundary. Registrar lookups have a fifteen-second deadline, and the browser Command has a twenty-second deadline. Slow registry checks can complete while typing and scrolling stay responsive. Failures offer an explicit retry; there is no fallback to invented availability or prices.

The native input, URL handoff, pending names, and skeletons work before a registrar response. Interrupting a superseded Command aborts the browser HTTP request, while the search generation protects against results already delivered. Each client owns its waiter; disconnecting one client leaves a shared lookup running for its other waiters. The last waiter’s cancellation aborts the provider work and releases its permit. Cloudflare’s `enable_request_signal` and `request_signal_passthrough` compatibility flags support that handoff. Pending shared I/O belongs to Durable Objects; ordinary Worker HTTP requests exchange completed data across the object boundary, following [Workers request isolation](https://developers.cloudflare.com/workers/observability/errors/#cannot-perform-io-on-behalf-of-a-different-request). Quotes can change and are checked only for discovery; the demo cart makes no purchase or reservation.

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
pnpm test:capacity
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

Mobile browser regressions in `e2e/domains.mobile.spec.ts` cover narrow portrait and landscape layouts, viewport resizing, readable filter selections, touch target sizes, and submitting or clearing the search. Submission dismisses the touch keyboard before and after hydration. The cart uses Foldkit UI’s Dialog for modal focus, Escape and backdrop dismissal, and page scroll locking; a parent Command returns focus to the cart button after close, including browsers where tapping a button does not focus it.

Accessibility regressions in `e2e/domains.a11y.spec.ts` run axe scans across the landing page, focused empty search, pending and ready results, empty filters, lookup failures, empty and populated carts, and unknown routes at 320, 390, and 1440 CSS pixels. Keyboard tests cover the visible skip link, the complete virtual catalog, modal focus containment and return, cart removal, retry, reduced-motion skeletons, accessible quote and error descriptions, and narrow-screen text spacing. Status announcements retain their DOM nodes and sit outside busy results content. Cart count changes use a persistent polite live region. Arrow keys, Page Up, Page Down, Home, and End scroll instantly while the results viewport is focused; VirtualList observes those changes through its normal scroll path. The macOS WebKit tests use [Option-Tab for full webpage navigation](https://support.apple.com/en-gb/guide/safari/cpsh003/mac). These checks exercise browser semantics and keyboard behavior; listening with a screen reader is a separate manual check.

Stories and Scenes resolve Commands with explicit Messages. They test state transitions, view wiring, and declared lifecycle behavior without running the handlers. Command execution tests run `FetchDomains.layer` with the production RPC client and a controlled transport, covering debounce timing, typed errors, remote defects, deadlines, originating generations, cooldown expiry, cancellation before dispatch, and cancellation without failure Messages. Progressive quote Stories protect duplicate page admission, quote merging, page retry, complete-catalog operations, and stale-page rejection. Backend tests execute the production RPC and registrar Layers through the typed client with a controlled transport and Effect TestClock, covering batch limits, response identity, quote validation, body bounds, cache expiry, overlapping lookups, admission-window recovery, failures, retry, rate-limit sources, provider cooldown expiry, cache hits without quota consumption, timeouts, and transport abortion. Rate limits use the physical HTTP request’s client identity, ignoring identity headers supplied inside RPC messages.

Browser tests exercise the bootstrap, Runtime, real DOM, navigation, and layout with the shared RPC server and controlled fixture handlers. They also cover registrar failures, retry, unconfirmed availability, multi-year totals, and renewal pricing. CI does not depend on live availability, prices, or third-party uptime. The `pnpm test:capacity` suite uses port 5184 and isolated local Durable Object storage. It covers identical-query coalescing, distinct-query capacity, provider concurrency, queue deadlines, cross-label cooldown, per-client admission, durable cache reuse, expiry, and failure retry. Its cancellation test injects an abort at the Worker boundary because the local HTTP adapter does not forward disconnect signals; client transport abortion is covered by Command execution tests. The Workers suite additionally verifies the RPC HTTP boundary and HTTP 404 recovery. Its dedicated RPC fixture runs the production RPC and registrar Layers inside workerd with a controlled provider, protecting independent overlapping requests, completed-value caching, bounded batch concurrency, admission-window recovery, and recovery after cancelled HTTP requests. The opt-in `pnpm test:live` smoke check uses actual registrar responses and records a video. It targets the running dev server at `http://127.0.0.1:5194` by default; set `DOMAINS_BASE_URL` to check a local Worker or deployed preview. It depends on current provider availability and is excluded from CI.

[CI](.github/workflows/ci.yml) runs formatting, types, lint, Stories, Scenes, all three local browser suites, and the native capacity suite on pull requests and pushes to `main`. The `check` job is the required branch check.

The browser suite builds production output and starts its own workerd preview server on port 5180. Chromium and WebKit cover early typing, focus, selection, input identity, mobile placement, names while prices load, reloads, history, filters, sorting, and the cart. The development check uses port 5181 and holds client scripts back to verify the initial page has its styles and checks that client/SSR identities allow hydration. The Workers suite uses port 5182 for the app and port 5183 for its controlled-provider RPC fixture. All local suites refuse to reuse an existing server on their port.

The deployed app includes the Foldkit DevTools button. Select it to inspect Message payloads, Model changes, Commands, and Mounts. TimeTravel mode pauses the rendered view at a selected Message while live requests continue in the background. Resume returns to the latest state. Network requests and backend state are not rewound. `@foldkit/devtools` is a production dependency so the Vite plugin includes the overlay in the shipped build. The browser entry explicitly imports the plugin's overlay module for SSR builds. The panel remembers whether each visitor left it open.

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
