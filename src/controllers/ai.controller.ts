import { Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import { getAnimeRecommendationChat } from "../services/ai.service";

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
