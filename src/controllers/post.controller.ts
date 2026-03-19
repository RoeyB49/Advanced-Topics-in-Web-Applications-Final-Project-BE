import { Request, Response } from "express";
import Post from "../models/post.model";
import { AuthRequest } from "../middleware/auth.middleware";

export const getAllPosts = async (req: Request, res: Response): Promise<void> => {
  const senderFilter = req.query.sender as string;
  try {
    const filter: any = {};
    if (senderFilter) {
      filter.sender = senderFilter;
    }
    const posts = await Post.find(filter).populate('sender', 'username email');
    res.status(200).json(posts);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export const createPost = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { title, content } = req.body;
    const sender = req.user?._id;
    
    if (!sender) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const post = await Post.create({ 
      title, 
      content, 
      sender 
    });
    
    const populatedPost = await Post.findById(post._id).populate('sender', 'username email');
    res.status(201).json(populatedPost);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export const deletePost = async (req: Request, res: Response): Promise<void> => {
  const postId = req.params.id;
  try {
    const post = await Post.findByIdAndDelete(postId);
    if (!post) {
      res.status(404).json({ message: "Post not found" });
      return;
    }
    res.status(200).json({ message: `Post with ID ${postId} deleted successfully` });
  } catch (error: any) {
    res.status(500).json({ message: "Error deleting post", error: error.message });
  }
};

export const getPostById = async (req: Request, res: Response): Promise<void> => {
  const postId = req.params.id;
  try {
    const post = await Post.findById(postId).populate('sender', 'username email');
    if (!post) {
      res.status(404).json({ message: "Post not found" });
      return;
    }
    res.status(200).json(post);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export const updatePost = async (req: Request, res: Response): Promise<void> => {
  const postId = req.params.id;
  const postData = req.body;

  try {
    const post = await Post.findByIdAndUpdate(postId, postData, {
      new: true,
      runValidators: true
    }).populate('sender', 'username email');
    
    if (!post) {
      res.status(404).json({ message: "Post not found" });
      return;
    }
    res.status(200).json(post);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};
