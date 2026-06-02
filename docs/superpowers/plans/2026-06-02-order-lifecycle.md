# Order Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deepen the backend Order lifecycle module while keeping existing HTTP routes, response shapes, database schema, and user-visible behavior unchanged.

**Architecture:** `backend/services/orderService.js` becomes the single Order lifecycle interface for order reads, status changes, deletion, and export data reads. `backend/routes/orders.js` remains an HTTP adapter and no longer queries order tables directly. `PaymentOrchestrator` prefers the Order lifecycle status interface and keeps SQL fallback only when no Order lifecycle module is injected.

**Tech Stack:** Node.js, Express, Vitest, Supertest, SQLite test adapter, ExcelJS, PDFKit.

---

### Task 1: Add Order lifecycle export tests

**Files:**
- Modify: `backend/test/orderService.test.ts`
- Modify after RED: `backend/services/orderService.js`

- [ ] **Step 1: Write failing tests**

Add tests to `backend/test/orderService.test.ts`:

```ts
describe("export reads", () => {
  let printableOrderId: number;

  beforeAll(async () => {
    const { data } = await orderService.create({
      customerName: "Printable",
      customerPhone: "13900000901",
      province: "P",
      city: "C",
      district: "D",
      addressDetail: "A",
      items: [{ id: 1, quantity: 1 }],
    });
    printableOrderId = data.orderId;
  });

  it("returns printable order data with items", async () => {
    const { data, error } = await orderService.getPrintableOrder(printableOrderId);
    expect(error).toBeNull();
    expect(data.order.id).toBe(printableOrderId);
    expect(data.items.length).toBe(1);
    expect(data.items[0].bearing_id).toBe(1);
  });

  it("returns 404 for missing printable order", async () => {
    const { data, error, status } = await orderService.getPrintableOrder(99999);
    expect(data).toBeNull();
    expect(error).toBeTruthy();
    expect(status).toBe(404);
  });

  it("returns export order rows", async () => {
    const { data, error } = await orderService.getExportOrders();
    expect(error).toBeNull();
    expect(data.some((order: any) => order.id === printableOrderId)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
npx vitest run test/orderService.test.ts
```

Expected: FAIL because `getPrintableOrder` and `getExportOrders` are not functions.

- [ ] **Step 3: Implement minimal Order lifecycle methods**

Add intent-level methods to `backend/services/orderService.js`:

```js
async getExportOrders() {
  return this.listOrders();
}

async getPrintableOrder(orderId) {
  const orderResult = await this.getOrderById(orderId);
  if (orderResult.error) return orderResult;
  const itemsResult = await this.getOrderItems(orderId);
  if (itemsResult.error) return itemsResult;
  return { data: { order: orderResult.data, items: itemsResult.data }, error: null };
}
```

Rename the existing method bodies to intent names, then add compatibility aliases. The alias shape is:

```js
async create(input) { return this.createOrder(input); }
async list() { return this.listOrders(); }
async getById(orderId) { return this.getOrderById(orderId); }
async getItems(orderId) { return this.getOrderItems(orderId); }
async updateStatus(orderId, status, note, trackingNumber) {
  return this.updateOrderStatus(orderId, status, note, trackingNumber);
}
async batchUpdateStatus(orderIds, status, note) {
  return this.batchUpdateOrderStatus(orderIds, status, note);
}
async delete(orderId) { return this.deleteOrder(orderId); }
async batchDelete(orderIds) { return this.batchDeleteOrders(orderIds); }
async getStatusHistory(orderId) { return this.getOrderStatusHistory(orderId); }
```

Repeat that alias pattern for list, getById, getItems, updateStatus, batchUpdateStatus, delete, batchDelete, and getStatusHistory.

- [ ] **Step 4: Run test to verify GREEN**

Run:

```bash
npx vitest run test/orderService.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/test/orderService.test.ts backend/services/orderService.js
git commit -m "Deepen order lifecycle exports"
```

### Task 2: Rewire order export routes through Order lifecycle

**Files:**
- Modify: `backend/test/orders.test.ts`
- Modify after RED: `backend/routes/orders.js`

- [ ] **Step 1: Write failing route tests**

Add tests to `backend/test/orders.test.ts`:

```ts
it("should export orders to Excel through the orders route", async () => {
  const res = await request(app)
    .get("/api/orders/export/excel")
    .set("Authorization", `Bearer ${authToken}`);

  expect(res.status).toBe(200);
  expect(res.headers["content-type"]).toContain(
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  expect(res.headers["content-disposition"]).toContain("orders-");
});

it("should export one order to PDF through the orders route", async () => {
  const createRes = await request(app).post("/api/orders").send({
    customerName: "PDF Export",
    customerPhone: "13900000902",
    province: "P",
    city: "C",
    district: "D",
    addressDetail: "A",
    items: [{ id: 1, quantity: 1 }],
  });

  const res = await request(app)
    .get(`/api/orders/${createRes.body.orderId}/export/pdf`)
    .set("Authorization", `Bearer ${authToken}`);

  expect(res.status).toBe(200);
  expect(res.headers["content-type"]).toContain("application/pdf");
  expect(res.headers["content-disposition"]).toContain(`order-${createRes.body.orderId}`);
});
```

