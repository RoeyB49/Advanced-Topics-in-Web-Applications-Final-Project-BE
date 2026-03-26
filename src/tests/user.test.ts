import request from "supertest";
import { app } from "../app";

describe("User Endpoints", () => {
  let accessToken: string;
  let userId: string;

  beforeEach(async () => {
    const res = await request(app).post("/api/auth/register").send({
      username: "testuser",
      email: "test@example.com",
      password: "password123"
    });

    accessToken = res.body.accessToken;
    userId = res.body.user._id;
  });

  it("should get all users", async () => {
    const res = await request(app)
      .get("/api/users")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).not.toHaveProperty("email");
    expect(res.body[0]).not.toHaveProperty("password");
  });

  it("should not get all users without token", async () => {
    const res = await request(app).get("/api/users");

    expect(res.status).toBe(401);
  });

  it("should get current user profile with posts", async () => {
    const res = await request(app)
      .get("/api/users/profile")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("user");
    expect(res.body).toHaveProperty("posts");
    expect(Array.isArray(res.body.posts)).toBe(true);
    expect(res.body.user).toHaveProperty("username", "testuser");
  });

  it("should get user by id with posts", async () => {
    const res = await request(app)
      .get(`/api/users/${userId}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("user");
    expect(res.body).toHaveProperty("posts");
    expect(res.body.user).toHaveProperty("username", "testuser");
    expect(res.body.user).not.toHaveProperty("email");
  });

  it("should not get user by id without token", async () => {
    const res = await request(app).get(`/api/users/${userId}`);

    expect(res.status).toBe(401);
  });

  it("should update only own user profile", async () => {
    const res = await request(app)
      .put(`/api/users/${userId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ username: "updateduser" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("username", "updateduser");
  });

  it("should delete own account", async () => {
    const res = await request(app)
      .delete(`/api/users/${userId}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("User deleted successfully");
  });
});
