# Storefront Autoresearch Log

This log tracks the continuous optimization loop for the bearing storefront.

## Loop Rules

- Measure baseline before optimizing.
- Test one hypothesis per round.
- Run correctness gates before measuring: lint, unit tests, production build, and desktop/mobile browser smoke checks.
- Record every round in `results.tsv`.
- Keep only variants that pass correctness and improve or clearly preserve measured performance while improving UX.
- Revert failed code variants and log the failure.
- Commit and push every kept round.

## Rounds

### Round 0 - crash - Lighthouse runner on Windows

- Hypothesis: a reusable Lighthouse script can establish the baseline.
- Result: crash.
- Failure: Node attempted to spawn `npx.cmd` directly and failed with `spawnSync npx.cmd EINVAL`.
- Action: fixed the measurement script to launch `npx` through the shell on Windows.
- Commit: not promoted as an optimization; recorded as setup failure.

### Round 1 - keep - Baseline after storefront polish

- Hypothesis: the existing storefront polish commit is the starting winner for the continuous loop.
- Correctness: lint completed with existing warnings, 42 tests passed, production build passed.
- Metrics: mobile Lighthouse 94, desktop Lighthouse 100, mobile LCP 3115ms, desktop LCP 666ms, 25 requests, 256.9KB transfer, 324.0KB JS gzip, 8.9KB CSS gzip.
- Action: keep as baseline for future variants.

### Round 2 - keep - Load chat assistant on demand

- Hypothesis: rendering the full chat assistant on initial page load pulls markdown/chat chunks into the storefront critical path.
- Change: replaced the always-rendered chat assistant with a small fixed entry button that loads the full assistant only after click.
- Correctness: lint completed with existing warnings, 42 tests passed, production build passed, desktop/mobile smoke passed, and click-to-open chat loaded the panel.
- Metrics: mobile Lighthouse 96, desktop Lighthouse 100, mobile LCP 2735ms, desktop LCP 538ms, 23 requests, 209.4KB transfer, 324.4KB JS gzip, 9.0KB CSS gzip.
- Decision: keep. The variant reduced first-load requests by 2, transfer by 47.5KB, and mobile LCP by 380ms against Round 1.

### Round 3 - keep - Defer product detail and cart panels

- Hypothesis: product detail and cart panels are not needed for the first storefront paint, so loading them only when selected can reduce first-load transfer.
- Change: dynamically imported the product detail view with a matching skeleton and dynamically imported the cart panel with client-only rendering.
- Correctness: lint completed with existing warnings, 42 tests passed, production build passed, desktop/mobile detail smoke passed, and direct add-to-cart opened the cart panel.
- Metrics: mobile Lighthouse 97, desktop Lighthouse 100, mobile LCP 2605ms, desktop LCP 584ms, 22 requests, 195.0KB transfer, 349.1KB JS gzip, 9.0KB CSS gzip.
- Decision: keep. Mobile LCP improved by 130ms and first-load transfer dropped by 14.4KB against Round 2; desktop LCP regressed by 46ms but remained score 100 and within the expected single-run variance.

### Round 4 - discard - Keep hero mounted while product list loads

- Hypothesis: the storefront should keep the real hero mounted while product data loads, instead of replacing the whole page with a skeleton.
- Change: moved loading UI into the product grid and kept the hero/title shell mounted.
- Correctness: lint completed with existing warnings, 42 tests passed, and production build passed.
- Metrics: mobile Lighthouse 95, desktop Lighthouse 100, mobile LCP 2458ms, desktop LCP 541ms, mobile CLS 0.1047, 22 requests, 194.9KB transfer, 349.1KB JS gzip, 9.0KB CSS gzip.
- Decision: discard before commit. LCP improved, but mobile CLS regressed too far because the product catalog shifted while loading state was inserted after first paint.

### Round 5 - discard - Reserve featured product slots during loading