- [ ] **Step 2: Run tests to verify current behavior**

Run:

```bash
npx vitest run test/orders.test.ts
```

Expected: PASS, proving the endpoint behavior before rewiring.

- [ ] **Step 3: Rewire route implementation**

In `backend/routes/orders.js`:

- replace direct `db.all('SELECT * FROM orders...')` in Excel export with `orderService.getExportOrders()`
- replace direct `db.get` and `db.all` in PDF export with `orderService.getPrintableOrder(req.params.id)`
- keep response headers and export utility calls unchanged
- use new intent methods in route calls, while preserving response JSON

- [ ] **Step 4: Run route tests**

Run:

```bash
npx vitest run test/orders.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/test/orders.test.ts backend/routes/orders.js
git commit -m "Route order exports through lifecycle"
```

### Task 3: Route payment status synchronization through Order lifecycle

**Files:**
- Modify: `backend/test/payment.test.ts`
- Modify after RED: `backend/services/payment/PaymentOrchestrator.js`

- [ ] **Step 1: Write focused test**

Add to `backend/test/payment.test.ts`:

```ts
it("should use the order lifecycle status interface when payment is simulated", async () => {
  const calls: any[] = [];
  const orderLifecycle = {
    updateOrderStatus: async (orderId: number, status: string) => {
      calls.push({ orderId, status });
      await db.run("UPDATE orders SET status = ? WHERE id = ?", [status, orderId]);
      return { data: { oldStatus: "pending", newStatus: status }, error: null };
    },
  };

  const paymentService = new PaymentOrchestrator(db, orderLifecycle);
  paymentService.enable();

  const orderRes = await request(app).post("/api/orders").send({
    customerName: "Lifecycle Payment",
    customerPhone: "13900000903",
    province: "P",
    city: "C",
    district: "D",
    addressDetail: "A",
    items: [{ id: 1, quantity: 1 }],
  });

  const createPayment = await paymentService.createPayment({
    orderId: orderRes.body.orderId,
    amount: 15,
    paymentMethod: "alipay",
    subject: "bearing",
  });

  await paymentService.simulatePayment(createPayment.paymentOrderId);

  expect(calls).toEqual([{ orderId: orderRes.body.orderId, status: "paid" }]);
});
```

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
npx vitest run test/payment.test.ts
```

Expected: FAIL because `PaymentOrchestrator` still calls `updateStatus`, not `updateOrderStatus`.

- [ ] **Step 3: Implement minimal adapter selection**

In `backend/services/payment/PaymentOrchestrator.js`, add a small private method:

```js
async updateOrderStatus(orderId, status) {
  if (this.orderService?.updateOrderStatus) {
    return this.orderService.updateOrderStatus(orderId, status);
  }
  if (this.orderService?.updateStatus) {
    return this.orderService.updateStatus(orderId, status);
  }
  return this.db.run("UPDATE orders SET status = ? WHERE id = ?", [status, orderId]);
}
```

Use it in paid and refund paths.

- [ ] **Step 4: Run payment tests**

Run:

```bash
npx vitest run test/payment.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/test/payment.test.ts backend/services/payment/PaymentOrchestrator.js
git commit -m "Use order lifecycle for payment status sync"
```

### Task 4: Fix root lint and Turbopack root stability

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `next.config.js`

- [ ] **Step 1: Run current lint to capture failure**

Run:

```bash
npm run lint
```

Expected: FAIL with `Invalid project directory provided`.

- [ ] **Step 2: Install lint dependencies**

Run:

```bash
npm install -D eslint eslint-config-next
```

- [ ] **Step 3: Update scripts and Next config**

Set root `package.json` lint script to:

```json
"lint": "eslint . --ext .ts,.tsx"
```

Set `next.config.js` root stability:

```js
turbopack: {
  root: __dirname,
},
```

- [ ] **Step 4: Run lint and build**

Run:

```bash
npm run lint
npm run build
```

Expected: PASS and no Turbopack workspace-root warning.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json next.config.js
git commit -m "Restore frontend lint script"
```

### Task 5: Full verification and handoff

**Files:**
- No planned production edits.

- [ ] **Step 1: Run backend tests**

```bash
npm test
```

from `backend/`. Expected: PASS.

- [ ] **Step 2: Run root tests and build**

```bash
npm test
npm run build
```

from repo root. Expected: PASS.

- [ ] **Step 3: Run admin tests and build**

```bash
npm test
npm run build
```

from `admin/`. Expected: PASS.

- [ ] **Step 4: Start services for user review**

Start backend on port 3001, storefront on port 3000, and admin on port 5173. Confirm:

- `http://localhost:3001/health`
- `http://localhost:3000`
- `http://localhost:5173/admin/login`

- [ ] **Step 5: Push branch**

```bash
git status --short
git push -u origin stabilize-tests-and-runtime
```

Expected: branch is available on `https://github.com/omonth/bearing`.
