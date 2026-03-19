import request from "supertest";
import { app } from "../app";
import User from "../models/user.model";

describe("User Endpoints", () => {
  let accessToken: string;
  let userId: string;

  beforeEach(async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({
        username: "testuser",
        email: "test@example.com",
        password: "password123",
      });
    accessToken = res.body.accessToken;
    userId = res.body.user._id;
  });

  describe("GET /user", () => {
    it("should get all users", async () => {
      const res = await request(app).get("/user");

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });
  });

  describe("GET /user/profile", () => {
    it("should get current user profile", async () => {
      const res = await request(app)
        .get("/user/profile")
        .set("Authorization", `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("username", "testuser");
      expect(res.body).toHaveProperty("email", "test@example.com");
    });

    it("should not get profile without authentication", async () => {
      const res = await request(app).get("/user/profile");

      expect(res.status).toBe(401);
    });
  });

  describe("GET /user/:id", () => {
    it("should get user by ID", async () => {
      const res = await request(app).get(`/user/${userId}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("username", "testuser");
    });

    it("should return 404 for non-existent user", async () => {
      const res = await request(app).get("/user/507f1f77bcf86cd799439011");

      expect(res.status).toBe(404);
    });
  });

  describe("PUT /user/:id", () => {
    it("should update user profile", async () => {
      const res = await request(app)
        .put(`/user/${userId}`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          username: "updateduser",
          email: "updated@example.com",
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("username", "updateduser");
      expect(res.body).toHaveProperty("email", "updated@example.com");
    });

    it("should not update other user's profile", async () => {
      const otherUser = await request(app)
        .post("/auth/register")
        .send({
          username: "otheruser",
          email: "other@example.com",
          password: "password123",
        });

      const res = await request(app)
        .put(`/user/${otherUser.body.user._id}`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          username: "hacked",
        });

      expect(res.status).toBe(403);
    });

    it("should not update without authentication", async () => {
      const res = await request(app)
        .put(`/user/${userId}`)
        .send({
          username: "hacked",
        });

      expect(res.status).toBe(401);
    });
  });

  describe("DELETE /user/:id", () => {
    it("should delete user account", async () => {
      const res = await request(app)
        .delete(`/user/${userId}`)
        .set("Authorization", `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe("User deleted successfully");
    });

    it("should not delete other user's account", async () => {
      const otherUser = await request(app)
        .post("/auth/register")
        .send({
          username: "otheruser",
          email: "other@example.com",
          password: "password123",
        });

      const res = await request(app)
        .delete(`/user/${otherUser.body.user._id}`)
        .set("Authorization", `Bearer ${accessToken}`);

      expect(res.status).toBe(403);
    });

    it("should not delete without authentication", async () => {
      const res = await request(app).delete(`/user/${userId}`);

      expect(res.status).toBe(401);
    });

    it("should return 403 when trying to delete non-existent user", async () => {
      const res = await request(app)
        .delete("/user/000000000000000000000000")
        .set("Authorization", `Bearer ${accessToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe("Error handling", () => {
    it("should return 500 for invalid user ID format in getUserById", async () => {
      const res = await request(app).get("/user/invalidid");

      expect(res.status).toBe(500);
    });

    it("should return 403 for updating non-existent user", async () => {
      const res = await request(app)
        .put("/user/000000000000000000000000")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ username: "updated" });

      expect(res.status).toBe(403);
    });
  });
});
