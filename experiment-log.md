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
