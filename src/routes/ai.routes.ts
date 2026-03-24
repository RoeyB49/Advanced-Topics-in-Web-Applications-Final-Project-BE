import express from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import * as aiController from "../controllers/ai.controller";

const router = express.Router();

router.post("/recommendations/chat", authMiddleware, aiController.recommendationChat);

export default router;
