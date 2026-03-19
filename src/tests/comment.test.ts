import request from "supertest";
import { app } from "../app";

describe("Comment Endpoints", () => {
  let accessToken: string;
  let postId: string;
  let commentId: string;

  beforeEach(async () => {
    const authRes = await request(app).post("/api/auth/register").send({
      username: "commenter",
      email: "commenter@example.com",
      password: "password123"
    });

    accessToken = authRes.body.accessToken;

    const postRes = await request(app)
      .post("/api/posts")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ text: "Post for comments" });

    postId = postRes.body._id;
  });

  it("should create a comment", async () => {
    const res = await request(app)
      .post(`/api/posts/${postId}/comments`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ text: "Nice post" });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("text", "Nice post");
    expect(res.body).toHaveProperty("post");
    expect(res.body).toHaveProperty("author");

    commentId = res.body._id;
  });

  it("should list comments for a post", async () => {
    await request(app)
      .post(`/api/posts/${postId}/comments`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ text: "First" });

    const res = await request(app).get(`/api/posts/${postId}/comments`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);
    expect(res.body[0]).toHaveProperty("text", "First");
  });

  it("should update own comment", async () => {
    const created = await request(app)
      .post(`/api/posts/${postId}/comments`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ text: "Before" });

    commentId = created.body._id;

    const res = await request(app)
      .put(`/api/posts/${postId}/comments/${commentId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ text: "After" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("text", "After");
  });

  it("should delete own comment", async () => {
    const created = await request(app)
      .post(`/api/posts/${postId}/comments`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ text: "Delete me" });

    commentId = created.body._id;

    const res = await request(app)
      .delete(`/api/posts/${postId}/comments/${commentId}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Comment deleted");
  });
});
