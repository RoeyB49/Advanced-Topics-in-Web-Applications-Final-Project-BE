import { Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import {
  getAiAdvisorMetrics,
  getAnimeRecommendationChat,
  resetAiAdvisorMetrics,
} from "../services/ai.service";

const getMetricsAdmins = (): string[] => {
  return (process.env.AI_METRICS_ADMIN_USERS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
};

const AI_METRICS_STRICT_ADMIN_MODE = process.env.AI_METRICS_STRICT_ADMIN_MODE === "true";
if (AI_METRICS_STRICT_ADMIN_MODE && getMetricsAdmins().length === 0) {
  throw new Error("AI_METRICS_STRICT_ADMIN_MODE is enabled but AI_METRICS_ADMIN_USERS is empty");
}

const isMetricsAdmin = (req: AuthRequest): boolean => {
  const admins = getMetricsAdmins();
  if (!admins.length) {
    return false;
  }

  const userId = req.user?._id?.toString().toLowerCase() || "";
  const username = String(req.user?.username || "").toLowerCase();
  const email = String(req.user?.email || "").toLowerCase();

  return admins.includes(userId) || admins.includes(username) || admins.includes(email);
};

/**
 * @swagger
 * tags:
 *   name: AI
 *   description: AI-powered anime assistance
 */

/**
 * @swagger
 * /api/ai/recommendations/chat:
 *   post:
 *     summary: Get anime recommendations in chat format based on preferences and watched list
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *                 example: "I loved Attack on Titan and want a dark thriller"
 *               watchedAnimes:
 *                 type: array
 *                 items:
 *                   type: string
 *               preferences:
 *                 type: array
 *                 items:
 *                   type: string
 *               history:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     role:
 *                       type: string
 *                       enum: [user, assistant]
 *                     text:
 *                       type: string
 *     responses:
 *       200:
 *         description: AI recommendation response
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
export const recommendationChat = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?._id?.toString();
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const { message, watchedAnimes, preferences, history } = req.body;
    if (!message || typeof message !== "string") {
      res.status(400).json({ message: "message is required" });
      return;
    }

    const result = await getAnimeRecommendationChat({
      userId,
      message,
      watchedAnimes: Array.isArray(watchedAnimes) ? watchedAnimes : [],
      preferences: Array.isArray(preferences) ? preferences : [],
      history: Array.isArray(history) ? history : [],
    });

    res.status(200).json(result);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * @swagger
 * /api/ai/recommendations/metrics:
 *   get:
 *     summary: Get in-memory advisor observability metrics
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Advisor metrics snapshot
 *       401:
 *         description: Unauthorized
 */
export const recommendationMetrics = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const userId = req.user?._id?.toString();
  if (!userId) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  res.status(200).json(getAiAdvisorMetrics());
};

/**
 * @swagger
 * /api/ai/recommendations/metrics/reset:
 *   post:
 *     summary: Reset in-memory advisor observability metrics (admin only)
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Advisor metrics reset snapshot
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
export const resetRecommendationMetrics = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const userId = req.user?._id?.toString();
  if (!userId) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  if (!isMetricsAdmin(req)) {
    res.status(403).json({ message: "Forbidden" });
    return;
  }

  res.status(200).json(resetAiAdvisorMetrics());
};
