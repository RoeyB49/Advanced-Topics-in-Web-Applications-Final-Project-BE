import { Request, Response } from "express";
import User, { IUser } from "../models/user.model";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import axios from "axios";
import { OAuth2Client } from "google-auth-library";

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID;
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET;

if (!ACCESS_TOKEN_SECRET || !REFRESH_TOKEN_SECRET) {
  throw new Error(
    "ACCESS_TOKEN_SECRET and REFRESH_TOKEN_SECRET must be defined in environment variables"
  );
}

const ACCESS_TOKEN_EXPIRATION = "15m";
const REFRESH_TOKEN_EXPIRATION = "7d";
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

type SocialProfile = {
  providerId: string;
  email: string;
  username: string;
  profileImage?: string;
};

const verifyGoogleToken = async (token: string): Promise<SocialProfile> => {
  if (!googleClient || !GOOGLE_CLIENT_ID) {
    throw new Error("Google login is not configured on the server");
  }

  const ticket = await googleClient.verifyIdToken({
    idToken: token,
    audience: GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();

  if (!payload?.sub || !payload.email || !payload.name) {
    throw new Error("Invalid Google token payload");
  }

  return {
    providerId: payload.sub,
    email: payload.email,
    username: payload.name,
    profileImage: payload.picture,
  };
};

const verifyFacebookToken = async (token: string): Promise<SocialProfile> => {
  if (!FACEBOOK_APP_ID || !FACEBOOK_APP_SECRET) {
    throw new Error("Facebook login is not configured on the server");
  }

  const appAccessToken = `${FACEBOOK_APP_ID}|${FACEBOOK_APP_SECRET}`;

  const debugResponse = await axios.get("https://graph.facebook.com/debug_token", {
    params: {
      input_token: token,
      access_token: appAccessToken,
    },
  });

  const debugData = debugResponse.data?.data;

  if (!debugData?.is_valid || debugData.app_id !== FACEBOOK_APP_ID) {
    throw new Error("Invalid Facebook token");
  }

  const profileResponse = await axios.get("https://graph.facebook.com/me", {
    params: {
      fields: "id,name,email,picture.type(large)",
      access_token: token,
    },
  });

  const profile = profileResponse.data;
  if (!profile?.id || !profile?.name || !profile?.email) {
    throw new Error("Facebook account must provide name and email");
  }

  return {
    providerId: profile.id,
    email: profile.email,
    username: profile.name,
    profileImage: profile.picture?.data?.url,
  };
};

const buildUniqueUsername = async (rawUsername: string) => {
  const base = rawUsername
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24) || "user";

  let candidate = base;
  let suffix = 1;

  while (await User.exists({ username: candidate })) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }

  return candidate;
};

const generateTokens = (userId: string) => {
  const accessToken = jwt.sign({ _id: userId }, ACCESS_TOKEN_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRATION,
  });
  const refreshToken = jwt.sign({ _id: userId }, REFRESH_TOKEN_SECRET, {
    expiresIn: REFRESH_TOKEN_EXPIRATION,
  });
  return { accessToken, refreshToken };
};

const saveAndRespondWithTokens = async (user: IUser, res: Response, status = 200) => {
  const { accessToken, refreshToken } = generateTokens(user._id.toString());
  user.refreshTokens.push(refreshToken);
  await user.save();

  res.status(status).json({
    message: status === 201 ? "User registered successfully" : "Login successful",
    user: {
      _id: user._id,
      username: user.username,
      email: user.email,
      profileImage: user.profileImage || "",
      provider: user.provider || "local"
    },
    accessToken,
    refreshToken
  });
};

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      res.status(400).json({ message: "All fields are required" });
      return;
    }

    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      res.status(409).json({ message: "User with this email or username already exists" });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = (await User.create({
      username,
      email,
      password: hashedPassword,
    })) as IUser;

    await saveAndRespondWithTokens(user, res, 201);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ message: "Email and password are required" });
      return;
    }

    const user = await User.findOne({ email });
    if (!user) {
      res.status(401).json({ message: "Invalid credentials" });
      return;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password || "");
    if (!isPasswordValid) {
      res.status(401).json({ message: "Invalid credentials" });
      return;
    }

    await saveAndRespondWithTokens(user as IUser, res, 200);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const socialAuth = async (req: Request, res: Response): Promise<void> => {
  try {
    const { provider, token } = req.body;

    if (!["google", "facebook"].includes(provider)) {
      res.status(400).json({ message: "provider must be google or facebook" });
      return;
    }

    if (!token) {
      res.status(400).json({ message: "provider token is required" });
      return;
    }

    const socialProfile =
      provider === "google"
        ? await verifyGoogleToken(token)
        : await verifyFacebookToken(token);

    const { providerId, email, username, profileImage } = socialProfile;

    let user = (await User.findOne({
      $or: [{ provider, providerId }, { email }]
    })) as IUser | null;

    if (!user) {
      const usernameToUse = await buildUniqueUsername(username);
      user = (await User.create({
        username: usernameToUse,
        email,
        profileImage: storedProfileImage || "",
        provider,
        providerId,
        refreshTokens: []
      })) as IUser;
    } else {
      user.provider = provider;
      user.providerId = providerId;
      if (profileImage) {
        user.profileImage = profileImage;
      }
    }

    await saveAndRespondWithTokens(user, res, 200);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const logout = async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({ message: "Refresh token is required" });
      return;
    }

    const decoded = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET) as { _id: string };

    const user = await User.findById(decoded._id);
    if (!user) {
      res.status(401).json({ message: "Invalid token" });
      return;
    }

    user.refreshTokens = user.refreshTokens.filter((token) => token !== refreshToken);
    await user.save();

    res.status(200).json({ message: "Logout successful" });
  } catch (error: any) {
    res.status(401).json({ message: "Invalid token" });
  }
};

export const refreshToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({ message: "Refresh token is required" });
      return;
    }

    const decoded = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET) as { _id: string };

    const user = await User.findById(decoded._id);
    if (!user || !user.refreshTokens.includes(refreshToken)) {
      res.status(401).json({ message: "Invalid refresh token" });
      return;
    }

    const { accessToken, refreshToken: newRefreshToken } = generateTokens((user as IUser)._id.toString());

    user.refreshTokens = user.refreshTokens.filter((token) => token !== refreshToken);
    user.refreshTokens.push(newRefreshToken);
    await user.save();

    res.status(200).json({
      accessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error: any) {
    res.status(401).json({ message: "Invalid token" });
  }
};