- Hypothesis: reserving the featured product strip should remove the layout shift from Round 4 while preserving the faster LCP.
- Change: added same-as-final featured product placeholders during the initial loading state.
- Correctness: lint completed with existing warnings, 42 tests passed, and production build passed.
- Metrics: mobile Lighthouse 95, desktop Lighthouse 100, mobile LCP 2443ms, desktop LCP 536ms, mobile CLS 0.1047, 22 requests, 195.0KB transfer, 349.2KB JS gzip, 9.0KB CSS gzip.
- Decision: discard before commit. The layout shift remained; Lighthouse showed the product catalog still moved because the store rendered one frame with `loading` false before the effect flipped it true.

### Round 6 - keep - Stabilize hero and initial product loading state

- Hypothesis: matching the store's initial loading state to the real initial fetch will keep the first paint and loading paint structurally identical.
- Change: kept the hero mounted, added local product-grid and featured-strip placeholders, and changed the product store default loading state to true with matching test coverage.
- Correctness: lint completed with existing warnings, 42 tests passed, production build passed, desktop/mobile detail smoke passed, and direct add-to-cart opened the cart panel.
- Metrics: mobile Lighthouse 98, desktop Lighthouse 100, mobile LCP 2441ms, desktop LCP 538ms, mobile CLS 0.0014, desktop CLS 0.0013, 22 requests, 195.1KB transfer, 349.2KB JS gzip, 9.0KB CSS gzip.
- Decision: keep. Against Round 3, mobile LCP improved by 164ms and CLS returned to a safe value; requests and transfer stayed effectively flat.

### Round 7 - discard - Direct localStorage language detection

- Hypothesis: replacing `i18next-browser-languagedetector` with a small direct localStorage/navigator resolver can reduce the storefront's common JavaScript.
- Change: removed the detector runtime import and initialized i18n from localStorage or navigator language.
- Correctness: lint completed with existing warnings, 42 tests passed, and production build passed, but persisted-language browser smoke failed.
- Metrics: mobile Lighthouse 98, desktop Lighthouse 100, mobile LCP 2439ms, desktop LCP 535ms, 22 requests, 193.1KB transfer, 347.3KB JS gzip, 9.0KB CSS gzip.
- Decision: discard before commit. It improved transfer and JS size, but a user with `lang=en` in localStorage hit React hydration error 418 because the client rendered English over server-rendered Chinese HTML.

### Round 8 - keep - Hydration-safe lightweight i18n persistence

- Hypothesis: initializing i18n as Chinese for the server and first client paint, then applying stored language after mount, can preserve the JS savings without hydration mismatch.
- Change: kept i18n initial language fixed to `zh`, removed the detector runtime, and moved persisted language application into the mounted header effect.
- Correctness: lint completed with existing warnings, 42 tests passed, production build passed, persisted-language smoke passed, and product detail still opened.
- Metrics: mobile Lighthouse 98, desktop Lighthouse 100, mobile LCP 2441ms, desktop LCP 533ms, mobile CLS 0.0014, 22 requests, 193.1KB transfer, 347.3KB JS gzip, 9.0KB CSS gzip.
- Decision: keep. Transfer dropped by 2.0KB and JS gzip by 1.9KB against Round 6 while preserving hydration correctness.

### Round 9 - keep - Local storefront text provider

- Hypothesis: replacing storefront `react-i18next` usage with a small local text provider can remove i18next/react-i18next from the critical storefront path while preserving language persistence.
- Change: added a local `StorefrontLanguageProvider`, moved Header/ProductList/ProductDetail/Cart text to it, and removed global i18n initialization from `_app`.
- Correctness: an initial draft added one new lint warning for synchronous effect state; fixed before measurement by applying stored language in `requestAnimationFrame`. Final lint completed with existing warnings, 42 tests passed, production build passed, language persistence smoke passed, and detail/cart smoke passed.
- Metrics: mobile Lighthouse 98, desktop Lighthouse 100, mobile LCP 2293ms, desktop LCP 536ms, mobile CLS 0.0014, 21 requests, 175.5KB transfer, 323.0KB JS gzip, 9.0KB CSS gzip.
- Decision: keep. Against Round 8, first-load requests dropped by 1, transfer dropped by 17.6KB, JS gzip dropped by 24.3KB, TBT reached 0ms, and mobile LCP improved by 148ms.

