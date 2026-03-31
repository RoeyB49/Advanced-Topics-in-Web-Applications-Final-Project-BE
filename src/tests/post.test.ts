import request from "supertest";
import axios from "axios";
import { app } from "../app";

jest.mock("axios");

const mockedAxios = axios as jest.Mocked<typeof axios>;

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

  it("should return anime-aware AI analysis with intelligent search results", async () => {
    await request(app)
      .post("/api/posts")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ text: "Attack on Titan has one of the best dark story arcs" });

    const res = await request(app)
      .get("/api/posts/search/intelligent")
      .query({ q: "best dark anime like attack on titan" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("query", "best dark anime like attack on titan");
    expect(res.body).toHaveProperty("posts");
    expect(Array.isArray(res.body.posts)).toBe(true);
    expect(res.body).toHaveProperty("ai");
    expect(res.body.ai).toHaveProperty("source", "fallback");
    expect(res.body.ai).toHaveProperty("intent");
    expect(res.body.ai).toHaveProperty("sentimentHint", "positive");
    expect(Array.isArray(res.body.ai.keywords)).toBe(true);
    expect(Array.isArray(res.body.ai.detectedAnimeTitles)).toBe(true);
    expect(res.body.ai.detectedAnimeTitles).toContain("attack on titan");
    expect(Array.isArray(res.body.ai.detectedGenres)).toBe(true);
    expect(res.body.posts.length).toBeGreaterThan(0);
  });

  it("should return 400 for intelligent search without query", async () => {
    const res = await request(app).get("/api/posts/search/intelligent");

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("message", "Search query is required");
  });

  it("should use Gemini provider for intelligent search when enabled", async () => {
    process.env.AI_EXTERNAL_ENABLED = "true";
    process.env.GEMINI_API_KEY = "test-gemini-key";

    mockedAxios.post.mockResolvedValueOnce({
      data: {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    keywords: ["attack", "titan", "dark"],
                    detectedAnimeTitles: ["attack on titan"],
                    detectedGenres: ["action", "drama"],
                    sentimentHint: "positive",
                    intent: "analysis",
                  }),
                },
              ],
            },
          },
        ],
      },
    } as any);

    await request(app)
      .post("/api/posts")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ text: "Attack on Titan analysis and dark themes" });

    const res = await request(app)
      .get("/api/posts/search/intelligent")
      .query({ q: "analyze attack on titan dark themes" });

    expect(res.status).toBe(200);
    expect(res.body.ai).toHaveProperty("source", "gemini");
    expect(res.body.ai).toHaveProperty("intent", "analysis");
    expect(res.body.ai.detectedAnimeTitles).toContain("attack on titan");
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining("generativelanguage.googleapis.com"),
      expect.any(Object),
      expect.objectContaining({
        params: expect.objectContaining({
          key: "test-gemini-key",
        }),
      })
    );

    process.env.AI_EXTERNAL_ENABLED = "false";
    mockedAxios.post.mockReset();
  });
});