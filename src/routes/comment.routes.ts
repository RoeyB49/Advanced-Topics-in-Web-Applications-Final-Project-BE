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

export default router;
 * @swagger
 * /comment/{id}:
 *   put:
 *     summary: Update a comment
 *     tags: [Comments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *     responses:
 *       200:
 *         description: Comment updated successfully
 *       404:
 *         description: Comment not found
 */
router.put("/:id", authMiddleware, commentController.updateComment);

/**
 * @swagger
 * /comment/{id}:
 *   delete:
 *     summary: Delete a comment
 *     tags: [Comments]
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
 *         description: Comment deleted successfully
 *       404:
 *         description: Comment not found
 */
router.delete("/:id", authMiddleware, commentController.deleteComment);

export default router;
