# Foldkit Domains

A [Foldkit](https://foldkit.dev) example of the [Vercel Domains](https://vercel.com/domains) search interaction. The search field arrives in static HTML, accepts edits before hydration, and moves into the header without replacing the input. Domain names update as you type; prices and availability use placeholders until the lookup completes. The first lookup checks the four Top Results, then the visible list loads further domain results.

The catalog contains 556 extensions from Vercel’s [supported domains](https://vercel.com/docs/domains/supported-domains) list. The app starts with the **Demo** data source, which supplies deterministic sample availability and prices. The header’s **Demo / Live** control switches to live availability and pricing without changing the query. Each data source has its own cart and Query cache; reloading starts in Demo. Both use the same Effect RPC contract, and Demo bypasses the registrar and its quotas. With the Live data source, availability and registration/renewal quotes come from Vercel’s [public registrar search API](https://vercel.com/docs/domains/registrar-api), through an Effect backend on the same Cloudflare Worker. The cart supports adding and removing domains; it does not reserve or purchase them. The public search works without registrar credentials. An optional server-only token supports authenticated requests.

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

`pnpm preview` runs the built Fetch handler and assets in local workerd, including Demo search and the Live domain API. A static file server can display the page but cannot answer searches.

Development uses a shared build identity across client and SSR environments, working around separate identities in the pinned preview. Foldkit’s Vite plugin refreshes the SSR module graph during development updates, and the server entry disposes its RPC handler before reevaluation.

Build and deploy the HTML and assets together. Foldkit assigns a coordinated build id so an old document cannot hydrate with an unrelated client bundle. Let the plugin generate the id when one `pnpm build` produces both artifacts.

### Cloudflare through Alchemy

The `preview` stage serves the app at [domains.foldkit.dev](https://domains.foldkit.dev). Alchemy manages the custom hostname on the Website Worker in the Cloudflare account that owns the `foldkit.dev` zone. Other stages do not claim this hostname.

[`infra/alchemy.run.ts`](infra/alchemy.run.ts) declares the site with [Alchemy’s Foldkit integration](https://alchemy.run/cloudflare/frontend/foldkit/) and Cloudflare-backed state. Alchemy builds the app with its existing Vite configuration and deploys the generated Fetch handler and static assets together. Prerendered `/` is served as an asset; domain API requests reach the Effect backend, and unknown page paths return HTTP 404.

The application and infrastructure use Effect `4.0.6`, one of the patch versions verified by the Foldkit preview. Alchemy and its Cloudflare integration are pinned to `2.0.0-beta.84`. Each workspace typechecks with its own compiler; the application retains the scaffolded TypeScript preview.

Alchemy's public Durable Object bridge installs with a type-only patch that exposes its native constructor contract and accepts the canonical Worker's dependency requirements. Its runtime JavaScript is unmodified.

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

Page-load-to-interaction measurements record browser caching, device, and network conditions. Input readiness does not wait for the registrar. Uncached lookup latency includes a 150 ms input debounce for the first range, Worker execution, and registrar requests; it is measured separately from input readiness.

## Code map

`src/client/` owns the Foldkit application, its browser startup, SSR renderer, and Story/Scene tests. `src/server/` owns the Worker entry, RPC handlers, registrar integration, and Durable Objects. `src/shared/` owns the domain and RPC contracts and candidate catalog. Client code and backend services import shared contracts; shared code imports neither implementation. The Worker entry connects backend routing to frontend SSR. Lint enforces these import boundaries, with execution-test exceptions for exercising the real RPC client and server together.

- `src/client/model.ts` and `src/client/message.ts` declare the state and events. App-owned Schemas export same-named decoded types for readable annotations.
- `src/client/init.ts` starts a search from the URL; `src/client/update.ts` maps Messages to search, filter, and cart Steps.
- `src/client/steps/` owns reusable parent Steps shared by update, composition, and init. Its responsibility modules cover search transitions, domain-request execution, and results-list updates. `src/client/domainPlanning.ts` selects the next required candidate range without creating Commands. A `DomainCandidateRange` identifies an offset/limit slice of the ordered candidate catalog; KeyedQuery retains its checked response. Required-domain loading covers the viewport and overscan area or the complete catalog for global filters and sorting. `src/client/searchViewState.ts` derives search status and checked domains from the planned candidate ranges.
- `src/client/filterListboxes.ts` defines typed filter and sort Listbox Blocks. Selections belong to the parent Model. Desktop Listboxes and mobile sheets share transitions through `src/client/steps/filters.ts`; mobile choices apply directly and close their animated sheet. The TLD sheet searches the full supported catalog, with an independent search query that resets when the sheet opens.
- `src/client/domainsQuery.ts` defines the KeyedQuery Block, one-minute freshness, a 100-settled-entry retention bound, and the typed RPC fetch handler. `src/client/subscription.ts` schedules provider cooldown expiry; `src/client/searchCooldown.ts` defines that Model-owned deadline.
- `src/client/command.ts` defines the EffectsLayer, including Clock reads and URL synchronization; `src/client/services.ts` supplies the Runtime-scoped RPC client.
- `src/shared/domainsRpc.ts` shares the RPC payload, success, and failure Schemas. `src/client/rpc.ts` constructs the typed client; `src/server/rpc.ts` supplies HTTP transport and request bounds. `src/server/coordinatedSearch.ts` forwards production lookups to a per-label Durable Object. `src/server/domainSearch.ts` supplies the Effect Service for completed quote storage and shared lookup fibers; `src/server/registrarSearch.ts` supplies provider admission, scoped concurrency permits, and persisted budgets and cooldown. The matching `*Coordinator.ts` files construct per-instance Effect handlers. `src/server/coordinatorRuntime.ts` registers them with Alchemy, and `src/server/coordinatorExports.ts` supplies the native classes through Alchemy’s Durable Object bridge. `src/server/search.ts` supplies the in-process development backend; `src/server/registrar.ts` validates registrar responses.
- `src/shared/domain.ts` defines checked domains, quotes, labels, candidate names, and candidate ranges. `src/client/domain/` exports pure domain code through its barrel: `domain.ts` defines listings, filters, sorting, price formatting, and candidate-range planning; `cart.ts` owns cart Schemas and operations scoped by data source. `src/shared/demoDomains.ts` generates deterministic sample quotes for Demo mode and test fixtures.
- `src/client/route.ts` defines the bidirectional search router; its query Schema handles URL parsing and encoding. The Model stores the parsed Route. Input changes replace the URL, and `ChangedUrl` updates the Route and starts its lookup.
- `src/client/resultsList.ts` creates the Foldkit UI VirtualList Block and locates pending listings within the measured or estimated viewport and overscan area. `src/client/composition.ts` binds it and the cart and filter Dialogs to the root Model; `src/client/resultListings.ts` selects the filtered and sorted listings.
- `src/client/composition.ts` connects the root Definition; `src/client/block.ts` assembles the application.
- `src/client/view.ts` contains named views and Tailwind layout utilities; `src/client/styles.css` defines the Tailwind theme, base styles, reusable components, and single-input positioning.
- `src/client/icon.ts` renders Lucide icons with Foldkit SVG builders; attribution and licenses are in `THIRD_PARTY_NOTICES.md`.
- `src/client/entry.server.ts` renders the same Block for static generation and request-time SSR, including the document and pre-hydration bootstrap. `src/server/entry.ts` delegates page rendering to it, routes `/rpc` and `/rpc/` to the Effect RPC server, and exports the Durable Object classes.

Cloudflare constructs the coordinator classes supplied by Alchemy’s Durable Object bridge and invokes their `fetch` and `alarm` methods. Each constructor builds the search Service once per Durable Object instance. The Effect handler in `src/server/coordinatorRequest.ts` races the search against the native request’s abort signal, interrupting cancelled work and returning a 499 response. The final waiter leaving aborts a shared lookup; other waiters retain their searches. Native classes are unavailable during Node prerendering, so `coordinatorExports.ts` loads the Cloudflare module only where it is available. The existing Website Worker hosts both coordinators with their established class names, namespace bindings, and stored formats.

Unknown paths render a NotFound page with a link back to search. Request-time rendering returns HTTP 404 for those paths.

### Following a search

Start with `steps/search.ts`: input changes request URL replacement, and `ChangedUrl` stores the Route before starting the four Top Results. Changing or clearing the query cancels pending requests. A separate search generation rejects outdated planning Clock Messages; Query owns per-key fetch generations.

`steps/domainLoading.ts` owns request execution. Scheduling reads Effect Clock through a Command. Its completion checks the current search, pending requests, cache freshness, and provider cooldown before calling the bound Query operation. Accepted Query completions enter `applyDomainResultStep`, which applies completion timing and cooldown, then plans further domain requests and informs the results list.

`domainPlanning.ts` answers which candidate range is needed next, returning an `Option<DomainCandidateRange>`. It selects the complete catalog for availability filtering or price sorting; otherwise it asks `resultsList.ts` for the first pending listing in the viewport and overscan area. The planner waits for pending work and leaves failed ranges for explicit retry. `loadRequiredDomainsStep` schedules the selected range. Query data supplies the displayed domain results through `searchViewState.ts`, with no copied quote collection.

Pending listings have no price, availability, or cart action until their quotes arrive. After the four Top Results, the rest of the first page uses a separate non-overlapping range. Scrolling requests missing pages while preserving checked domains. Progressive ranges bypass the input debounce.

All Results uses Foldkit UI’s VirtualList with `ScrollContainer.Window()` and positioned rows. The document scrolls beneath the sticky navigation, and the results occupy their full content height. Groups of six domains preserve the responsive three-column, two-column, and single-column grid, and matching width-based estimates guide layout and progressive quote loading. Measured heights account for wrapping and viewport changes. VirtualList preserves the scroll anchor as results change. A bounded static skeleton preview covers the initial measurement before VirtualList renders its visible window.

## Data sources

`dataSource` belongs to the root Model. The typed Listbox Block exposes the Data source menu through a Binding, with selection owned by the parent. Changing the data source cancels pending lookups and invalidates planning Messages. Query identity includes data source, label, offset, and limit. Late completions cannot install another data source’s results or cooldown, and Live provider cooldowns do not block Demo searches. The cart is stored per data source so sample prices never enter the Live cart. Sample data is labeled next to Top Results and in the footer. The RPC transport retains its `mode` field for existing clients; the Query handler maps `dataSource` to that field.

## Live domain search

The browser calls `SearchDomains` through Effect RPC over HTTP at `/rpc`. Client and server share the label validator, domain result Schema, and typed `RateLimited` / `Unavailable` failures. The RPC client is acquired once for the browser Runtime; each lookup remains an interruptible Foldkit Command. Each server-side RPC transport lives in its HTTP request’s Scope. Production requests route to a Durable Object named for the normalized label; its completed quote cache and pending lookups are shared across Worker isolates. A second Durable Object owns the shared registrar budget. Their Cloudflare classes delegate to Effect Services: `DomainSearch` owns shared lookup fibers and releases provider work when its final waiter leaves; `RegistrarSearch` owns semaphore admission, Effect Clock deadlines, and persisted budget updates. `CoordinatedSearchClient` adapts the native namespace binding to a typed Effect search. The backend accepts a validated offset and limit into the curated 556-extension catalog. The browser requests four candidates initially, then the other 56 first-page candidates and later pages as they enter the virtual list’s viewport and overscan area. A later-page failure preserves checked domains and offers a retry for that page. Price sorting and availability filtering fetch the complete catalog; partial counts identify how many candidates have been checked. Registrar calls contain at most 200 exact names, with at most two batches in flight per search. The registrar coordinator admits individual provider batches within configured second and minute windows and a concurrency limit. Its FIFO queue holds at most 300 waiting batches for at most two seconds. Admission counters and provider cooldown deadlines are persisted; active permits and queue entries belong to the live object and release on completion or cancellation. The provider’s response must contain exactly the requested names in order. Missing, duplicate, reordered, malformed, or negative-price results fail the search instead of becoming quotes for another domain.

For authenticated registrar access, supply `VERCEL_API_TOKEN` in the deployment environment. Alchemy binds it as a Cloudflare secret, and only the server's registrar transport reads it. Do not prefix it with `VITE_` or put it in application state, browser configuration, Git, or chat. Missing credentials select the public endpoint behavior; invalid credentials produce a lookup failure. A token does not establish a higher throughput quota.

The native capacity suite runs 300 simultaneous identical cold-range searches and verifies one provider request, then runs 300 distinct queries against a controlled registrar with 50 ms latency, a configured 24-call concurrency limit, and a fixture-only ten-second queue deadline. This separates admission correctness from local runtime scheduling speed. A separate low-budget case uses the production two-second deadline and verifies bounded rejection and recovery. Those tests measure this backend’s behavior. They do not establish Vercel’s live throughput or uptime. Public launch for hundreds of simultaneous distinct searches requires Vercel to confirm the supported burst and sustained quota and its account, team, or IP scope. Configure the coordinator to that allowance; a token alone does not establish a higher quota.

| Server setting                  | Default | Meaning                                            |
| ------------------------------- | ------- | -------------------------------------------------- |
| `REGISTRAR_REQUESTS_PER_SECOND` | `10`    | Provider calls admitted in one fixed second window |
| `REGISTRAR_REQUESTS_PER_MINUTE` | `60`    | Provider calls admitted in one fixed minute window |
| `REGISTRAR_MAX_CONCURRENT`      | `8`     | Simultaneous provider calls                        |

These are conservative application limits, not a published provider entitlement. Alchemy reads them from the deployment environment. All production labels share the `vercel` coordinator identity; changing a quota updates that object’s configuration without creating a new budget.

A confirmed available name includes its USD registration amount, renewal amount, registration term, and premium status. A two-year quote displays its total amount with “/ 2 years”; price sorting compares registration amounts. Renewal terms appear in the quote’s title and the cart. The registrar’s `available: false` also covers names it could not confirm. Those results are modeled as Unconfirmed, shown as “Not available” with that explanation, and carry no price or cart action.

The browser Model contains one KeyedQuery for candidate ranges keyed by data source, normalized label, offset, and limit. Successful data is fresh for one minute after completion. A visit reads Effect Clock through a Command and passes the timestamp to the bound `requestLoadIfStale` operation. Fresh hits skip debounce and RPC, including during a provider cooldown. Hits update retention recency without extending freshness. The Query retains at most 100 settled entries, including failures; pending entries are protected and may temporarily exceed that bound. Expiry makes a range eligible for revalidation without deleting displayed data. Pending requests hide their prices and cart actions; a failed refresh can retain its previous successful domain results. Displayed domain results are derived from the planned ranges through the Query's public `read` selector, with no second canonical results collection. A reload starts with an empty browser Query Model; DevTools can inspect its ranges and fetch state.

The parent Model owns `maybeSearchCooldown`. Accepted current-search rate limits install the provider's source and deadline. The parent checks it before scheduling uncached work or forced refreshes, and a Subscription removes it at its deadline. Cached hits bypass the restriction. Local blocks preserve the original deadline, and rejected or superseded completions cannot install one. Accepted completion OutMessages coordinate further visible ranges. A failed later range waits for explicit retry.

Successful domain results are also stored for one minute in the label’s SQLite-backed Durable Object. Cache keys include the label, offset, and limit; expiry alarms reclaim stored results. A label bounds cached ranges and simultaneous pending range requests. Concurrent requests for an identical range share one lookup inside that object, with independent response bodies. Failures are not cached. Cached and coalesced results do not consume additional provider budget. The registrar coordinator limits each physical client identity to 30 uncached provider batches per minute, with a bounded in-memory identity table. That abuse guard resets when the object restarts; the persisted provider budget and cooldown do not. Client, application, and provider rate limits produce a typed `RateLimited` failure identifying its source and retry delay. Provider retry headers or a validated retry delay in the response body determine the cooldown, with a one-minute fallback when none is supplied. The browser sends no further RPC requests during a retry window, and the shared registrar coordinator pauses new provider calls across labels during a provider cooldown. RPC encodes success and declared failures in its HTTP response; the interface does not infer domain errors from HTTP status codes. Requests larger than 1 KiB or without JSON content are rejected at the HTTP boundary. Registrar lookups have a fifteen-second deadline, and the browser Command has a twenty-second deadline. Slow registry checks can complete while typing and scrolling stay responsive. Failures offer an explicit retry; there is no fallback to invented availability or prices.

The native input, URL handoff, pending names, and skeletons work before a registrar response. Interrupting a superseded Command aborts the browser HTTP request, while KeyedQuery's per-key generation protects against late results. Each client owns its waiter; disconnecting one client leaves a shared lookup running for its other waiters. The last waiter’s cancellation aborts the provider work and releases its permit. Cloudflare’s `enable_request_signal` and `request_signal_passthrough` compatibility flags support that handoff. Pending shared I/O belongs to Durable Objects; ordinary Worker HTTP requests exchange completed data across the object boundary, following [Workers request isolation](https://developers.cloudflare.com/workers/observability/errors/#cannot-perform-io-on-behalf-of-a-different-request). Quotes can change and are checked only for discovery; the demo cart makes no purchase or reservation.

## Before hydration

`src/client/bootstrap.ts` supplies the inline script that runs after the static markup and before the main module. Its input ID and media queries come from `src/client/searchInput.ts`, shared with the hydrated app. It reads the query from the URL, synchronizes early edits with history, and updates pending domain names. CSS positions the same input in the landing or header location, including on first mobile focus.

Foldkit adopts the existing input node and preserves focus. A controlled `h.Value` reconciles with the initial Model; early edits are not automatically replayed into that Model. The bootstrap stores the query in the URL so init reads it before hydration. A Command removes its listeners when the Runtime takes ownership. Framework support for this handoff is tracked in [foldkit/foldkit#1784](https://github.com/foldkit/foldkit/issues/1784).

The input is editable before the main bundle executes. Measuring page load to interaction across regions requires deployment, network, and device measurements.

## Check the app

```sh
pnpm format:check
pnpm typecheck
pnpm lint
pnpm test
pnpm exec playwright install chromium webkit
pnpm test:e2e:dev
pnpm test:e2e:worker
pnpm test:capacity
```

`pnpm test:e2e:worker` includes the production browser suite and Worker/RPC integration checks. `pnpm test:e2e` is available as a narrower local command.

The regression suite protects these contracts:

| Invariant                                                                                                       | Coverage          |
| --------------------------------------------------------------------------------------------------------------- | ----------------- |
| Startup reads the URL, validates the label, and schedules the bootstrap handoff                                 | Init              |
| URL changes start lookups; unrelated URL changes retain the current search                                      | Story             |
| Superseded successes and failures cannot replace current state, including repeated queries and retries          | Story             |
| Typing and clearing invalidate pending work before URL synchronization completes                                | Story             |
| Empty queries return to Idle; invalid labels schedule no lookup; valid input recovers                           | Story             |
| Fresh cached queries and pages restore immediately; stale ranges revalidate without renewing freshness on hits  | Story and browser |
| Current failures offer retry and successful retries restore results                                             | Story and Scene   |
| Pending names render without prices, availability claims, or cart actions in cards and rows                     | Scene and browser |
| TLD and availability filters compose, empty results recover, and every sort order works                         | Scene             |
| Filter selections apply after pending availability resolves                                                     | Story and browser |
| Cart additions are idempotent, unavailable domains are rejected, and searches preserve selections               | Story             |
| Card and row actions agree with the cart, removals update totals, and clear controls emit the required Commands | Scene             |
| Virtualization bounds mounted rows and preserves scrolling through query and viewport changes                   | Scene and browser |
| Bootstrap listeners release at handoff; early edits, focus, selection, and the input node survive hydration     | Browser           |
| Reloads and history restore queries; initial development HTML is styled; unknown routes return HTTP 404         | Browser           |

Mobile browser regressions in `e2e/domains.mobile.spec.ts` cover narrow portrait and landscape layouts, viewport resizing, readable filter selections, touch target sizes, and submitting or clearing the search. Submission dismisses the touch keyboard before and after hydration. The cart uses Foldkit UI’s Dialog for modal focus, Escape and backdrop dismissal, and page scroll locking; a parent Command returns focus to the cart button after close, including browsers where tapping a button does not focus it.

Accessibility regressions in `e2e/domains.a11y.spec.ts` run axe scans across the landing page, focused empty search, pending and ready results, empty filters, lookup failures, empty and populated carts, and unknown routes at 320, 390, and 1440 CSS pixels. Keyboard tests cover the visible skip link, the complete virtual catalog, modal focus containment and return, cart removal, retry, reduced-motion skeletons, accessible quote and error descriptions, and narrow-screen text spacing. Status announcements retain their DOM nodes and sit outside busy results content. Cart count changes use a persistent polite live region. Arrow keys, Page Up, Page Down, and Home scroll the page instantly through a Command while the results list is focused. End requests the final virtual row through the bound VirtualList operation. VirtualList observes the document viewport. The macOS WebKit tests use [Option-Tab for full webpage navigation](https://support.apple.com/en-gb/guide/safari/cpsh003/mac). These checks exercise browser semantics and keyboard behavior; listening with a screen reader is a separate manual check.

Stories and Scenes resolve Commands with explicit Messages. They test Model transitions, view wiring, and declared lifecycle behavior without running handlers. Root update Stories under `src/client/story/` cover URL ownership, validation, planning Clock admission, cached query/range reuse, progressive loading, explicit page retry, provider cooldown, cancellation races, and cart admission. Generic Query freshness, retention, and completion admission also have framework coverage. App tests exercise the public bound operations and their application consequences.

The search Scene types into the accessible input, resolves URL replacement, explicitly delivers `Navigation.changedUrl`, resolves the Clock and Query fetch, and checks the displayed domain results. Other Scenes protect filters, quote/action visibility, cart totals, multi-year pricing, accessibility semantics, and keyboard scrolling. `src/client/domainsQuery.test.ts` executes the domain-fetching Effect with the production RPC client, a controlled transport, and Effect TestClock to cover typed failures and cooldown deadlines, timeout, and transport abortion. Query wiring tests cover both data sources, debounce, and the originating request metadata. Direct init tests protect URL-derived startup and bootstrap handoff.

Backend tests execute the production RPC and registrar Layers through the typed client with a controlled transport and Effect TestClock, covering batch limits, response identity, quote validation, body bounds, cache expiry, overlapping lookups, admission-window recovery, failures, retry, rate-limit sources, provider cooldown expiry, cache hits without quota consumption, timeouts, and transport abortion. Rate limits use the physical HTTP request's client identity, ignoring identity headers supplied inside RPC messages.

Browser tests exercise the bootstrap, Runtime, real DOM, navigation, and layout with the shared RPC server and controlled fixture handlers. They also cover immediate cached backspace restoration without RPC, renewed requests after cache expiry, registrar failures, retry, unconfirmed availability, multi-year totals, and renewal pricing. CI does not depend on live availability, prices, or third-party uptime. The `pnpm test:capacity` suite uses port 5184 and isolated local Durable Object storage. It covers identical-query coalescing, distinct-query capacity, provider concurrency, queue deadlines, cross-label cooldown, per-client admission, durable cache reuse, expiry, failure retry, and provider quota and cooldown persistence across object restarts. Its cancellation test injects an abort at the Worker boundary because the local HTTP adapter does not forward disconnect signals; client transport abortion is covered by Command execution tests. The Workers suite additionally verifies the RPC HTTP boundary and HTTP 404 recovery. Its dedicated RPC fixture runs the production RPC and registrar Layers inside workerd with a controlled provider, protecting independent overlapping requests, completed-value caching, bounded batch concurrency, admission-window recovery, and recovery after cancelled HTTP requests. The opt-in `pnpm test:live` smoke check uses actual registrar responses and records a video. It targets the running dev server at `http://127.0.0.1:5194` by default; set `DOMAINS_BASE_URL` to check a local Worker or deployed preview. It depends on current provider availability and is excluded from CI.

[CI](.github/workflows/ci.yml) runs formatting, types, lint, Stories, Scenes, development and Worker browser suites, and the native capacity suite on pull requests and pushes to `main`. The `check` job is the required branch check.

The browser suite builds production output and starts its own workerd preview server on port 5180. Chromium and WebKit cover early typing, focus, selection, input identity, mobile placement, names while prices load, reloads, history, filters, sorting, and the cart. The development check uses port 5181 and holds client scripts back to verify the initial page has its styles and checks that client/SSR identities allow hydration. The Workers suite uses port 5182 for the app and port 5183 for its controlled-provider RPC fixture. All local suites refuse to reuse an existing server on their port.

The deployed app includes the Foldkit DevTools button. Select it to inspect Message payloads, Model changes, Commands, and Mounts. Inspect mode shows the selected Message’s state in the inspector while searches and the virtualized results stay live. `@foldkit/devtools` is a production dependency so the Vite plugin includes the overlay in the shipped build. The browser entry explicitly imports the plugin's overlay module for SSR builds. The panel remembers whether each visitor left it open.

The scaffold's `AGENTS.md`, `FOLDKIT.md`, and DevTools MCP configuration support agent-assisted development. The MCP server uses the installed preview package.

## Search timing diagnostics

Run the live diagnostic against a running local Worker or deployed app:

```sh
DOMAINS_BASE_URL=http://127.0.0.1:5196 pnpm diagnose:search
```

The diagnostic performs two uncached searches, revisits a fresh frontend cache entry, and opens a new page to exercise the shared backend cache. It attaches a JSON report with input-to-results and next-frame durations, input-to-request delay, HTTP durations, and backend phase timings. It uses real registrar data, makes a small number of requests, and is excluded from CI.

Requests with `x-domains-timing: 1` receive a `Server-Timing` header. Normal requests do not collect detailed timings. The diagnostic adds this header automatically; the measurements are also visible in the browser Network panel. Timing metadata contains fixed phase names and elapsed milliseconds, without domain labels, client identities, or credentials.

`cache` measures cache acquisition and lookup, `cache-write` measures storing completed domain results, `queue` includes concurrency admission, quota waiting, and budget persistence, and `provider` measures an upstream batch through response decoding. `budget-persist` identifies the storage portion of admission. `rpc`, `quotes`, `registrar`, and `lookup` are inclusive durations; nested phases overlap and must not be added together. A complete-catalog request can contain concurrent provider batches.

`cache-hit`, `cache-miss`, and `cache-shared` are zero-duration outcome markers. A shared waiter records its lookup wait; provider timings belong to the request that started the shared work and may be absent from the waiter's response. Frontend cache hits produce no RPC. Next-frame measurements bracket browser presentation with animation frames; they are not a physical display latency measurement.

## Social sharing assets

The server-rendered HTML includes Open Graph and large-image card metadata for
`https://domains.foldkit.dev`. Search URLs share the app’s canonical homepage
and branded card. The 1200 × 630 sharing image lives at `public/og/domains.png`.

Edit `assets/social-card.svg` or `public/favicon.svg`, then run
`pnpm generate:social` to regenerate the PNG sharing image, favicon, and Apple
touch icon. Commit the generated assets alongside their sources. Page metadata
lives in `src/client/site.ts` and `src/client/entry.server.ts`.

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
