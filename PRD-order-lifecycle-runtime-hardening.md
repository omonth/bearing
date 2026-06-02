# PRD: Order Lifecycle and Runtime Hardening

**Label**: `ready-for-agent`

## Problem Statement

The bearing sales system needed to become easier to maintain, safer to run for long periods, and better covered by tests. Order behavior was spread across HTTP routes, payment coordination, export handlers, and service methods with mixed naming conventions. This made it harder to reason about where order state should change, where stock should be restored, and whether Excel/PDF exports used the same order model as normal order reads.

The local runtime also had avoidable friction. The frontend lint command no longer worked with the installed Next.js version, Turbopack inferred an unstable workspace root inside the local worktree, Redis absence caused repeated warning noise, and the SQLite initialization script created data but exited with an error because it closed the database before async work completed.

From the user's perspective, the project should have a clearer backend structure, more reliable tests, a clean build/lint workflow, and a straightforward local run path for storefront, admin, and API review.

## Solution

Create a deeper Order lifecycle module as the single service interface for order creation, listing, detail reads, status changes, deletion, batch status changes, export reads, and printable order reads. Keep existing HTTP routes and response shapes stable while moving business reads and status synchronization behind intent-level service methods.

Update payment synchronization so paid and refunded events prefer the Order lifecycle status interface. Keep backward-compatible fallback behavior only for legacy callers.

Restore frontend linting with the current ESLint/Next.js setup, stabilize Turbopack root inference, quiet Redis fallback behavior when Redis is not available, and fix SQLite initialization shutdown so local setup exits successfully.

Add focused tests around Order lifecycle exports, route export behavior, payment status synchronization, Redis fallback policy, and the existing frontend/admin/backend suites. Preserve current external behavior while improving internal ownership and runtime reliability.

## User Stories

1. As a store operator, I want orders to be created through one lifecycle path, so that stock and order totals stay consistent.
2. As a store operator, I want order status changes to use one lifecycle path, so that paid, shipped, completed, cancelled, and refunded states are easier to trust.
3. As a store operator, I want pending order deletion to restore stock reliably, so that inventory remains accurate after cancellations.
4. As a store operator, I want batch order status updates to use the same lifecycle rules as single updates, so that bulk actions do not bypass business logic.
5. As a store operator, I want order status history to remain available after refactoring, so that order changes can still be audited.
6. As a finance/admin user, I want paid payment simulation to update order status through the Order lifecycle, so that payment and order state cannot drift.
7. As a finance/admin user, I want refund processing to update order status through the Order lifecycle, so that refund behavior follows the same order state interface.
8. As an admin user, I want Excel order exports to keep returning workbook downloads, so that existing reporting workflows do not break.
9. As an admin user, I want PDF order exports to keep returning printable order documents, so that order fulfillment workflows do not break.
10. As an admin user, I want export routes to use the same order service reads as normal order routes, so that exported data matches the application model.
11. As a customer, I want checkout and coupon use to keep working after internal refactoring, so that the buying flow remains stable.
12. As a customer, I want payment status polling to keep working after backend cleanup, so that checkout status remains clear.
13. As a developer, I want order routes to act as HTTP adapters, so that validation, auth, headers, and response mapping are separate from order business logic.
14. As a developer, I want the Order lifecycle service to expose intent-level method names, so that callers communicate business intent instead of storage details.
15. As a developer, I want compatibility aliases to remain during the transition, so that existing callers can be migrated safely.
16. As a developer, I want payment orchestration to depend on an Order lifecycle interface, so that payment code does not directly own order state rules.
17. As a developer, I want route export tests, so that rewiring implementation details does not silently break downloads.
18. As a developer, I want service-level printable order tests, so that printable data can be verified without depending only on HTTP behavior.
19. As a developer, I want Redis to degrade quietly when unavailable, so that local development and long-running demos are not flooded with repeated cache warnings.
20. As a developer, I want Redis retry behavior to be bounded, so that missing optional infrastructure does not keep consuming attention.
21. As a developer, I want SQLite initialization to exit cleanly, so that setup instructions are reliable and automation can trust the exit code.
22. As a developer, I want the frontend lint script to run on the installed Next.js generation, so that linting remains part of normal verification.
23. As a developer, I want Turbopack to use the project root explicitly, so that nested worktrees do not produce workspace-root warnings.
24. As a developer, I want TypeScript build cache files ignored, so that local build artifacts do not pollute commits.
25. As a reviewer, I want the change to preserve public URLs and response shapes, so that review can focus on internal ownership and test coverage.
26. As a reviewer, I want every major behavior change to have a focused test, so that the refactor is not just mechanical movement.
27. As an AFK agent, I want a concise PRD and plan for Order lifecycle ownership, so that future agents can extend the system without rediscovering the same boundaries.
28. As an operator, I want the storefront, admin app, and API to start together locally, so that I can review the full system from browser URLs.
29. As an operator, I want product API data to be seeded during local setup, so that the storefront has meaningful data after initialization.
30. As a maintainer, I want optional subsystems like Redis and RAG to fail soft during local development, so that core commerce workflows remain available.

