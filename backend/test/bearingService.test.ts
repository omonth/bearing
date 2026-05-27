import { describe, it, expect, beforeAll } from "vitest";
import { createTestDb, seedTestData } from "./helpers";
const BearingService = require("../services/bearingService");

describe("BearingService", () => {
  let db: any;
  let bearingService: any;

  beforeAll(async () => {
    db = await createTestDb();
    await seedTestData(db);
    bearingService = new BearingService(db);
  });

  describe("list", () => {
    it("返回全部产品", async () => {
      const { data, error } = await bearingService.list();
      expect(error).toBeNull();
      expect(data.length).toBe(3);
    });

    it("按分类过滤", async () => {
      const { data, error } = await bearingService.list("深沟球轴承");
      expect(error).toBeNull();
      expect(data.length).toBe(1);
      expect(data[0].category).toBe("深沟球轴承");
    });

    it("'全部' 分类不应用过滤", async () => {
      const { data } = await bearingService.list("全部");
      expect(data.length).toBe(3);
    });

    it("返回映射后的字段", async () => {
      const { data } = await bearingService.list("圆柱滚子轴承");
      const bearing = data[0];
      expect(bearing.specs.innerDiameter).toBe(25);
      expect(bearing.specs.outerDiameter).toBe(52);
      expect(bearing.price).toBe(45);
      expect(bearing.stock).toBe(50);
    });
  });

  describe("getById", () => {
    it("返回存在的产品", async () => {
      const { data, error } = await bearingService.getById(1);
      expect(error).toBeNull();
      expect(data.name.zh).toBe("深沟球轴承 6200");
      expect(data.name.en).toBeTruthy();
      expect(data.description.zh).toBeTruthy();
      expect(data.model).toBe("6200");
    });

    it("不存在的产品返回 404", async () => {
      const { data, error, status } = await bearingService.getById(999);
      expect(data).toBeNull();
      expect(error).toBe("产品未找到");
      expect(status).toBe(404);
    });
  });

  describe("getCategories", () => {
    it("返回所有分类", async () => {
      const { data, error } = await bearingService.getCategories();
      expect(error).toBeNull();
      expect(data).toContain("深沟球轴承");
      expect(data).toContain("圆柱滚子轴承");
      expect(data).toContain("推力球轴承");
    });
  });

  describe("search", () => {
    it("无查询时返回全部产品", async () => {
      const { data, error } = await bearingService.search({});
      expect(error).toBeNull();
      expect(data.total).toBe(3);
    });

    it("按排序和分类搜索", async () => {
      const { data, error } = await bearingService.search({ category: "深沟球轴承", sortBy: "price", order: "asc" });
      expect(error).toBeNull();
      expect(data.results.length).toBeGreaterThanOrEqual(1);
      expect(data.results[0].category).toBe("深沟球轴承");
    });

    it("按分类 + 价格筛选", async () => {
      const { data } = await bearingService.search({ category: "深沟球轴承", maxPrice: "20" });
      expect(data.results.length).toBeGreaterThanOrEqual(1);
    });

    it("按有库存筛选", async () => {
      const { data } = await bearingService.search({ inStock: "true" });
      data.results.forEach((r: any) => expect(r.stock).toBeGreaterThan(0));
    });
  });

  describe("create", () => {
    it("创建新产品", async () => {
      const { data, error } = await bearingService.create({
        name: "测试轴承",
        model: "TEST-001",
        price: 99.99,
        category: "深沟球轴承",
        innerDiameter: 20,
        outerDiameter: 47,
        width: 14,
        stock: 200,
        image: "/images/test.png",
        description: "测试用轴承",
      });

      expect(error).toBeNull();
      expect(data.id).toBeGreaterThan(0);

      const { data: products } = await bearingService.list();
      expect(products.length).toBe(4);
    });

    it("纯字符串 name 自动转为 {zh, en} JSON", async () => {
      const { data, error } = await bearingService.create({
        name: "自动转换轴承",
        model: "AUTO-001",
        price: 10,
        category: "深沟球轴承",
        innerDiameter: 5,
        outerDiameter: 10,
        width: 3,
        stock: 10,
      });
      expect(error).toBeNull();

      const { data: bearing } = await bearingService.getById(data.id);
      expect(bearing.name).toEqual({ zh: "自动转换轴承", en: "" });
      expect(bearing.description).toEqual({ zh: "", en: "" });
    });

    it("已是 JSON 格式的 name 保持不变", async () => {
      const jsonName = JSON.stringify({ zh: "JSON轴承", en: "JSON Bearing" });
      const { data, error } = await bearingService.create({
        name: jsonName,
        model: "JSON-001",
        price: 20,
        category: "深沟球轴承",
        innerDiameter: 5,
        outerDiameter: 10,
        width: 3,
        stock: 10,
      });
      expect(error).toBeNull();

      const { data: bearing } = await bearingService.getById(data.id);
      expect(bearing.name).toEqual({ zh: "JSON轴承", en: "JSON Bearing" });
    });
  });

  describe("updateStock", () => {
    it("更新库存数量", async () => {
      const { data, error } = await bearingService.updateStock(1, 500);
      expect(error).toBeNull();

      const { data: bearing } = await bearingService.getById(1);
      expect(bearing.stock).toBe(500);
    });
  });

  describe("delete", () => {
    it("删除产品", async () => {
      const { data: product } = await bearingService.create({
        name: "待删除轴承",
        model: "DEL-001",
        price: 10,
        category: "推力球轴承",
        innerDiameter: 5,
        outerDiameter: 10,
        width: 5,
        stock: 0,
      });

      const { data, error } = await bearingService.delete(product.id);
      expect(error).toBeNull();
      expect(data.message).toBe("产品删除成功");

      const { data: notFound, status } = await bearingService.getById(product.id);
      expect(notFound).toBeNull();
      expect(status).toBe(404);
    });
  });
});
