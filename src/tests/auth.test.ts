import request from "supertest";
import { app } from "../app";

describe("Auth Endpoints", () => {
  describe("POST /api/auth/register", () => {
    it("should register a new user", async () => {
      const res = await request(app).post("/api/auth/register").send({
        username: "testuser",
        email: "test@example.com",
        password: "password123"
      });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("accessToken");
      expect(res.body).toHaveProperty("refreshToken");
      expect(res.body.user).toHaveProperty("username", "testuser");
      expect(res.body.user).toHaveProperty("email", "test@example.com");
    });

    it("should not register user with missing fields", async () => {
      const res = await request(app).post("/api/auth/register").send({
        username: "testuser",
        password: "password123"
      });

      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/auth/login", () => {
    beforeEach(async () => {
      await request(app).post("/api/auth/register").send({
        username: "loginuser",
        email: "login@example.com",
        password: "password123"
      });
    });

    it("should login existing user", async () => {
      const res = await request(app).post("/api/auth/login").send({
        email: "login@example.com",
        password: "password123"
      });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("accessToken");
      expect(res.body).toHaveProperty("refreshToken");
    });

    it("should not login with wrong password", async () => {
      const res = await request(app).post("/api/auth/login").send({
        email: "login@example.com",
        password: "wrongpassword"
      });

      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/auth/social", () => {
    it("should login/register using social provider", async () => {
      const res = await request(app).post("/api/auth/social").send({
        provider: "google",
        providerId: "google-user-1",
        username: "socialuser",
        email: "social@example.com"
      });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("accessToken");
      expect(res.body).toHaveProperty("refreshToken");
      expect(res.body.user).toHaveProperty("provider", "google");
    });
  });

  describe("POST /api/auth/logout", () => {
    let refreshToken: string;

    beforeEach(async () => {
      const res = await request(app).post("/api/auth/register").send({
        username: "logoutuser",
        email: "logout@example.com",
        password: "password123"
      });
      refreshToken = res.body.refreshToken;
    });

    it("should logout user", async () => {
      const res = await request(app)
        .post("/api/auth/logout")
        .send({ refreshToken });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe("Logout successful");
    });
  });

  describe("POST /api/auth/refresh", () => {
    let refreshToken: string;

    beforeEach(async () => {
      const res = await request(app).post("/api/auth/register").send({
        username: "refreshuser",
        email: "refresh@example.com",
        password: "password123"
      });
      refreshToken = res.body.refreshToken;
    });

    it("should refresh access token", async () => {
      const res = await request(app)
        .post("/api/auth/refresh")
        .send({ refreshToken });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("accessToken");
      expect(res.body).toHaveProperty("refreshToken");
    });
  });
});