## Implementation Decisions

- The Order lifecycle service is the authoritative module for order creation, order reads, item reads, status history reads, status updates, batch status updates, deletion, batch deletion, export rows, and printable order data.
- HTTP order routes remain adapters. They own authentication, request validation, HTTP status mapping, download headers, and export renderer invocation.
- Existing order route URLs, JSON response shapes, workbook downloads, and PDF downloads remain unchanged.
- Existing database schema remains unchanged.
- Existing status transition behavior remains unchanged.
- Compatibility aliases may remain while route and payment callers migrate to intent-level lifecycle method names.
- Export renderers remain responsible for workbook and PDF rendering. They receive data prepared by the Order lifecycle service.
- Payment orchestration prefers an injected Order lifecycle status interface for paid and refunded events.
- Payment orchestration keeps fallback behavior for legacy cases where no Order lifecycle service is provided.
- Frontend API naming should avoid React hook prefixes for non-hook functions so lint rules do not misclassify normal API calls.
- Root linting should use ESLint directly with the installed Next.js ESLint configuration.
- React compiler and TypeScript strictness warnings can remain as warnings in this stage; the goal is to restore a usable lint gate with zero errors.
- Turbopack root should be explicitly set to the repository root to avoid nested worktree inference warnings.
- TypeScript build info files should be ignored as generated artifacts.
- Redis should remain optional for local development. When Redis is unavailable, cache middleware should fall through to uncached behavior.
- Redis connection failure reporting should be bounded so repeated reconnect attempts do not flood logs.
- SQLite initialization should complete all queued schema, seed, and admin user work before closing the database.
- Local runtime should support three visible services: storefront, admin, and backend API.
- GitHub work should continue on the `stabilize-tests-and-runtime` branch until reviewed or merged.

## Testing Decisions

- Good tests should verify external behavior and business outcomes rather than private implementation details.
- Order lifecycle tests should assert printable order data, missing printable orders, export rows, stock changes, status changes, batch updates, deletion behavior, and status history outcomes.
- Order route tests should assert HTTP behavior, auth requirements, response headers, workbook content type, PDF content type, and unchanged response shape.
- Payment tests should assert that simulated payment and refund paths update order status through the Order lifecycle interface.
- Cache policy tests should assert bounded retry behavior and one-time failure reporting until reset.
- Frontend store tests should continue covering cart, product, and checkout store behavior after API naming cleanup.
- Admin tests should continue covering existing admin application behavior.
- Full verification should include root frontend tests, root lint, root build, backend tests, admin tests, admin build, database initialization, and HTTP smoke checks.
- Prior art already exists in the repository through Vitest service tests, Supertest API tests, frontend store tests, and admin Vitest tests.
- Runtime smoke checks should hit backend health, product API, storefront homepage, and admin Vite entry page.

## Out of Scope

- No new order status state machine rules.
- No new order status names.
- No database migration.
- No public route changes.
- No response shape changes.
- No admin UI redesign.
- No storefront redesign.
- No new payment provider integration.
- No production Redis deployment work.
- No RAG embedding provider repair in this stage.
- No attempt to eliminate all existing frontend lint warnings.
- No full TypeScript type cleanup for all `any` usage.
- No migration from SQLite to PostgreSQL.
- No GitHub PR merge decision.

## Further Notes

- The branch was pushed to GitHub as `stabilize-tests-and-runtime`.
- The PR creation URL is the GitHub page used to open a Pull Request from that branch. It is for review and merge workflow, not for running the app.
- The intended issue label is `ready-for-agent`.
- The local environment could not publish this PRD as a GitHub Issue automatically because the repository is configured to use the `gh` CLI, but `gh` is not installed and the available package manager source requires administrator repair.
- Once GitHub CLI is available, this PRD can be published with a GitHub issue title such as `PRD: Order lifecycle and runtime hardening` and the `ready-for-agent` label.
