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
    expect(res.body).toHaveProperty("debug.fallbackReason", "external-disabled");
  });

  it("should exclude titles explicitly rejected by the user in fallback mode", async () => {
    const res = await request(app)
      .post("/api/ai/recommendations/chat")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        message: "Recommend dark psychological anime, but remove Monster",
        watchedAnimes: ["Attack on Titan"],
        preferences: ["thriller"],
        history: [{ role: "user", text: "I do not want Monster in suggestions" }],
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("source", "fallback");
    const titles = res.body.recommendations.map((item: { title: string }) => item.title);
    expect(titles).not.toContain("Monster");
  });

  it("should exclude titles when user says besides <title>", async () => {
    const res = await request(app)
      .post("/api/ai/recommendations/chat")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        message: "suggest me anything BESIDE Death Note please",
        watchedAnimes: [],
        preferences: ["thriller"],
      });

    expect(res.status).toBe(200);
    const titles = res.body.recommendations.map((item: { title: string }) => item.title);
    expect(titles).not.toContain("Death Note");
  });

  it("should keep exclusion constraints after long chat history", async () => {
    const longHistory = [
      { role: "user", text: "I like thrillers" },
      { role: "assistant", text: "Try darker shows." },
      { role: "user", text: "I enjoy mind games" },
      { role: "assistant", text: "Great, noted." },
      { role: "user", text: "No Death Note please" },
      { role: "assistant", text: "Okay, excluding it." },
      { role: "user", text: "More options" },
      { role: "assistant", text: "Here are more." },
      { role: "user", text: "Keep going" },
      { role: "assistant", text: "Sure." },
      { role: "user", text: "Another round please" },
      { role: "assistant", text: "Continuing." },
    ];

    const res = await request(app)
      .post("/api/ai/recommendations/chat")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        message: "new recommendations please",
        watchedAnimes: [],
        preferences: ["thriller"],
        history: longHistory,
      });

    expect(res.status).toBe(200);
    const titles = res.body.recommendations.map((item: { title: string }) => item.title);
    expect(titles).not.toContain("Death Note");
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
    expect(res.body.debug).toBeUndefined();
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

  it("should not return stale cached response when history changes", async () => {
    process.env.AI_EXTERNAL_ENABLED = "true";
    process.env.GEMINI_API_KEY = "test-gemini-key";

    mockedAxios.post
      .mockResolvedValueOnce({
        data: {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      reply: "First response",
                      extractedPreferences: ["thriller"],
                      recommendations: [
                        {
                          title: "Monster",
                          reason: "Dark psychological tension.",
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
      } as any)
      .mockResolvedValueOnce({
        data: {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      reply: "Second response",
                      extractedPreferences: ["thriller", "mind games"],
                      recommendations: [
                        {
                          title: "Death Note",
                          reason: "High-stakes mind games and strategy.",
                          genres: ["thriller", "mystery"],
                          mood: "strategic",
                          confidence: 87,
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

    const firstRes = await request(app)
      .post("/api/ai/recommendations/chat")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        message: "Recommend dark anime",
        watchedAnimes: ["Attack on Titan"],
        preferences: ["thriller"],
        history: [{ role: "user", text: "I like serious stories" }],
      });

    const secondRes = await request(app)
      .post("/api/ai/recommendations/chat")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        message: "Recommend dark anime",
        watchedAnimes: ["Attack on Titan"],
        preferences: ["thriller"],
        history: [
          { role: "user", text: "I like serious stories" },
          { role: "assistant", text: "Do you prefer mind games?" },
          { role: "user", text: "Yes, definitely" },
        ],
      });

    expect(firstRes.status).toBe(200);
    expect(secondRes.status).toBe(200);
    expect(firstRes.body.reply).toBe("First response");
    expect(secondRes.body.reply).toBe("Second response");
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);

    process.env.AI_EXTERNAL_ENABLED = "false";
  });

  it("should remove rejected titles from gemini output", async () => {
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
                    reply: "Try these picks",
                    extractedPreferences: ["thriller"],
                    recommendations: [
                      {
                        title: "Monster",
                        reason: "Dark psychological thriller.",
                        genres: ["mystery", "thriller", "seinen"],
                        mood: "dark",
                        confidence: 92,
                      },
                      {
                        title: "Steins;Gate",
                        reason: "Strong tension and twists.",
                        genres: ["sci-fi", "thriller", "drama"],
                        mood: "tense",
                        confidence: 88,
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
        message: "Recommend thrillers but don't want Monster",
        watchedAnimes: ["Attack on Titan"],
        preferences: ["thriller"],
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("source", "gemini");
    const titles = res.body.recommendations.map((item: { title: string }) => item.title);
    expect(titles).not.toContain("Monster");

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
