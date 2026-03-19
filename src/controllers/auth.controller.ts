import { Request, Response } from "express";
import User, { IUser } from "../models/user.model";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || "your-access-token-secret";
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || "your-refresh-token-secret";
const ACCESS_TOKEN_EXPIRATION = "15m";
const REFRESH_TOKEN_EXPIRATION = "7d";

// Generate tokens
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

/**
 * Register a new user
 */
export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, email, password } = req.body;

    // Validate required fields
    if (!username || !email || !password) {
      res.status(400).json({ message: "All fields are required" });
      return;
    }

    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      res.status(409).json({ message: "User with this email or username already exists" });
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await User.create({
      username,
      email,
      password: hashedPassword,
    }) as IUser;

    await saveAndRespondWithTokens(user, res, 201);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * Login user
 */
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      res.status(400).json({ message: "Email and password are required" });
      return;
    }

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      res.status(401).json({ message: "Invalid credentials" });
      return;
    }

    // Check password
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

/**
 * Social auth login/register (backend integration point)
 */
export const socialAuth = async (req: Request, res: Response): Promise<void> => {
  try {
    const { provider, providerId, email, username, profileImage } = req.body;

    if (!["google", "facebook"].includes(provider)) {
      res.status(400).json({ message: "provider must be google or facebook" });
      return;
    }

    if (!providerId || !email || !username) {
      res.status(400).json({ message: "providerId, email and username are required" });
      return;
    }

    let user = (await User.findOne({
      $or: [{ provider, providerId }, { email }]
    })) as IUser | null;

    if (!user) {
      user = (await User.create({
        username,
        email,
        profileImage: profileImage || "",
        provider,
        providerId,
        refreshTokens: []
      })) as IUser;
    } else {
      user.provider = provider;
      user.providerId = providerId;
      if (profileImage && !user.profileImage) {
        user.profileImage = profileImage;
      }
    }

    await saveAndRespondWithTokens(user, res, 200);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * Logout user
 */
export const logout = async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({ message: "Refresh token is required" });
      return;
    }

    // Verify token
    const decoded = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET) as { _id: string };

    // Find user and remove refresh token
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

/**
 * Refresh access token
 */
export const refreshToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({ message: "Refresh token is required" });
      return;
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET) as { _id: string };

    // Find user
    const user = await User.findById(decoded._id);
    if (!user || !user.refreshTokens.includes(refreshToken)) {
      res.status(401).json({ message: "Invalid refresh token" });
      return;
    }

    // Generate new tokens
    const { accessToken, refreshToken: newRefreshToken } = generateTokens((user as IUser)._id.toString());

    // Replace old refresh token with new one
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
