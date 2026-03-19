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
router.post(
  "/",
  authMiddleware,
  uploadPostImage.single("image"),
  postController.createPost
);
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
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               content:
 *                 type: string
 *     responses:
 *       200:
 *         description: Post updated successfully
 *       404:
 *         description: Post not found
 */
router.put("/:id", authMiddleware, postController.updatePost);

/**
 * @swagger
 * /post/{id}:
 *   delete:
 *     summary: Delete a post
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Post deleted successfully
 *       404:
 *         description: Post not found
 */
router.delete("/:id", authMiddleware, postController.deletePost);

export default router;
