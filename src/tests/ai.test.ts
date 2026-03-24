import request from "supertest";
import axios from "axios";
import { app } from "../app";

jest.mock("axios");

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("AI Endpoints", () => {
  let accessToken: string;

  beforeEach(async () => {
    mockedAxios.post.mockReset();

    const authRes = await request(app).post("/api/auth/register").send({
      username: "aireco",
      email: "aireco@example.com",
      password: "password123",
    });

    accessToken = authRes.body.accessToken;
  });

  it("should return fallback recommendations from chat endpoint", async () => {
    const res = await request(app)
      .post("/api/ai/recommendations/chat")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        message: "I want dark thriller anime with mind games",
        watchedAnimes: ["Death Note"],
        preferences: ["thriller", "mystery"],
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("source", "fallback");
    expect(res.body).toHaveProperty("reply");
    expect(Array.isArray(res.body.recommendations)).toBe(true);
    expect(res.body.recommendations.length).toBeGreaterThan(0);
    expect(res.body).toHaveProperty("basedOn");
    expect(res.body.basedOn).toHaveProperty("watchedCount", 1);
  });

  it("should return gemini recommendations when external AI is enabled", async () => {
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
                    reply: "You should try Vinland Saga and Monster for mature dark themes.",
                    extractedPreferences: ["dark", "thriller", "seinen"],
                    recommendations: [
                      {
                        title: "Vinland Saga",
                        reason: "Strong character writing with mature war themes.",
                        genres: ["action", "drama", "seinen"],
                        mood: "serious",
                        confidence: 88,
                      },
                      {
                        title: "Monster",
                        reason: "Psychological suspense and deep moral conflict.",
                        genres: ["mystery", "thriller", "seinen"],
                        mood: "dark",
                        confidence: 90,
                      },
                    ],
                  }),
                },
              ],
            },
          },
        ],
      },
    } as any);

    const res = await request(app)
      .post("/api/ai/recommendations/chat")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        message: "Recommend dark mature anime with great writing",
        watchedAnimes: ["Attack on Titan"],
        preferences: ["seinen", "thriller"],
        history: [
          { role: "user", text: "I like deep stories." },
          { role: "assistant", text: "Do you prefer action or psychological?" },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("source", "gemini");
    expect(res.body.recommendations[0]).toHaveProperty("title", "Vinland Saga");
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining("generativelanguage.googleapis.com"),
      expect.any(Object),
      expect.objectContaining({
        params: expect.objectContaining({ key: "test-gemini-key" }),
      })
    );

    process.env.AI_EXTERNAL_ENABLED = "false";
  });

  it("should require authentication for recommendation chat", async () => {
    const res = await request(app).post("/api/ai/recommendations/chat").send({
      message: "recommend anime",
    });

    expect(res.status).toBe(401);
  });

  it("should validate required message field", async () => {
    const res = await request(app)
      .post("/api/ai/recommendations/chat")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ watchedAnimes: ["Naruto"] });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("message", "message is required");
  });
});
