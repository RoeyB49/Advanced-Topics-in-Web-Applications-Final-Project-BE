import request from "supertest";
import axios from "axios";
import fs from "fs";
import os from "os";
import path from "path";
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

  it("should avoid repeating previous assistant picks when user asks for something else", async () => {
    const res = await request(app)
      .post("/api/ai/recommendations/chat")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        message: "give me something else",
        watchedAnimes: [],
        preferences: ["thriller", "mystery"],
        history: [
          {
            role: "assistant",
            text: "Try Monster, Death Note, and Steins;Gate.",
          },
          {
            role: "user",
            text: "nice but I already saw those",
          },
        ],
      });

    expect(res.status).toBe(200);
    const titles = res.body.recommendations.map((item: { title: string }) => item.title);
    expect(titles).not.toContain("Monster");
    expect(titles).not.toContain("Death Note");
    expect(titles).not.toContain("Steins;Gate");
  });

  it("should provide different recommendations for 'something else' even without chat history", async () => {
    const firstRes = await request(app)
      .post("/api/ai/recommendations/chat")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        message: "recommend mystery thriller anime",
        watchedAnimes: [],
        preferences: ["mystery", "thriller", "seinen", "sci-fi"],
      });

    const secondRes = await request(app)
      .post("/api/ai/recommendations/chat")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        message: "something else",
        watchedAnimes: [],
        preferences: ["mystery", "thriller", "seinen", "sci-fi"],
      });

    expect(firstRes.status).toBe(200);
    expect(secondRes.status).toBe(200);

    const firstTitles = firstRes.body.recommendations.map((item: { title: string }) => item.title);
    const secondTitles = secondRes.body.recommendations.map((item: { title: string }) => item.title);

    expect(firstTitles.length).toBeGreaterThan(0);
    expect(secondTitles.length).toBeGreaterThan(0);
    expect(secondTitles).not.toEqual(firstTitles);
    expect(secondTitles.some((title: string) => firstTitles.includes(title))).toBe(false);
  });

  it("should enforce low overlap across repeated 'something else' rounds", async () => {
    const firstRes = await request(app)
      .post("/api/ai/recommendations/chat")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        message: "recommend action and adventure anime",
        watchedAnimes: [],
        preferences: ["action", "adventure", "fantasy"],
      });

    const secondRes = await request(app)
      .post("/api/ai/recommendations/chat")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        message: "something else",
        watchedAnimes: [],
        preferences: ["action", "adventure", "fantasy"],
      });

    const thirdRes = await request(app)
      .post("/api/ai/recommendations/chat")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        message: "something else",
        watchedAnimes: [],
        preferences: ["action", "adventure", "fantasy"],
      });

    expect(firstRes.status).toBe(200);
    expect(secondRes.status).toBe(200);
    expect(thirdRes.status).toBe(200);

    const firstTitles = firstRes.body.recommendations.map((item: { title: string }) => item.title);
    const secondTitles = secondRes.body.recommendations.map((item: { title: string }) => item.title);
    const thirdTitles = thirdRes.body.recommendations.map((item: { title: string }) => item.title);

    const firstAndSecond = new Set([...firstTitles, ...secondTitles]);
    const overlapWithPreviousRounds = thirdTitles.filter((title: string) => firstAndSecond.has(title));

    expect(overlapWithPreviousRounds.length).toBeLessThanOrEqual(1);
  });

  it("should treat explicit title requests like Blue Lock as sports intent", async () => {
    const res = await request(app)
      .post("/api/ai/recommendations/chat")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        message: "maybe something like blue lock?",
        watchedAnimes: [],
        preferences: [],
      });

    expect(res.status).toBe(200);
    const titles = res.body.recommendations.map((item: { title: string }) => item.title);

    expect(
      titles.includes("Blue Lock") ||
      titles.includes("Haikyuu!!") ||
      titles.includes("Kuroko's Basketball")
    ).toBe(true);
  });

  it("should enforce sports-only recommendations when user asks for just sports", async () => {
    const res = await request(app)
      .post("/api/ai/recommendations/chat")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        message: "just sports please",
        watchedAnimes: ["Attack on Titan"],
        preferences: ["sports"],
        history: [
          { role: "assistant", text: "Do you prefer intense games or team growth arcs?" },
          { role: "user", text: "I want something funny" },
          { role: "assistant", text: "Try Mob Psycho 100 II and Blue Lock." },
          { role: "user", text: "Maybe blue lock?" },
          { role: "assistant", text: "Blue Lock is a great fit." },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("source", "fallback");
    expect(Array.isArray(res.body.recommendations)).toBe(true);
    expect(res.body.recommendations.length).toBeGreaterThan(0);

    const allSports = res.body.recommendations.every((item: { genres: string[] }) =>
      Array.isArray(item.genres) && item.genres.includes("sports")
    );
    expect(allSports).toBe(true);
    expect(String(res.body.reply).toLowerCase()).toContain("sports");
    expect(String(res.body.reply).toLowerCase()).not.toContain("action");
    expect(String(res.body.reply).toLowerCase()).not.toContain("thriller");
    expect(String(res.body.reply).toLowerCase()).not.toContain("mecha");
  });

  it("should exclude sports recommendations when user says they do not want sports", async () => {
    const res = await request(app)
      .post("/api/ai/recommendations/chat")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        message: "dude I don't want sports",
        watchedAnimes: ["Attack on Titan"],
        preferences: ["sports", "drama"],
        history: [
          {
            role: "assistant",
            text: "I pulled Blue Lock and Haikyuu!! from your taste profile.",
          },
          {
            role: "user",
            text: "please not sports",
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("source", "fallback");
    expect(Array.isArray(res.body.recommendations)).toBe(true);
    expect(res.body.recommendations.length).toBeGreaterThan(0);

    const hasAnySports = res.body.recommendations.some((item: { genres: string[] }) =>
      Array.isArray(item.genres) && item.genres.includes("sports")
    );
    expect(hasAnySports).toBe(false);
    expect(String(res.body.reply).toLowerCase()).not.toContain("sports");
  });

  it("should return groq recommendations when external AI is enabled", async () => {
    process.env.AI_EXTERNAL_ENABLED = "true";
    process.env.GROQ_API_KEY = "test-groq-key";

    mockedAxios.post.mockResolvedValueOnce({
      data: {
        choices: [
          {
            message: {
              content: JSON.stringify({
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
    expect(res.body).toHaveProperty("source", "groq");
    expect(res.body.debug).toBeUndefined();
    expect(res.body.recommendations[0]).toHaveProperty("title", "Vinland Saga");
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining("api.groq.com/openai/v1/chat/completions"),
      expect.any(Object),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer test-groq-key" }),
      })
    );

    process.env.AI_EXTERNAL_ENABLED = "false";
  });

  it("should not return stale cached response when history changes", async () => {
    process.env.AI_EXTERNAL_ENABLED = "true";
    process.env.GROQ_API_KEY = "test-groq-key";

    mockedAxios.post
      .mockResolvedValueOnce({
        data: {
          choices: [
            {
              message: {
                content: JSON.stringify({
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
            },
          ],
        },
      } as any)
      .mockResolvedValueOnce({
        data: {
          choices: [
            {
              message: {
                content: JSON.stringify({
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

  it("should remove rejected titles from groq output", async () => {
    process.env.AI_EXTERNAL_ENABLED = "true";
    process.env.GROQ_API_KEY = "test-groq-key";

    mockedAxios.post.mockResolvedValueOnce({
      data: {
        choices: [
          {
            message: {
              content: JSON.stringify({
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
    expect(res.body).toHaveProperty("source", "groq");
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

  it("should expose advisor metrics for authenticated users", async () => {
    await request(app)
      .post("/api/ai/recommendations/chat")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        message: "recommend thriller anime",
        watchedAnimes: [],
        preferences: ["thriller"],
      });

    const metricsRes = await request(app)
      .get("/api/ai/recommendations/metrics")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(metricsRes.status).toBe(200);
    expect(metricsRes.body).toHaveProperty("totalChatRequests");
    expect(metricsRes.body).toHaveProperty("externalUsageRate");
    expect(metricsRes.body).toHaveProperty("repetitionRate");
    expect(metricsRes.body).toHaveProperty("fallbackReasons");
    expect(metricsRes.body).toHaveProperty("catalogSize");
    expect(metricsRes.body).toHaveProperty("rollingWindow");
    expect(metricsRes.body.rollingWindow).toHaveProperty("windowMs");
    expect(metricsRes.body.rollingWindow).toHaveProperty("totalChatRequests");
    expect(metricsRes.body.rollingWindow).toHaveProperty("externalUsageRate");
    expect(metricsRes.body.rollingWindow.totalChatRequests).toBeGreaterThan(0);
    expect(metricsRes.body.totalChatRequests).toBeGreaterThan(0);
    expect(metricsRes.body.catalogSize).toBeGreaterThan(0);
  });

  it("should reset advisor metrics only for admin users", async () => {
    process.env.AI_METRICS_ADMIN_USERS = "aireco@example.com";

    await request(app)
      .post("/api/ai/recommendations/chat")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        message: "recommend action anime",
        watchedAnimes: [],
        preferences: ["action"],
      });

    const nonAdminAuth = await request(app).post("/api/auth/register").send({
      username: "nonadminuser",
      email: "nonadmin@example.com",
      password: "password123",
    });
    const nonAdminToken = nonAdminAuth.body.accessToken;

    const forbiddenRes = await request(app)
      .post("/api/ai/recommendations/metrics/reset")
      .set("Authorization", `Bearer ${nonAdminToken}`)
      .send({});

    expect(forbiddenRes.status).toBe(403);

    const resetRes = await request(app)
      .post("/api/ai/recommendations/metrics/reset")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({});

    expect(resetRes.status).toBe(200);
    expect(resetRes.body).toHaveProperty("totalChatRequests", 0);
    expect(resetRes.body).toHaveProperty("externalResponses", 0);
    expect(resetRes.body).toHaveProperty("fallbackResponses", 0);
    expect(resetRes.body).toHaveProperty("rollingWindow.totalChatRequests", 0);

    delete process.env.AI_METRICS_ADMIN_USERS;
  });

  it("should hot-reload catalog when file mtime changes", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "anime-catalog-"));
    const tempCatalogPath = path.join(tempDir, "catalog.json");
    const catalogV1 = [
      {
        title: "Temp Anime One",
        genres: ["action"],
        moods: ["intense"],
        tags: ["test"],
      },
    ];
    const catalogV2 = [
      {
        title: "Temp Anime One",
        genres: ["action"],
        moods: ["intense"],
        tags: ["test"],
      },
      {
        title: "Temp Anime Two",
        genres: ["drama"],
        moods: ["serious"],
        tags: ["test"],
      },
    ];

    process.env.AI_CATALOG_PATH = tempCatalogPath;
    fs.writeFileSync(tempCatalogPath, `${JSON.stringify(catalogV1, null, 2)}\n`, "utf8");

    await request(app)
      .post("/api/ai/recommendations/chat")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        message: "recommend me action anime",
        watchedAnimes: [],
        preferences: ["action"],
      });

    const firstMetrics = await request(app)
      .get("/api/ai/recommendations/metrics")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(firstMetrics.status).toBe(200);
    expect(firstMetrics.body).toHaveProperty("catalogSize", 1);

    await new Promise((resolve) => setTimeout(resolve, 20));
    fs.writeFileSync(tempCatalogPath, `${JSON.stringify(catalogV2, null, 2)}\n`, "utf8");

    await request(app)
      .post("/api/ai/recommendations/chat")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        message: "recommend me drama anime",
        watchedAnimes: [],
        preferences: ["drama"],
      });

    const secondMetrics = await request(app)
      .get("/api/ai/recommendations/metrics")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(secondMetrics.status).toBe(200);
    expect(secondMetrics.body).toHaveProperty("catalogSize", 2);
    expect(String(secondMetrics.body.catalogPath || "")).toContain("catalog.json");

    delete process.env.AI_CATALOG_PATH;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});
