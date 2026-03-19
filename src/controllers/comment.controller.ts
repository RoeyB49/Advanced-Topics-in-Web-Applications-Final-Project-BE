import { Request, Response } from "express";
import Comment from "../models/comment.model";
import Post from "../models/post.model";
import { AuthRequest } from "../middleware/auth.middleware";

export const createComment = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const postId = req.params.postId || req.body.postId;
    const text = req.body.text;
    const author = req.user?._id;

    if (!author) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    if (!postId || !text) {
      res.status(400).json({ message: "postId and text are required" });
      return;
    }

    const postExists = await Post.exists({ _id: postId });
    if (!postExists) {
      res.status(404).json({ message: "Post not found" });
      return;
    }

    const comment = await Comment.create({
      post: postId,
      author,
      text,
    });

    const populatedComment = await Comment.findById(comment._id)
      .populate("author", "username")
      .populate("post", "text");

    res.status(201).json(populatedComment);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export const getCommentsByPostId = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const postId = req.params.postId || (req.query.postId as string);
    if (!postId) {
      res.status(400).json({ message: "postId is required" });
      return;
    }

    const comments = await Comment.find({ post: postId })
      .populate("author", "username")
      .sort({ createdAt: -1 });

    res.status(200).json(comments);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const updateComment = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { text } = req.body;
    const comment = await Comment.findById(req.params.id);

    if (!comment) {
      res.status(404).json({ message: "Comment not found" });
      return;
    }

    if (comment.author.toString() !== req.user?._id.toString()) {
      res.status(403).json({ message: "Forbidden" });
      return;
    }

    if (text) {
      comment.text = text;
    }

    const updatedComment = await comment.save();
    res.status(200).json(updatedComment);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export const deleteComment = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const comment = await Comment.findById(req.params.id);

    if (!comment) {
      res.status(404).json({ message: "Comment not found" });
      return;
    }

    if (comment.author.toString() !== req.user?._id.toString()) {
      res.status(403).json({ message: "Forbidden" });
      return;
    }

    await comment.deleteOne();
    res.status(200).json({ message: "Comment deleted" });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
