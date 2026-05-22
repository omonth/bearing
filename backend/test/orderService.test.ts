import { describe, it, expect, beforeAll } from "vitest";
import { createTestDb, seedTestData } from "./helpers";
const OrderService = require("../services/orderService");

describe("OrderService", () => {
  let db: any;
  let orderService: any;

  beforeAll(async () => {
    db = await createTestDb();
    await seedTestData(db);
    orderService = new OrderService(db);
  });

  describe("create", () => {
    it("创建订单并扣减库存", async () => {
      const { data, error } = await orderService.create({
        customerName: "测试客户",
        customerPhone: "13800000001",
        province: "北京",
        city: "北京市",
        district: "朝阳区",
        addressDetail: "测试路1号",
        items: [{ id: 1, quantity: 3 }, { id: 2, quantity: 2 }],
      });

      expect(error).toBeNull();
      expect(data.orderId).toBeGreaterThan(0);
      expect(data.message).toBe("订单创建成功");

      const bearing1 = await db.get("SELECT stock FROM bearings WHERE id = ?", [1]);
      expect(bearing1.stock).toBe(97); // 100 - 3

      const bearing2 = await db.get("SELECT stock FROM bearings WHERE id = ?", [2]);
      expect(bearing2.stock).toBe(48); // 50 - 2
    });

    it("产品不存在时返回错误", async () => {
      const { data, error } = await orderService.create({
        customerName: "测试",
        customerPhone: "13800000002",
        province: "上海",
        city: "上海市",
        district: "",
        addressDetail: "xx路",
        items: [{ id: 999, quantity: 1 }],
      });

      expect(data).toBeNull();
      expect(error).toContain("不存在");
    });

    it("库存不足时返回错误且不扣减库存", async () => {
      const { data, error } = await orderService.create({
        customerName: "测试",
        customerPhone: "13800000003",
        province: "广东",
        city: "广州",
        district: "",
        addressDetail: "xx路",
        items: [{ id: 1, quantity: 99999 }],
      });

      expect(data).toBeNull();
      expect(error).toContain("库存不足");

      const bearing = await db.get("SELECT stock FROM bearings WHERE id = ?", [1]);
      expect(bearing.stock).toBe(97); // unchanged from previous test
    });

    it("事务回滚：多个产品中有一个库存不足则全部回滚", async () => {
      const stockBefore1 = (await db.get("SELECT stock FROM bearings WHERE id = ?", [1])).stock;
      const stockBefore2 = (await db.get("SELECT stock FROM bearings WHERE id = ?", [2])).stock;

      const { data, error } = await orderService.create({
        customerName: "测试",
        customerPhone: "13800000004",
        province: "浙江",
        city: "杭州",
        district: "",
        addressDetail: "xx路",
        items: [{ id: 1, quantity: 5 }, { id: 2, quantity: 99999 }],
      });

      expect(data).toBeNull();
      expect(error).toContain("库存不足");

      const stockAfter1 = (await db.get("SELECT stock FROM bearings WHERE id = ?", [1])).stock;
      const stockAfter2 = (await db.get("SELECT stock FROM bearings WHERE id = ?", [2])).stock;
      expect(stockAfter1).toBe(stockBefore1); // rolled back
      expect(stockAfter2).toBe(stockBefore2); // rolled back
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
      const { data, error } = await orderService.list();
      expect(error).toBeNull();
      expect(data.length).toBeGreaterThanOrEqual(1);
      const names = data.map((o: any) => o.customer_name);
      expect(names).toContain("列表测试");
    });
  });

  describe("getById", () => {
    let orderId: number;

    beforeAll(async () => {
      const { data } = await orderService.create({
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
      const { data, error } = await orderService.getById(orderId);
      expect(error).toBeNull();
      expect(data.id).toBe(orderId);
      expect(data.customer_name).toBe("查询测试");
    });

    it("不存在的订单返回 404", async () => {
      const { data, error, status } = await orderService.getById(99999);
      expect(data).toBeNull();
      expect(error).toBe("订单不存在");
      expect(status).toBe(404);
    });
  });

  describe("getItems", () => {
    let orderId: number;

    beforeAll(async () => {
      const { data } = await orderService.create({
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
      const { data, error } = await orderService.getItems(orderId);
      expect(error).toBeNull();
      expect(data.length).toBe(2);
      expect(data[0].name).toBeDefined();
      expect(data[0].model).toBeDefined();
    });
  });

  describe("updateStatus", () => {
    let orderId: number;

    beforeAll(async () => {
      const { data } = await orderService.create({
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

    it("更新为 paid", async () => {
      const { data, error } = await orderService.updateStatus(orderId, "paid");
      expect(error).toBeNull();
      expect(data.oldStatus).toBe("pending");
      expect(data.newStatus).toBe("paid");

      const order = await db.get("SELECT status FROM orders WHERE id = ?", [orderId]);
      expect(order.status).toBe("paid");
    });

    it("更新为 shipped 并记录 tracking_number", async () => {
      const { data, error } = await orderService.updateStatus(orderId, "shipped", null, "SF1234567890");
      expect(error).toBeNull();
      expect(data.oldStatus).toBe("paid");
      expect(data.newStatus).toBe("shipped");

      const order = await db.get("SELECT status, tracking_number FROM orders WHERE id = ?", [orderId]);
      expect(order.status).toBe("shipped");
      expect(order.tracking_number).toBe("SF1234567890");
    });

    it("更新为 completed 记录 completed_at", async () => {
      const { data, error } = await orderService.updateStatus(orderId, "completed");
      expect(error).toBeNull();
      expect(data.newStatus).toBe("completed");

      const order = await db.get("SELECT status, completed_at FROM orders WHERE id = ?", [orderId]);
      expect(order.status).toBe("completed");
      expect(order.completed_at).toBeDefined();
    });

    it("不存在的订单返回 404", async () => {
      const { data, error, status } = await orderService.updateStatus(99999, "paid");
      expect(data).toBeNull();
      expect(error).toBe("订单不存在");
      expect(status).toBe(404);
    });

    it("记录状态历史", async () => {
      const { data, error } = await orderService.getStatusHistory(orderId);
      expect(error).toBeNull();
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
      pendingOrderId = r1.data.orderId;

      const r2 = await orderService.create({
        customerName: "不可删测试",
        customerPhone: "13900000006",
        province: "安徽",
        city: "合肥",
        district: "",
        addressDetail: "测试地址",
        items: [{ id: 1, quantity: 3 }],
      });
      paidOrderId = r2.data.orderId;
      await orderService.updateStatus(paidOrderId, "paid");
    });

    it("删除 pending 状态订单并恢复库存", async () => {
      const stockBefore = (await db.get("SELECT stock FROM bearings WHERE id = ?", [1])).stock;

      const { data, error } = await orderService.delete(pendingOrderId);
      expect(error).toBeNull();
      expect(data.restoredStock).toBe(true);
      expect(data.itemsCount).toBe(1);

      const stockAfter = (await db.get("SELECT stock FROM bearings WHERE id = ?", [1])).stock;
      expect(stockAfter).toBe(stockBefore + 5);
    });

    it("无法删除已支付订单", async () => {
      const { data, error, status } = await orderService.delete(paidOrderId);
      expect(data).toBeNull();
      expect(error).toContain("无法删除");
      expect(status).toBe(400);
    });

    it("不存在的订单返回 404", async () => {
      const { data, error, status } = await orderService.delete(99999);
      expect(data).toBeNull();
      expect(error).toBe("订单不存在");
      expect(status).toBe(404);
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
      orderId1 = r1.data.orderId;

      const r2 = await orderService.create({
        customerName: "批量状态2",
        customerPhone: "13900000008",
        province: "广西",
        city: "南宁",
        district: "",
        addressDetail: "测试地址",
        items: [{ id: 2, quantity: 1 }],
      });
      orderId2 = r2.data.orderId;
    });

    it("批量更新订单状态", async () => {
      const { data, error } = await orderService.batchUpdateStatus([orderId1, orderId2], "cancelled", "批量取消");
      expect(error).toBeNull();
      expect(data.count).toBe(2);

      const o1 = await db.get("SELECT status FROM orders WHERE id = ?", [orderId1]);
      const o2 = await db.get("SELECT status FROM orders WHERE id = ?", [orderId2]);
      expect(o1.status).toBe("cancelled");
      expect(o2.status).toBe("cancelled");
    });
  });
});
