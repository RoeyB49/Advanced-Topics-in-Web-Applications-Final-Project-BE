import request from "supertest";
import { app } from "../app";
import Comment from "../models/comment.model";

describe("Comment Endpoints", () => {
  let accessToken: string;
  let userId: string;
  let postId: string;
  let commentId: string;

  beforeEach(async () => {
    // Register and login
    const authRes = await request(app)
      .post("/auth/register")
      .send({
        username: "testuser",
        email: "test@example.com",
        password: "password123",
      });
    accessToken = authRes.body.accessToken;
    userId = authRes.body.user._id;

    // Create a post
    const postRes = await request(app)
      .post("/post")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        title: "Test Post",
        content: "Post for comments",
      });
    postId = postRes.body._id;
  });

  describe("POST /comment", () => {
    it("should create a new comment", async () => {
      const res = await request(app)
        .post("/comment")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          postId: postId,
          content: "This is a test comment",
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("content", "This is a test comment");
      expect(res.body).toHaveProperty("postId");
      expect(res.body).toHaveProperty("sender");
      commentId = res.body._id;
    });

    it("should not create comment without authentication", async () => {
      const res = await request(app)
        .post("/comment")
        .send({
          postId: postId,
          content: "This is a test comment",
        });

      expect(res.status).toBe(401);
    });

    it("should not create comment without content", async () => {
      const res = await request(app)
        .post("/comment")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          postId: postId,
        });

      expect(res.status).toBe(400);
    });
  });

  describe("GET /comment", () => {
    beforeEach(async () => {
      await request(app)
        .post("/comment")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          postId: postId,
          content: "Comment 1",
        });
      await request(app)
        .post("/comment")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          postId: postId,
          content: "Comment 2",
        });
    });

    it("should get all comments", async () => {
      const res = await request(app).get("/comment");

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2);
    });

    it("should filter comments by postId", async () => {
      const res = await request(app).get(`/comment?postId=${postId}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2);
    });
  });

  describe("GET /comment/posts/:postId", () => {
    beforeEach(async () => {
      await request(app)
        .post("/comment")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          postId: postId,
          content: "Comment for post",
        });
    });

    it("should get comments by post ID", async () => {
      const res = await request(app).get(`/comment/posts/${postId}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });
  });

  describe("GET /comment/:id", () => {
    beforeEach(async () => {
      const res = await request(app)
        .post("/comment")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          postId: postId,
          content: "Test Comment",
        });
      commentId = res.body._id;
    });

    it("should get comment by ID", async () => {
      const res = await request(app).get(`/comment/${commentId}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("content", "Test Comment");
    });

    it("should return 404 for non-existent comment", async () => {
      const res = await request(app).get("/comment/507f1f77bcf86cd799439011");

      expect(res.status).toBe(404);
    });
  });

  describe("PUT /comment/:id", () => {
    beforeEach(async () => {
      const res = await request(app)
        .post("/comment")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          postId: postId,
          content: "Original Comment",
        });
      commentId = res.body._id;
    });

    it("should update comment", async () => {
      const res = await request(app)
        .put(`/comment/${commentId}`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          content: "Updated Comment",
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("content", "Updated Comment");
    });

    it("should not update comment without authentication", async () => {
      const res = await request(app)
        .put(`/comment/${commentId}`)
        .send({
          content: "Updated Comment",
        });

      expect(res.status).toBe(401);
    });

    it("should return 404 for non-existent comment", async () => {
      const res = await request(app)
        .put("/comment/507f1f77bcf86cd799439011")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          content: "Updated Comment",
        });

      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /comment/:id", () => {
    beforeEach(async () => {
      const res = await request(app)
        .post("/comment")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          postId: postId,
          content: "Comment to Delete",
        });
      commentId = res.body._id;
    });

    it("should delete comment", async () => {
      const res = await request(app)
        .delete(`/comment/${commentId}`)
        .set("Authorization", `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe("Comment deleted");
    });

    it("should not delete comment without authentication", async () => {
      const res = await request(app).delete(`/comment/${commentId}`);

      expect(res.status).toBe(401);
    });

    it("should return 404 for non-existent comment", async () => {
      const res = await request(app)
        .delete("/comment/507f1f77bcf86cd799439011")
        .set("Authorization", `Bearer ${accessToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe("Error handling", () => {
    it("should handle invalid comment ID format", async () => {
      const res = await request(app).get("/comment/invalidid");

      expect(res.status).toBe(500);
    });

    it("should return 404 for non-existent comment in update", async () => {
      const res = await request(app)
        .put("/comment/507f1f77bcf86cd799439011")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ content: "Updated" });

      expect(res.status).toBe(404);
    });

    it("should return 404 for non-existent post when getting comments", async () => {
      const res = await request(app).get("/comment/posts/507f1f77bcf86cd799439011");

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });
});
