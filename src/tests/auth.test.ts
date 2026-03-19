import request from "supertest";
import { app } from "../app";
import User from "../models/user.model";

describe("Auth Endpoints", () => {
  describe("POST /auth/register", () => {
    it("should register a new user", async () => {
      const res = await request(app)
        .post("/auth/register")
        .send({
          username: "testuser",
          email: "test@example.com",
          password: "password123",
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("accessToken");
      expect(res.body).toHaveProperty("refreshToken");
      expect(res.body.user).toHaveProperty("username", "testuser");
      expect(res.body.user).toHaveProperty("email", "test@example.com");
    });

    it("should not register user with existing email", async () => {
      await User.create({
        username: "existinguser",
        email: "existing@example.com",
        password: "password123",
      });

      const res = await request(app)
        .post("/auth/register")
        .send({
          username: "newuser",
          email: "existing@example.com",
          password: "password123",
        });

      expect(res.status).toBe(409);
    });

    it("should not register user with missing fields", async () => {
      const res = await request(app)
        .post("/auth/register")
        .send({
          username: "testuser",
          password: "password123",
        });

      expect(res.status).toBe(400);
    });
  });

  describe("POST /auth/login", () => {
    beforeEach(async () => {
      await request(app)
        .post("/auth/register")
        .send({
          username: "loginuser",
          email: "login@example.com",
          password: "password123",
        });
    });

    it("should login existing user", async () => {
      const res = await request(app)
        .post("/auth/login")
        .send({
          email: "login@example.com",
          password: "password123",
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("accessToken");
      expect(res.body).toHaveProperty("refreshToken");
    });

    it("should not login with wrong password", async () => {
      const res = await request(app)
        .post("/auth/login")
        .send({
          email: "login@example.com",
          password: "wrongpassword",
        });

      expect(res.status).toBe(401);
    });

    it("should not login non-existent user", async () => {
      const res = await request(app)
        .post("/auth/login")
        .send({
          email: "nonexistent@example.com",
          password: "password123",
        });

      expect(res.status).toBe(401);
    });
  });

  describe("POST /auth/logout", () => {
    let refreshToken: string;

    beforeEach(async () => {
      const res = await request(app)
        .post("/auth/register")
        .send({
          username: "logoutuser",
          email: "logout@example.com",
          password: "password123",
        });
      refreshToken = res.body.refreshToken;
    });

    it("should logout user", async () => {
      const res = await request(app)
        .post("/auth/logout")
        .send({ refreshToken });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe("Logout successful");
    });

    it("should not logout with invalid token", async () => {
      const res = await request(app)
        .post("/auth/logout")
        .send({ refreshToken: "invalidtoken" });

      expect(res.status).toBe(401);
    });
  });

  describe("POST /auth/refresh", () => {
    let refreshToken: string;

    beforeEach(async () => {
      const res = await request(app)
        .post("/auth/register")
        .send({
          username: "refreshuser",
          email: "refresh@example.com",
          password: "password123",
        });
      refreshToken = res.body.refreshToken;
    });

    it("should refresh access token", async () => {
      const res = await request(app)
        .post("/auth/refresh")
        .send({ refreshToken });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("accessToken");
      expect(res.body).toHaveProperty("refreshToken");
    });

    it("should not refresh with invalid token", async () => {
      const res = await request(app)
        .post("/auth/refresh")
        .send({ refreshToken: "invalidtoken" });

      expect(res.status).toBe(401);
    });

    it("should not refresh without refresh token", async () => {
      const res = await request(app)
        .post("/auth/refresh")
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe("Error cases", () => {
    it("should handle duplicate username on registration", async () => {
      await request(app)
        .post("/auth/register")
        .send({
          username: "uniqueuser",
          email: "unique1@example.com",
          password: "password123",
        });

      const res = await request(app)
        .post("/auth/register")
        .send({
          username: "uniqueuser",
          email: "unique2@example.com",
          password: "password123",
        });

      expect(res.status).toBe(409);
    });
  });
});
