## Problem Statement

The Payment settlement refactor (issue #41) successfully deepened the state-transition and idempotency logic into `PaymentSettlement` and `OrderLifecycleAdapter`. However, the orchestrator surface still contains shallow areas that leak implementation details into callers: raw SQL query-building for pagination and stats, inconsistent response DTOs, fragile transaction ID generation, and duplicate route endpoints that were flagged in the May 25 architecture review but remain unfixed. Additionally, the `orderSyncFailed` path in `PaymentSettlement` is silently swallowed — there is no reconciliation mechanism to detect when a payment is settled but the order status was never updated.

From the maintainer's perspective, adding a new admin dashboard feature or a new payment provider requires understanding the orchestrator's internal SQL, the route's response-shaping logic, and the duplicate endpoint convention simultaneously. From the operator's perspective, a payment-order status drift would go unnoticed until a customer complains.

## Solution

Harden the Payment subsystem by extracting a `PaymentRepository` for data access, unifying response DTOs through the orchestrator, removing duplicate endpoints, adding a payment-order reconciliation check, and fixing stale documentation. The settlement seam from #41 stays untouched — this PRD only addresses the surface around it.

## User Stories

1. As an admin, I want the payment list endpoint to use a proper repository with safe pagination, so that the dashboard does not break when the query shape changes.
2. As an admin, I want payment statistics to be computed through a tested data-access module, so that reconciliation reports are reliable.
3. As an admin, I want only one endpoint for creating payments (`/checkout`), so that there is no confusion about which endpoint to call.
4. As an admin, I want only one endpoint for querying payment status (`/status/:id`), so that there is no ambiguity between public and internal views.
5. As a frontend developer, I want the public payment status response to be shaped by the service layer, so that the route does not pick fields from a raw DB row.
6. As a backend maintainer, I want transaction IDs generated with a collision-safe mechanism (UUID or sequence), so that concurrent payment creation does not produce duplicate order numbers.
7. As a backend maintainer, I want the `db` parameter removed from the payment route factory signature, so that the route's dependency on the orchestrator is explicit and minimal.
8. As an operator, I want a reconciliation check that detects payment-order status drift (payment is `paid` but order is still `pending`), so that silent sync failures are surfaced.
9. As an operator, I want the `orderSyncFailed` flag from `PaymentSettlement.settlePaid` to be logged at error level and optionally trigger an alert, so that order lifecycle gaps are diagnosable.
10. As a QA engineer, I want repository-level tests for pagination, filtering, and stats queries, so that data-access correctness does not depend on HTTP route tests.
11. As a QA engineer, I want a reconciliation test that verifies drift detection when `markPaid` fails, so that the silent-failure path is covered.
12. As a future contributor, I want `CLAUDE.md` to reflect the current payment wiring (routes in `routes/payment.js`, not inline in `app.js`), so that onboarding documentation is accurate.
13. As a future contributor, I want the architecture review's candidate #10 (dead code removal) to be resolved, so that the codebase does not accumulate flagged-but-unfixed debt.

## Implementation Decisions

- Extract `PaymentRepository` as a deep module owning all `payment_orders` and `refund_records` SQL: `findById`, `findByTransactionId`, `list({ status, paymentMethod, page, pageSize })`, `stats()`, `insert`, `updateStatus`. The orchestrator delegates all DB reads and writes to this repository.
- Remove `POST /create` (duplicate of `/checkout`). Remove `GET /query/:id` (duplicate of `/status/:id`). Update any frontend or admin code that references the removed endpoints.
- Move the public status response shaping (`status`, `paymentMethod`, `amount`, `paidAt`) from `routes/payment.js` into a `queryPublicStatus()` method on the orchestrator. The route calls this method and returns the result directly.
- Replace `Date.now() + Math.random()` in `generateOrderNo` and `generateRefundNo` with `crypto.randomUUID()` or a sequence-based generator backed by the database.
- Remove the unused `db` parameter from the `routes/payment.js` factory function. Update `app.js` wiring to pass only `paymentService`.
- Add a `reconcilePaymentOrder(paymentOrderId)` method to `PaymentSettlement` that checks whether the order status matches the payment status and logs a warning if they diverge. Call this after `settlePaid` returns `orderSyncFailed: true`.
- Log `orderSyncFailed` at `error` level in `PaymentSettlement` (already done) and add a `warn`-level log in the orchestrator when it receives the flag.
- Update `CLAUDE.md` to remove the stale claim about inline payment routes in `app.js`.
- No schema changes. No new payment providers. No changes to settlement idempotency rules.

## Testing Decisions

- `PaymentRepository` tests should verify: pagination returns correct page/total, filtering by status and paymentMethod works, stats aggregation matches manual count, findById returns null for missing ID, findByTransactionId matches on transaction_id column. Use in-memory SQLite with the existing `createTestDb` helper.
- Reconciliation test: create a payment, settle it as paid, then manually set the order back to `pending`, call `reconcilePaymentOrder`, and verify the warning is logged and the method returns the drift status.
- Route smoke tests: after removing duplicate endpoints, verify that `POST /checkout` and `GET /status/:id` still work (the existing `payment.test.ts` covers this). Verify that `POST /create` and `GET /query/:id` return 404.
- Transaction ID uniqueness test: generate 1000 IDs concurrently and verify no collisions.
- Keep the existing `paymentSettlement.test.ts` and `payment.test.ts` suites unchanged — they are the regression guard for the settlement seam and HTTP contract.
- Follow the existing test pattern: `describe` blocks per module, `beforeEach` for DB setup, `afterEach` for cleanup, `vitest` with `globals: true`.

## Out of Scope

- Rebuilding the Checkout UI or frontend checkout workflow.
- Changing Coupon application order or discount rules.
- Redesigning all backend HTTP result handling.
- Refactoring Customer self-service ownership rules.
- Refactoring Runtime gray release decision behavior.
- Replacing the database adapter or moving all SQL behind repository-style modules beyond Payment.
- Adding new payment providers.
- Changing payment route URLs or response shapes beyond the duplicate removal and DTO extraction described above.
- Changing deployment configuration.
- Changing authentication or admin authorization semantics.
- Modifying the `PaymentSettlement` idempotency or state-transition rules established in #41.

## Further Notes

This PRD follows directly from the implementation of #41. During that refactor, the settlement seam was deepened successfully, but the orchestrator surface — especially the list/stats query-building and the duplicate endpoints — remained shallow. The May 25 architecture review (candidate #10) also flagged the duplicate endpoints as dead code. This PRD consolidates those observations into one actionable scope.

The expected result is a cleaner orchestrator surface: one repository for data access, one DTO shape per view, one endpoint per operation, and a reconciliation safety net for the payment-order sync path.
