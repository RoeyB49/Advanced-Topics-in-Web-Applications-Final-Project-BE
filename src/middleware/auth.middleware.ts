import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import User, { IUser } from "../models/user.model";

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || "your-access-token-secret";

export interface AuthRequest extends Request {
  user?: IUser;
  body: any;
  params: any;
}

export const authMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ message: "No token provided" });
      return;
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix

    // Verify token
    const decoded = jwt.verify(token, ACCESS_TOKEN_SECRET) as { _id: string };

    // Find user
    const user = await User.findById(decoded._id);
    if (!user) {
      res.status(401).json({ message: "Invalid token" });
      return;
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (error: any) {
    res.status(401).json({ message: "Invalid token" });
  }
};
