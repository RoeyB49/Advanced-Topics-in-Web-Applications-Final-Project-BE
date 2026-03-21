import express from "express";
import * as postController from "../controllers/post.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import { uploadPostImage } from "../services/upload.service";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Posts
 *   description: Post management
 */

router.get("/", postController.getAllPosts);

/**
 * @swagger
 * /api/posts/me:
 *   get:
 *     summary: Get posts of current logged-in user
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user's posts list
 *       401:
 *         description: Unauthorized
 */
router.get("/me", authMiddleware, postController.getMyPosts);
router.post(
  "/",
  authMiddleware,
  uploadPostImage.single("image"),
  postController.createPost
);
router.get("/search", postController.searchPosts);
router.get("/search/intelligent", postController.intelligentSearchPosts);
router.get("/:id", postController.getPostById);
router.put(
  "/:id",
  authMiddleware,
  uploadPostImage.single("image"),
  postController.updatePost
);
router.delete("/:id", authMiddleware, postController.deletePost);
router.post("/:id/like", authMiddleware, postController.likePost);

export default router;
