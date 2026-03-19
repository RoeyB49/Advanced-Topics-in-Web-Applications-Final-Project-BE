import { Request, Response } from "express";
import Comment from "../models/comment.model";
import Post from "../models/post.model";
import { AuthRequest } from "../middleware/auth.middleware";

/**
 * @swagger
 * /api/posts/{postId}/comments:
 *   post:
 *     summary: Create a new comment on a post
 *     tags: [Comments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: postId
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
 *               text:
 *                 type: string
 *     responses:
 *       201:
 *         description: The created comment
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
export const createComment = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { text } = req.body;
    const author = req.user?._id;
    const post = req.params.postId;

    if (!author) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const comment = new Comment({
      text,
      author,
      post,
    });

    await comment.save();

    res.status(201).json(comment);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

/**
 * @swagger
 * /api/posts/{postId}/comments:
 *   get:
 *     summary: Get all comments for a post
 *     tags: [Comments]
 *     parameters:
 *       - in: path
 *         name: postId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: A list of comments
 *       500:
 *         description: Internal server error
 */
export const getCommentsByPostId = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const comments = await Comment.find({ post: req.params.postId }).populate(
      "author",
      "username profileImage"
    );
    res.status(200).json(comments);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
};
