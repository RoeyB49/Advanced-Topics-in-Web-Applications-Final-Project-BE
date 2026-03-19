import request from "supertest";
import { app } from "../app";

describe("Post Endpoints", () => {
  let accessToken: string;
  let postId: string;

  beforeEach(async () => {
    const res = await request(app).post("/api/auth/register").send({
      username: "testuser",
      email: "test@example.com",
      password: "password123"
    });

    accessToken = res.body.accessToken;
  });

  it("should create a post", async () => {
    const res = await request(app)
      .post("/api/posts")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ text: "This is my first post" });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("text", "This is my first post");
    expect(res.body).toHaveProperty("author");
    postId = res.body._id;
  });

  it("should get feed posts with paging metadata", async () => {
    await request(app)
      .post("/api/posts")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ text: "Post A" });

    const res = await request(app).get("/api/posts?page=1&limit=10");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("posts");
    expect(res.body).toHaveProperty("totalPages");
    expect(res.body).toHaveProperty("currentPage");
    expect(Array.isArray(res.body.posts)).toBe(true);
    expect(res.body.posts[0]).toHaveProperty("commentsCount");
  });

  it("should get my posts", async () => {
    await request(app)
      .post("/api/posts")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ text: "My Post" });

    const res = await request(app)
      .get("/api/posts/me")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);
  });

  it("should update own post", async () => {
    const created = await request(app)
      .post("/api/posts")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ text: "Before" });

    postId = created.body._id;

    const res = await request(app)
      .put(`/api/posts/${postId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ text: "After" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("text", "After");
  });

  it("should like and unlike a post", async () => {
    const created = await request(app)
      .post("/api/posts")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ text: "Like me" });

    postId = created.body._id;

    const likeRes = await request(app)
      .post(`/api/posts/${postId}/like`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(likeRes.status).toBe(200);
    expect(likeRes.body.likes.length).toBe(1);

    const unlikeRes = await request(app)
      .post(`/api/posts/${postId}/like`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(unlikeRes.status).toBe(200);
    expect(unlikeRes.body.likes.length).toBe(0);
  });

  it("should delete own post", async () => {
    const created = await request(app)
      .post("/api/posts")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ text: "Delete me" });

    postId = created.body._id;

    const res = await request(app)
      .delete(`/api/posts/${postId}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toContain("deleted successfully");
  });
});