### Round 10 - keep - Derive storefront categories from products

- Hypothesis: the storefront does not need a separate first-load `/api/categories` request because category tabs can be derived from the full product payload already fetched for the catalog.
- Change: removed the homepage `fetchCategories()` call and derived categories in the product store whenever the all-products fetch succeeds.
- Correctness: lint completed with existing warnings, 42 tests passed, production build passed, category smoke passed with no `/api/categories` request, product detail opened, and cart opened.
- Metrics: mobile Lighthouse 99, desktop Lighthouse 100, mobile LCP 2267ms, desktop LCP 529ms, mobile CLS 0.0014, 20 requests, 174.2KB transfer, 323.0KB JS gzip, 9.0KB CSS gzip.
- Decision: keep. Against Round 9, first-load requests dropped by 1, transfer dropped by 1.3KB, mobile LCP improved by 26ms, and mobile Lighthouse reached 99.

### Round 11 - discard - Demote catalog grid image priority

- Hypothesis: the first catalog-card images are below the hero, so loading them lazily instead of eager/high priority could reduce first-load network contention.
- Change: removed `priority` from catalog grid product images while leaving the featured strip images eager.
- Correctness: lint completed with existing warnings, 42 tests passed, production build passed, desktop/mobile smoke passed, category filtering restored, product detail opened, cart opened, and language persistence passed.
- Metrics: mobile Lighthouse 99, desktop Lighthouse 100, mobile LCP 2261ms, desktop LCP 528ms, mobile CLS 0.0014, 20 requests, 174.2KB transfer, 323.0KB JS gzip, 9.0KB CSS gzip.
- Decision: discard before commit. The measured LCP change was noise-level and first-load requests/transfer were unchanged, so the variant did not clear the promotion bar.

### Round 12 - keep - Disable account route prefetch from storefront header

- Hypothesis: the account link is not part of the first storefront shopping path, and automatic Next.js route prefetch pulls account chunks into the homepage Lighthouse run.
- Change: set `prefetch={false}` on every header account link while keeping the account route reachable on click.
- Correctness: lint completed with existing warnings, 42 tests passed, production build passed, desktop/mobile smoke passed, account link remained present, category filtering restored, product detail opened, cart opened, language persistence passed, and no `/api/categories` request was made.
- Metrics: mobile Lighthouse 99, desktop Lighthouse 100, mobile LCP 2262ms, desktop LCP 531ms, mobile CLS 0.0014, 16 requests, 160.8KB transfer, 323.1KB JS gzip, 9.0KB CSS gzip.
- Decision: keep. Against Round 10, first-load requests dropped by 4 and transfer dropped by 13.4KB while Lighthouse scores, CLS, and LCP stayed effectively unchanged.

### Round 13 - keep - Split product API client from shared API

- Hypothesis: importing the full `api.ts` module into `productStore` brings customer, payment, and order API helpers into the storefront homepage chunk even though first load only needs product requests.
- Change: added a typed `productApi.ts`, changed `productStore` to import product requests from it, updated store tests to mock it directly, and kept `api.ts` product exports compatible via re-export.
- Correctness: lint completed with existing warnings reduced from 55 to 52, 42 tests passed, production build passed, desktop/mobile smoke passed, category filtering restored, product detail opened, cart opened, language persistence passed, and no `/api/categories` request was made.
- Metrics: mobile Lighthouse 99, desktop Lighthouse 100, mobile LCP 2265ms, desktop LCP 533ms, mobile CLS 0.0014, 16 requests, 160.5KB transfer, 322.8KB JS gzip, 9.0KB CSS gzip.
- Decision: keep. Against Round 12, first-load transfer dropped by 0.3KB and JS gzip dropped by 0.3KB while request count, Lighthouse scores, and CLS stayed stable.
