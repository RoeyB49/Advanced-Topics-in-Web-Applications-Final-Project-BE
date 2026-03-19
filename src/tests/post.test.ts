import request from "supertest";
import { app } from "../app";
import Post from "../models/post.model";

describe("Post Endpoints", () => {
  let accessToken: string;
  let userId: string;
  let postId: string;

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


  describe("POST /post", () => {
    it("should create a new post", async () => {
      const res = await request(app)
        .post("/post")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          title: "Test Post",
          content: "This is a test post",
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("title", "Test Post");
      expect(res.body).toHaveProperty("content", "This is a test post");
      expect(res.body).toHaveProperty("sender");
      postId = res.body._id;
    });

    it("should not create post without authentication", async () => {
      const res = await request(app)
        .post("/post")
        .send({
          title: "Test Post",
          content: "This is a test post",
        });

      expect(res.status).toBe(401);
    });

    it("should not create post without title", async () => {
      const res = await request(app)
        .post("/post")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          content: "This is a test post",
        });

      expect(res.status).toBe(400);
    });
  });

  describe("GET /post", () => {
    beforeEach(async () => {
      await request(app)
        .post("/post")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          title: "Test Post 1",
          content: "Content 1",
        });
      await request(app)
        .post("/post")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          title: "Test Post 2",
          content: "Content 2",
        });
    });

    it("should get all posts", async () => {
      const res = await request(app).get("/post");

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2);
    });

    it("should filter posts by sender", async () => {
      const res = await request(app).get(`/post?sender=${userId}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2);
    });
  });

  describe("GET /post/:id", () => {
    beforeEach(async () => {
      const res = await request(app)
        .post("/post")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          title: "Test Post",
          content: "Test Content",
        });
      postId = res.body._id;
    });

    it("should get post by ID", async () => {
      const res = await request(app).get(`/post/${postId}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("title", "Test Post");
    });

    it("should return 404 for non-existent post", async () => {
      const res = await request(app).get("/post/507f1f77bcf86cd799439011");

      expect(res.status).toBe(404);
    });
  });

  describe("PUT /post/:id", () => {
    beforeEach(async () => {
      const res = await request(app)
        .post("/post")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          title: "Original Title",
          content: "Original Content",
        });
      postId = res.body._id;
    });

    it("should update post", async () => {
      const res = await request(app)
        .put(`/post/${postId}`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          title: "Updated Title",
          content: "Updated Content",
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("title", "Updated Title");
      expect(res.body).toHaveProperty("content", "Updated Content");
    });

    it("should not update post without authentication", async () => {
      const res = await request(app)
        .put(`/post/${postId}`)
        .send({
          title: "Updated Title",
        });

      expect(res.status).toBe(401);
    });

    it("should return 404 for non-existent post", async () => {
      const res = await request(app)
        .put("/post/507f1f77bcf86cd799439011")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          title: "Updated Title",
        });

      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /post/:id", () => {
    beforeEach(async () => {
      const res = await request(app)
        .post("/post")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          title: "Post to Delete",
          content: "This will be deleted",
        });
      postId = res.body._id;
    });

    it("should delete post", async () => {
      const res = await request(app)
        .delete(`/post/${postId}`)
        .set("Authorization", `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain("deleted successfully");
    });

    it("should not delete post without authentication", async () => {
      const res = await request(app).delete(`/post/${postId}`);

      expect(res.status).toBe(401);
    });

    it("should return 404 for non-existent post", async () => {
      const res = await request(app)
        .delete("/post/507f1f77bcf86cd799439011")
        .set("Authorization", `Bearer ${accessToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe("Error handling", () => {
    it("should return 400 for invalid post ID format", async () => {
      const res = await request(app).get("/post/invalidid");

      expect(res.status).toBe(400);
    });

    it("should return 404 for non-existent post in update", async () => {
      const res = await request(app)
        .put("/post/507f1f77bcf86cd799439011")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ title: "Updated" });

      expect(res.status).toBe(404);
    });
  });
});
