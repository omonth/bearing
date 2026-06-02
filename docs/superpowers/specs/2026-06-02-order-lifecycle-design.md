# Order lifecycle design

Date: 2026-06-02

## Goal

Deepen the backend Order lifecycle module without changing external HTTP routes, response shapes, database schema, or user-facing behavior.

The first stage improves locality around order behavior that currently leaks through route modules and payment coordination:

- order creation and stock decrement
- order listing and detail reads
- status updates and status history
- single and batch deletion
- export data reads for Excel and PDF
- payment and refund synchronization through the same order status interface

## Constraints

- Keep all public URLs and JSON response shapes unchanged.
- Keep the existing database schema unchanged.
- Keep current status transition behavior unchanged.
- Keep Express-specific validation in route modules.
- Move business checks and data reads into the Order lifecycle module.
- Keep Excel/PDF rendering in `backend/utils/exportOrders.js`.

## Module interface

The Order lifecycle module should expose intent-level methods:

- `createOrder(input)`
- `listOrders()`
- `getOrderById(orderId)`
- `getOrderItems(orderId)`
- `getOrderStatusHistory(orderId)`
- `updateOrderStatus(orderId, status, note, trackingNumber)`
- `deleteOrder(orderId)`
- `batchDeleteOrders(orderIds)`
- `batchUpdateOrderStatus(orderIds, status, note)`
- `getExportOrders()`
- `getPrintableOrder(orderId)`

Compatibility aliases may remain temporarily for existing callers:

- `create`
- `list`
- `getById`
- `updateStatus`
- `delete`
- `batchDelete`
- `batchUpdateStatus`

## Route responsibilities

`backend/routes/orders.js` remains the HTTP adapter:

- apply auth middleware
- validate request shape with `express-validator`
- map service results to HTTP status codes
- set download headers
- pass export data to `exportOrders.js`

It should not directly query orders or order items.

## Payment responsibilities

`PaymentOrchestrator` should use the Order lifecycle status interface when it receives paid/refunded events. Direct fallback SQL can remain only as a backward-compatible adapter path when no Order lifecycle module was provided.

## Testing

Add focused backend tests before changing production code:

- Order lifecycle returns printable order data with items.
- Missing printable order returns 404.
- Excel export endpoint still returns a workbook response.
- PDF export endpoint still returns a PDF response.
- Payment simulation/refund still updates order status through the Order lifecycle module.

Existing backend tests must remain green.

## Non-goals

- No new order status machine rules in this stage.
- No route path changes.
- No response shape changes.
- No database migration.
- No admin UI rewrite.
