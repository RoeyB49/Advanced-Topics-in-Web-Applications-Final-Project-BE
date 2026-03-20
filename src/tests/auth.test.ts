import request from "supertest";
import axios from "axios";
import { app } from "../app";

jest.mock("axios");

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("Auth Endpoints", () => {
  describe("POST /api/auth/register", () => {
    it("should register a new user", async () => {
      const res = await request(app).post("/api/auth/register").send({
        username: "testuser",
        email: "test@example.com",
        password: "password123"
      });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("accessToken");
      expect(res.body).toHaveProperty("refreshToken");
      expect(res.body.user).toHaveProperty("username", "testuser");
      expect(res.body.user).toHaveProperty("email", "test@example.com");
    });

    it("should not register user with missing fields", async () => {
      const res = await request(app).post("/api/auth/register").send({
        username: "testuser",
        password: "password123"
      });

      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/auth/login", () => {
    beforeEach(async () => {
      await request(app).post("/api/auth/register").send({
        username: "loginuser",
        email: "login@example.com",
        password: "password123"
      });
    });

    it("should login existing user", async () => {
      const res = await request(app).post("/api/auth/login").send({
        email: "login@example.com",
        password: "password123"
      });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("accessToken");
      expect(res.body).toHaveProperty("refreshToken");
    });

    it("should not login with wrong password", async () => {
      const res = await request(app).post("/api/auth/login").send({
        email: "login@example.com",
        password: "wrongpassword"
      });

      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/auth/social", () => {
    beforeEach(() => {
      mockedAxios.get.mockReset();
    });

    it("should login/register using social provider", async () => {
      const res = await request(app).post("/api/auth/social").send({
        provider: "google",
        providerId: "google-user-1",
        username: "socialuser",
        email: "social@example.com"
      });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("accessToken");
      expect(res.body).toHaveProperty("refreshToken");
      expect(res.body.user).toHaveProperty("provider", "google");
    });

    it("should login/register with a valid Google token using mocked verification", async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          aud: process.env.GOOGLE_CLIENT_ID,
          sub: "google-token-user-1",
          email: "token-google@example.com",
          name: "Token Google User",
        },
      } as any);

      const res = await request(app).post("/api/auth/social").send({
        provider: "google",
        token: "mock-google-id-token",
      });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("accessToken");
      expect(res.body).toHaveProperty("refreshToken");
      expect(res.body.user).toHaveProperty("provider", "google");
      expect(res.body.user).toHaveProperty("email", "token-google@example.com");
      expect(mockedAxios.get).toHaveBeenCalledWith(
        "https://oauth2.googleapis.com/tokeninfo",
        expect.objectContaining({
          params: { id_token: "mock-google-id-token" },
        })
      );
    });

    it("should login/register with a valid Facebook token using mocked verification", async () => {
      mockedAxios.get
        .mockResolvedValueOnce({
          data: {
            data: {
              is_valid: true,
              app_id: process.env.FACEBOOK_APP_ID,
            },
          },
        } as any)
        .mockResolvedValueOnce({
          data: {
            id: "facebook-token-user-1",
            name: "Token Facebook User",
            email: "token-facebook@example.com",
          },
        } as any);

      const res = await request(app).post("/api/auth/social").send({
        provider: "facebook",
        token: "mock-facebook-access-token",
      });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("accessToken");
      expect(res.body).toHaveProperty("refreshToken");
      expect(res.body.user).toHaveProperty("provider", "facebook");
      expect(res.body.user).toHaveProperty("email", "token-facebook@example.com");
      expect(mockedAxios.get).toHaveBeenNthCalledWith(
        1,
        "https://graph.facebook.com/debug_token",
        expect.objectContaining({
          params: {
            input_token: "mock-facebook-access-token",
            access_token: `${process.env.FACEBOOK_APP_ID}|${process.env.FACEBOOK_APP_SECRET}`,
          },
        })
      );
      expect(mockedAxios.get).toHaveBeenNthCalledWith(
        2,
        "https://graph.facebook.com/me",
        expect.objectContaining({
          params: {
            fields: "id,name,email,picture.type(large)",
            access_token: "mock-facebook-access-token",
          },
        })
      );
    });

    it("should reject invalid Google token payload from mocked verifier", async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          aud: process.env.GOOGLE_CLIENT_ID,
        },
      } as any);

      const res = await request(app).post("/api/auth/social").send({
        provider: "google",
        token: "invalid-google-id-token",
      });

      expect(res.status).toBe(500);
      expect(res.body).toHaveProperty("message", "Invalid Google token payload");
    });
  });

  describe("POST /api/auth/logout", () => {
    let refreshToken: string;

    beforeEach(async () => {
      const res = await request(app).post("/api/auth/register").send({
        username: "logoutuser",
        email: "logout@example.com",
        password: "password123"
      });
      refreshToken = res.body.refreshToken;
    });

    it("should logout user", async () => {
      const res = await request(app)
        .post("/api/auth/logout")
        .send({ refreshToken });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe("Logout successful");
    });
  });

  describe("POST /api/auth/refresh", () => {
    let refreshToken: string;

    beforeEach(async () => {
      const res = await request(app).post("/api/auth/register").send({
        username: "refreshuser",
        email: "refresh@example.com",
        password: "password123"
      });
      refreshToken = res.body.refreshToken;
    });

    it("should refresh access token", async () => {
      const res = await request(app)
        .post("/api/auth/refresh")
        .send({ refreshToken });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("accessToken");
      expect(res.body).toHaveProperty("refreshToken");
    });
  });
});
