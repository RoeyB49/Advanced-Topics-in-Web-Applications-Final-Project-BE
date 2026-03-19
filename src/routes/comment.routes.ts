import express from "express";
import * as commentController from "../controllers/comment.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const router = express.Router({ mergeParams: true });

/**
 * @swagger
 * tags:
 *   name: Comments
 *   description: Comment management
 */

router.post("/", authMiddleware, commentController.createComment);
router.get("/", commentController.getCommentsByPostId);
router.put("/:id", authMiddleware, commentController.updateComment);
router.delete("/:id", authMiddleware, commentController.deleteComment);

export default router;
