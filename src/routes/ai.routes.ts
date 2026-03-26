import express from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import * as aiController from "../controllers/ai.controller";

const router = express.Router();

router.post("/recommendations/chat", authMiddleware, aiController.recommendationChat);
router.get("/recommendations/metrics", authMiddleware, aiController.recommendationMetrics);
router.post("/recommendations/metrics/reset", authMiddleware, aiController.resetRecommendationMetrics);

export default router;
