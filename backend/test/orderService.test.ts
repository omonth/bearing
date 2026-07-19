import { describe, it, expect, beforeAll, vi } from "vitest";
import { createTestDb, seedTestData } from "./helpers";
const OrderService = require("../services/orderService");

describe("OrderService", () => {
  let db: any;
  let orderService: any;

  beforeAll(async () => {
    db = await createTestDb();
    await seedTestData(db);
    await db.run(`
      CREATE TABLE payment_orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        payment_method TEXT NOT NULL,
        amount REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        transaction_id TEXT UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    orderService = new OrderService(db);
  });

  describe("create", () => {
    it("创建订单并扣减库存", async () => {
      const data = await orderService.create({
        customerName: "测试客户",
        customerPhone: "13800000001",
        province: "北京",
        city: "北京市",
        district: "朝阳区",
        addressDetail: "测试路1号",
        items: [{ id: 1, quantity: 3 }, { id: 2, quantity: 2 }],
      });

      expect(data.orderId).toBeGreaterThan(0);
      expect(data.message).toBe("订单创建成功");

      const bearing1 = await db.get("SELECT stock FROM bearings WHERE id = ?", [1]);
      expect(bearing1.stock).toBe(97); // 100 - 3

      const bearing2 = await db.get("SELECT stock FROM bearings WHERE id = ?", [2]);
      expect(bearing2.stock).toBe(48); // 50 - 2
    });

    it("产品不存在时返回错误", async () => {
      await expect(orderService.create({
        customerName: "测试",
        customerPhone: "13800000002",
        province: "上海",
        city: "上海市",
        district: "",
        addressDetail: "xx路",
        items: [{ id: 999, quantity: 1 }],
      })).rejects.toThrow("不存在");
    });

    it("库存不足时返回错误且不扣减库存", async () => {
      await expect(orderService.create({
        customerName: "测试",
        customerPhone: "13800000003",
        province: "广东",
        city: "广州",
        district: "",
        addressDetail: "xx路",
        items: [{ id: 1, quantity: 99999 }],
      })).rejects.toThrow("库存不足");

      const bearing = await db.get("SELECT stock FROM bearings WHERE id = ?", [1]);
      expect(bearing.stock).toBe(97); // unchanged from previous test
    });

    it("事务回滚：多个产品中有一个库存不足则全部回滚", async () => {
      const stockBefore1 = (await db.get("SELECT stock FROM bearings WHERE id = ?", [1])).stock;
      const stockBefore2 = (await db.get("SELECT stock FROM bearings WHERE id = ?", [2])).stock;

      await expect(orderService.create({
        customerName: "测试",
        customerPhone: "13800000004",
        province: "浙江",
        city: "杭州",
        district: "",
        addressDetail: "xx路",
        items: [{ id: 1, quantity: 5 }, { id: 2, quantity: 99999 }],
      })).rejects.toThrow("库存不足");

      const stockAfter1 = (await db.get("SELECT stock FROM bearings WHERE id = ?", [1])).stock;
      const stockAfter2 = (await db.get("SELECT stock FROM bearings WHERE id = ?", [2])).stock;
      expect(stockAfter1).toBe(stockBefore1); // rolled back
      expect(stockAfter2).toBe(stockBefore2); // rolled back
    });
  });

  describe("inventory integrity", () => {
    it("aggregates duplicate product lines before reserving stock", async () => {
      const stockBefore = (await db.get("SELECT stock FROM bearings WHERE id = ?", [1])).stock;

      await expect(orderService.create({
        customerName: "Duplicate lines",
        customerPhone: "13900000009",
        province: "P",
        city: "C",
        district: "D",
        addressDetail: "A",
        items: [{ id: 1, quantity: stockBefore }, { id: 1, quantity: 1 }],
      })).rejects.toThrow("库存不足");

      const stockAfter = await db.get("SELECT stock FROM bearings WHERE id = ?", [1]);
      expect(stockAfter.stock).toBe(stockBefore);
    });

    it("restores stock once when a pending order is cancelled", async () => {
      const stockBefore = (await db.get("SELECT stock FROM bearings WHERE id = ?", [2])).stock;
      const order = await orderService.create({
        customerName: "Cancelled order",
        customerPhone: "13900000010",
        province: "P",
        city: "C",
        district: "D",
        addressDetail: "A",
        items: [{ id: 2, quantity: 2 }],
      });

      await orderService.updateStatus(order.orderId, "cancelled");

      const stockAfterCancellation = await db.get("SELECT stock FROM bearings WHERE id = ?", [2]);
      expect(stockAfterCancellation.stock).toBe(stockBefore);
      await expect(orderService.updateStatus(order.orderId, "paid")).rejects.toMatchObject({
        code: "PAYMENT_SETTLEMENT_REQUIRED",
      });
    });

    it("requires the refund settlement path to cancel a paid order", async () => {
      const order = await orderService.create({
        customerName: "Paid cancellation guard",
        customerPhone: "13900000011",
        province: "P",
        city: "C",
        district: "D",
        addressDetail: "A",
        items: [{ id: 2, quantity: 1 }],
      });
      await db.transaction((transaction: any) => orderService.updateOrderStatusInTransaction({
        transaction,
        orderId: order.orderId,
        status: "paid",
        note: "支付结算测试",
      }));

      await expect(orderService.updateStatus(order.orderId, "cancelled")).rejects.toMatchObject({
        code: "REFUND_REQUIRED",
      });
      await expect(db.get("SELECT status FROM orders WHERE id = ?", [order.orderId]))
        .resolves.toEqual({ status: "paid" });
    });
  });

  describe("list", () => {
    beforeAll(async () => {
      await orderService.create({
        customerName: "列表测试",
        customerPhone: "13900000001",
        province: "江苏",
        city: "南京",
        district: "",
        addressDetail: "测试地址",
        items: [{ id: 1, quantity: 1 }],
      });
    });

    it("返回订单列表，按时间倒序", async () => {
      const data = await orderService.list();
      expect(data.length).toBeGreaterThanOrEqual(1);
      const names = data.map((o: any) => o.customer_name);
      expect(names).toContain("列表测试");
    });
  });

  describe("getById", () => {
    let orderId: number;

    beforeAll(async () => {
      const data = await orderService.create({
        customerName: "查询测试",
        customerPhone: "13900000002",
        province: "湖北",
        city: "武汉",
        district: "",
        addressDetail: "测试地址",
        items: [{ id: 1, quantity: 1 }],
      });
      orderId = data.orderId;
    });

    it("返回存在的订单", async () => {
      const data = await orderService.getById(orderId);
      expect(data.id).toBe(orderId);
      expect(data.customer_name).toBe("查询测试");
    });

    it("不存在的订单返回 404", async () => {
      await expect(orderService.getById(99999)).rejects.toThrow("订单不存在");
    });
  });

  describe("getItems", () => {
    let orderId: number;

    beforeAll(async () => {
      const data = await orderService.create({
        customerName: "商品查询测试",
        customerPhone: "13900000003",
        province: "四川",
        city: "成都",
        district: "",
        addressDetail: "测试地址",
        items: [{ id: 1, quantity: 2 }, { id: 2, quantity: 1 }],
      });
      orderId = data.orderId;
    });

    it("返回订单商品列表，包含名称和型号", async () => {
      const data = await orderService.getItems(orderId);
      expect(data.length).toBe(2);
      expect(data[0].name).toBeDefined();
      expect(data[0].model).toBeDefined();
    });
  });

  describe("updateStatus", () => {
    let orderId: number;

    beforeAll(async () => {
      const data = await orderService.create({
        customerName: "状态测试",
        customerPhone: "13900000004",
        province: "湖南",
        city: "长沙",
        district: "",
        addressDetail: "测试地址",
        items: [{ id: 1, quantity: 1 }],
      });
      orderId = data.orderId;
    });

    it("拒绝管理员手工把订单更新为 paid", async () => {
      await expect(orderService.updateStatus(orderId, "paid")).rejects.toMatchObject({
        code: "PAYMENT_SETTLEMENT_REQUIRED",
        statusCode: 409,
      });
      await expect(db.get("SELECT status FROM orders WHERE id = ?", [orderId]))
        .resolves.toEqual({ status: "pending" });
    });

    it("仅允许支付结算事务边界把订单更新为 paid", async () => {
      const data = await db.transaction((transaction: any) => (
        orderService.updateOrderStatusInTransaction({
          transaction,
          orderId,
          status: "paid",
          note: "支付成功",
        })
      ));
      expect(data).toMatchObject({
        oldStatus: "pending",
        newStatus: "paid",
        updated: true,
      });
      await expect(db.get("SELECT status FROM orders WHERE id = ?", [orderId]))
        .resolves.toEqual({ status: "paid" });
    });

    it("没有有效物流单号时拒绝发货", async () => {
      await expect(orderService.updateStatus(orderId, "shipped"))
        .rejects.toMatchObject({ field: "trackingNumber" });

      await expect(db.get("SELECT status, tracking_number FROM orders WHERE id = ?", [orderId]))
        .resolves.toEqual({ status: "paid", tracking_number: null });
    });

    it("更新为 shipped 并记录 tracking_number", async () => {
      const data = await orderService.updateStatus(orderId, "shipped", null, "SF1234567890");
      expect(data.oldStatus).toBe("paid");
      expect(data.newStatus).toBe("shipped");

      const order = await db.get("SELECT status, tracking_number FROM orders WHERE id = ?", [orderId]);
      expect(order.status).toBe("shipped");
      expect(order.tracking_number).toBe("SF1234567890");
    });

    it("更新为 completed 记录 completed_at", async () => {
      const data = await orderService.updateStatus(orderId, "completed");
      expect(data.newStatus).toBe("completed");

      const order = await db.get("SELECT status, completed_at FROM orders WHERE id = ?", [orderId]);
      expect(order.status).toBe("completed");
      expect(order.completed_at).toBeDefined();
    });

    it("不存在的订单返回 404", async () => {
      await expect(orderService.updateStatus(99999, "shipped", null, "SF1234"))
        .rejects.toThrow("订单不存在");
    });

    it("记录状态历史", async () => {
      const data = await orderService.getStatusHistory(orderId);
      expect(data.length).toBeGreaterThanOrEqual(3); // pending→paid, paid→shipped, shipped→completed
    });
  });

  describe("delete", () => {
    let pendingOrderId: number;
    let paidOrderId: number;

    beforeAll(async () => {
      const r1 = await orderService.create({
        customerName: "待删测试",
        customerPhone: "13900000005",
        province: "福建",
        city: "福州",
        district: "",
        addressDetail: "测试地址",
        items: [{ id: 1, quantity: 5 }],
      });
      pendingOrderId = r1.orderId;

      const r2 = await orderService.create({
        customerName: "不可删测试",
        customerPhone: "13900000006",
        province: "安徽",
        city: "合肥",
        district: "",
        addressDetail: "测试地址",
        items: [{ id: 1, quantity: 3 }],
      });
      paidOrderId = r2.orderId;
      await db.transaction((transaction: any) => orderService.updateOrderStatusInTransaction({
        transaction,
        orderId: paidOrderId,
        status: "paid",
        note: "支付成功",
      }));
    });

    it("拒绝硬删除 pending 订单且不恢复库存或删除明细", async () => {
      const before = {
        stock: await db.get("SELECT stock FROM bearings WHERE id = ?", [1]),
        order: await db.get("SELECT id, status FROM orders WHERE id = ?", [pendingOrderId]),
        items: await db.all("SELECT * FROM order_items WHERE order_id = ?", [pendingOrderId]),
      };

      await expect(orderService.delete(pendingOrderId)).rejects.toMatchObject({
        code: "ORDER_HARD_DELETE_DISABLED",
        statusCode: 409,
      });

      expect({
        stock: await db.get("SELECT stock FROM bearings WHERE id = ?", [1]),
        order: await db.get("SELECT id, status FROM orders WHERE id = ?", [pendingOrderId]),
        items: await db.all("SELECT * FROM order_items WHERE order_id = ?", [pendingOrderId]),
      }).toEqual(before);
    });

    it("拒绝硬删除已支付订单", async () => {
      await expect(orderService.delete(paidOrderId)).rejects.toMatchObject({
        code: "ORDER_HARD_DELETE_DISABLED",
        statusCode: 409,
      });
      await expect(db.get("SELECT status FROM orders WHERE id = ?", [paidOrderId]))
        .resolves.toEqual({ status: "paid" });
    });

    it("不透露硬删除目标是否存在", async () => {
      await expect(orderService.delete(99999)).rejects.toMatchObject({
        code: "ORDER_HARD_DELETE_DISABLED",
        statusCode: 409,
      });
    });

    it("批量硬删除全量拒绝且不改变订单或支付状态", async () => {
      await db.run(
        `INSERT INTO payment_orders
          (order_id, payment_method, amount, status, transaction_id)
         VALUES (?, ?, ?, ?, ?)`,
        [pendingOrderId, "wechat", 75, "processing", `DELETE-GUARD-${pendingOrderId}`]
      );
      const before = {
        pending: await db.get("SELECT id, status FROM orders WHERE id = ?", [pendingOrderId]),
        paid: await db.get("SELECT id, status FROM orders WHERE id = ?", [paidOrderId]),
        payment: await db.get("SELECT status FROM payment_orders WHERE order_id = ?", [pendingOrderId]),
      };

      await expect(orderService.batchDelete([pendingOrderId, paidOrderId]))
        .rejects.toMatchObject({ code: "ORDER_HARD_DELETE_DISABLED", statusCode: 409 });

      expect({
        pending: await db.get("SELECT id, status FROM orders WHERE id = ?", [pendingOrderId]),
        paid: await db.get("SELECT id, status FROM orders WHERE id = ?", [paidOrderId]),
        payment: await db.get("SELECT status FROM payment_orders WHERE order_id = ?", [pendingOrderId]),
      }).toEqual(before);
    });
  });

  describe("batchUpdateStatus", () => {
    let orderId1: number;
    let orderId2: number;

    beforeAll(async () => {
      const r1 = await orderService.create({
        customerName: "批量状态1",
        customerPhone: "13900000007",
        province: "江西",
        city: "南昌",
        district: "",
        addressDetail: "测试地址",
        items: [{ id: 1, quantity: 1 }],
      });
      orderId1 = r1.orderId;

      const r2 = await orderService.create({
        customerName: "批量状态2",
        customerPhone: "13900000008",
        province: "广西",
        city: "南宁",
        district: "",
        addressDetail: "测试地址",
        items: [{ id: 2, quantity: 1 }],
      });
      orderId2 = r2.orderId;
    });

    it("批量更新订单状态（事务成功）", async () => {
      const data = await orderService.batchUpdateStatus([orderId1, orderId2], "cancelled", "批量取消");
      expect(data.updated).toBe(2);

      const o1 = await db.get("SELECT status FROM orders WHERE id = ?", [orderId1]);
      const o2 = await db.get("SELECT status FROM orders WHERE id = ?", [orderId2]);
      expect(o1.status).toBe("cancelled");
      expect(o2.status).toBe("cancelled");

      const history1 = await db.all("SELECT * FROM order_status_history WHERE order_id = ?", [orderId1]);
      const history2 = await db.all("SELECT * FROM order_status_history WHERE order_id = ?", [orderId2]);
      expect(history1.length).toBeGreaterThan(0);
      expect(history2.length).toBeGreaterThan(0);
    });

    it("混合状态——任一订单不存在则事务回滚", async () => {
      await expect(orderService.batchUpdateStatus(
        [orderId1, 99999],
        "cancelled",
        "批量发货"
      )).rejects.toThrow("不存在");

      // orderId1 should NOT have been updated (transaction rolled back)
      const o1 = await db.get("SELECT status FROM orders WHERE id = ?", [orderId1]);
      expect(o1.status).toBe("cancelled");
    });

    it("空 ID 数组返回错误", async () => {
      await expect(orderService.batchUpdateStatus([], "shipped")).rejects.toThrow("订单ID列表不能为空");
    });

    it("拒绝批量手工把订单更新为 paid", async () => {
      await expect(orderService.batchUpdateStatus([orderId1], "paid"))
        .rejects.toMatchObject({ code: "PAYMENT_SETTLEMENT_REQUIRED" });
    });
  });

  describe("admin cancellation payment gates", () => {
    async function createPendingOrder(suffix: string, quantity = 1) {
      return orderService.create({
        customerName: `Admin cancellation ${suffix}`,
        customerPhone: `1370000${suffix.padStart(4, "0")}`,
        province: "P",
        city: "C",
        district: "D",
        addressDetail: "A",
        items: [{ id: 1, quantity }],
      });
    }

    it.each([
      ["pending", "alipay"],
      ["processing", "wechat"],
      ["processing", "unionpay"],
    ])("拒绝取消存在 %s %s 外部支付单的订单", async (paymentStatus, paymentMethod) => {
      const order = await createPendingOrder(`${paymentStatus.length}${paymentMethod.length}`);
      await db.run(
        `INSERT INTO payment_orders
          (order_id, payment_method, amount, status, transaction_id)
         VALUES (?, ?, ?, ?, ?)`,
        [order.orderId, paymentMethod, 15, paymentStatus, `ADMIN-${order.orderId}`]
      );
      const stockBefore = await db.get("SELECT stock FROM bearings WHERE id = ?", [1]);

      await expect(orderService.updateStatus(order.orderId, "cancelled"))
        .rejects.toMatchObject({ code: "PAYMENT_CLOSE_REQUIRED", statusCode: 409 });

      expect({
        order: await db.get("SELECT status FROM orders WHERE id = ?", [order.orderId]),
        payment: await db.get("SELECT status FROM payment_orders WHERE order_id = ?", [order.orderId]),
        stock: await db.get("SELECT stock FROM bearings WHERE id = ?", [1]),
      }).toEqual({
        order: { status: "pending" },
        payment: { status: paymentStatus },
        stock: stockBefore,
      });
    });

    it.each([
      ["pending", "balance"],
      ["processing", "cod"],
    ])("事务取消安全的 %s %s 本地支付并仅恢复一次库存", async (paymentStatus, paymentMethod) => {
      const order = await createPendingOrder(`${paymentStatus.length + 2}${paymentMethod.length}`, 2);
      await db.run(
        `INSERT INTO payment_orders
          (order_id, payment_method, amount, status, transaction_id)
         VALUES (?, ?, ?, ?, ?)`,
        [order.orderId, paymentMethod, 30, paymentStatus, `LOCAL-${order.orderId}`]
      );
      const stockBefore = await db.get("SELECT stock FROM bearings WHERE id = ?", [1]);

      const first = await orderService.updateStatus(order.orderId, "cancelled", "管理员取消");
      const stockAfterFirst = await db.get("SELECT stock FROM bearings WHERE id = ?", [1]);
      const second = await orderService.updateStatus(order.orderId, "cancelled", "管理员重试取消");

      expect({
        first,
        second,
        order: await db.get("SELECT status FROM orders WHERE id = ?", [order.orderId]),
        payment: await db.get("SELECT status FROM payment_orders WHERE order_id = ?", [order.orderId]),
        stockDelta: stockAfterFirst.stock - stockBefore.stock,
        stockAfterRetry: await db.get("SELECT stock FROM bearings WHERE id = ?", [1]),
      }).toEqual({
        first: {
          message: "订单状态已更新",
          oldStatus: "pending",
          newStatus: "cancelled",
          idempotent: false,
        },
        second: {
          message: "订单状态已更新",
          oldStatus: "cancelled",
          newStatus: "cancelled",
          idempotent: true,
        },
        order: { status: "cancelled" },
        payment: { status: "cancelled" },
        stockDelta: 2,
        stockAfterRetry: stockAfterFirst,
      });
    });

    it("检测锁定快照后的并发状态冲突且不恢复库存", async () => {
      const tx = {
        get: vi.fn()
          .mockResolvedValueOnce({ id: 91, status: "pending" })
          .mockResolvedValueOnce({ status: "pending" }),
        all: vi.fn().mockResolvedValue([]),
        run: vi.fn().mockResolvedValue({ changes: 0 }),
      };
      const concurrentDb = {
        type: "postgres",
        transaction: (callback: (transaction: any) => Promise<any>) => callback(tx),
      };
      const service = new OrderService(concurrentDb);

      await expect(service.updateStatus(91, "cancelled"))
        .rejects.toMatchObject({ code: "ORDER_STATUS_CONFLICT" });

      expect(tx.get.mock.calls[0][0]).toContain("FOR UPDATE");
      expect(tx.all.mock.calls[0][0]).toContain("FOR UPDATE");
      expect(tx.run).toHaveBeenCalledTimes(1);
      expect(tx.run.mock.calls[0][0]).toContain("WHERE id = ? AND status = ?");
    });
  });

  describe("export reads", () => {
    let printableOrderId: number;

    beforeAll(async () => {
      const data = await orderService.create({
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
      const data = await orderService.getPrintableOrder(printableOrderId);

      expect(data.order.id).toBe(printableOrderId);
      expect(data.items.length).toBe(1);
      expect(data.items[0].bearing_id).toBe(1);
    });

    it("returns 404 for missing printable order", async () => {
      await expect(orderService.getPrintableOrder(99999)).rejects.toThrow();
    });

    it("returns export order rows", async () => {
      const data = await orderService.getExportOrders();

      expect(data.some((order: any) => order.id === printableOrderId)).toBe(true);
    });
  });
});
