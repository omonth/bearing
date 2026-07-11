import { describe, it, expect, beforeAll } from "vitest";
import { createTestDb, seedTestData } from "./helpers";
const AuthService = require("../services/authService");
const { NotFoundError, ValidationError, UnauthorizedError, ConflictError, BusinessError } = require("../utils/errors");

describe("AuthService", () => {
  let db: any;
  let authService: any;

  beforeAll(async () => {
    db = await createTestDb();
    await seedTestData(db);
    authService = new AuthService(db, { jwtSecret: "test-secret", jwtExpiresIn: "1h" });
  });

  describe("login", () => {
    it("正确的用户名和密码返回 token", async () => {
      const data = await authService.login("admin", "admin123");
      expect(data.token).toBeDefined();
      expect(data.user.username).toBe("admin");
      expect(data.user.role).toBe("admin");
    });

    it("错误的用户名返回 401", async () => {
      await expect(authService.login("nobody", "admin123")).rejects.toMatchObject({
        statusCode: 401,
        message: "用户名或密码错误",
      });
    });

    it("错误的密码返回 401", async () => {
      await expect(authService.login("admin", "wrongpassword")).rejects.toMatchObject({
        statusCode: 401,
        message: "用户名或密码错误",
      });
    });

    it("登录后更新 last_login", async () => {
      await authService.login("admin", "admin123");
      const admin = await db.get("SELECT last_login FROM admins WHERE username = ?", ["admin"]);
      expect(admin.last_login).toBeDefined();
    });
  });

  describe("getMe", () => {
    it("返回存在的用户", async () => {
      const data = await authService.getMe(1);
      expect(data.username).toBe("admin");
      expect(data.email).toBe("admin@test.com");
    });

    it("不存在的用户返回 404", async () => {
      await expect(authService.getMe(999)).rejects.toMatchObject({
        statusCode: 404,
        message: "用户不存在",
      });
    });
  });

  describe("changePassword", () => {
    it("正确的旧密码可以修改密码", async () => {
      const data = await authService.changePassword(1, "admin123", "newpassword456");
      expect(data.message).toBe("密码修改成功");

      const loginData = await authService.login("admin", "newpassword456");
      expect(loginData.token).toBeDefined();
    });

    it("错误的旧密码返回 401", async () => {
      await expect(authService.changePassword(1, "wrongold", "irrelevant")).rejects.toMatchObject({
        statusCode: 401,
        message: "旧密码错误",
      });
    });
  });
});
