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
