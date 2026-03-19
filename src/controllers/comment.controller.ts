import { Request, Response } from "express";
import Comment from "../models/comment.model";
import { AuthRequest } from "../middleware/auth.middleware";

export const getAllComments = async (req: Request, res: Response): Promise<void> => {
  try {
    const filter: any = {};
    if (req.query.postId) {
      filter.postId = req.query.postId;
    }
    const comments = await Comment.find(filter)
      .populate('sender', 'username email')
      .populate('postId', 'title');
    res.status(200).json(comments);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getCommentsByPostId = async (req: Request, res: Response): Promise<void> => {
  try {
    const comments = await Comment.find({ postId: req.params.postId })
      .populate('sender', 'username email');
    res.status(200).json(comments);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const createComment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { postId, content } = req.body;
    const sender = req.user?._id;
    
    if (!sender) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const comment = await Comment.create({
      postId,
      sender,
      content,
    });

    const populatedComment = await Comment.findById(comment._id)
      .populate('sender', 'username email')
      .populate('postId', 'title');
      
    res.status(201).json(populatedComment);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export const updateComment = async (req: Request, res: Response): Promise<void> => {
  try {
    const updatedComment = await Comment.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('sender', 'username email');
    
    if (!updatedComment) {
      res.status(404).json({ message: "Comment not found" });
      return;
    }
    res.status(200).json(updatedComment);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export const getCommentById = async (req: Request, res: Response): Promise<void> => {
  try {
    const comment = await Comment.findById(req.params.id)
      .populate('sender', 'username email')
      .populate('postId', 'title');
      
    if (!comment) {
      res.status(404).json({ message: "Comment not found" });
      return;
    }
    res.status(200).json(comment);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteComment = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await Comment.findByIdAndDelete(req.params.id);
    if (!result) {
      res.status(404).json({ message: "Comment not found" });
      return;
    }
    res.status(200).json({ message: "Comment deleted" });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
