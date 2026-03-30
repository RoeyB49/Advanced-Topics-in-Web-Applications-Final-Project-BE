import { Request, Response } from "express";
import Post from "../models/post.model";
import { AuthRequest } from "../middleware/auth.middleware";
import { searchPosts as searchPostsWithAI } from "../services/ai.service";
import { searchPostsWithInsights } from "../services/ai.service";
import Comment from "../models/comment.model";

const readRawTagsFromBody = (body: Record<string, unknown>): unknown => {
  if (Object.prototype.hasOwnProperty.call(body, "tags")) {
    return body.tags;
  }

  if (Object.prototype.hasOwnProperty.call(body, "tags[]")) {
    return body["tags[]"];
  }

  return undefined;
};

const extractTagTokens = (value: unknown): string[] => {
  if (value === undefined || value === null) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap(extractTagTokens);
  }

  const raw = String(value).trim();
  if (!raw) {
    return [];
  }

  if (raw.startsWith("[") && raw.endsWith("]")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.flatMap(extractTagTokens);
      }
    } catch {
      // Fall back to comma-separated parsing when not valid JSON.
    }
  }

  return raw.split(",");
};

const normalizeTagsInput = (rawTags: unknown): string[] => {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const token of extractTagTokens(rawTags)) {
    const tag = String(token).trim().toLowerCase();
    if (!tag || seen.has(tag)) {
      continue;
    }

    seen.add(tag);
    normalized.push(tag);
  }

  return normalized;
};

const normalizeTagsOutput = (rawTags: unknown): string[] => {
  if (!Array.isArray(rawTags)) {
    return [];
  }

  return rawTags
    .map((tag) => String(tag).trim())
    .filter((tag) => tag.length > 0);
};

const toPostResponse = (post: any) => {
  const base = post?.toObject ? post.toObject() : post;
  return {
    ...base,
    tags: normalizeTagsOutput(base?.tags),
  };
};

/**
 * @swagger
 * /api/posts:
 *   get:
 *     summary: Get all posts
 *     tags: [Posts]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: The page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: The number of posts per page
 *     responses:
 *       200:
 *         description: A list of posts
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Post'
 */
export const getAllPosts = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;
    const author = req.query.author as string | undefined;

    const filter: Record<string, string> = {};
    if (author) {
      filter.author = author;
    }

    const posts = await Post.find(filter)
      .populate("author", "username profileImage")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const postsWithCounts = await Promise.all(
      posts.map(async (post) => {
        const commentsCount = await Comment.countDocuments({ post: post._id });
        return {
          ...toPostResponse(post),
          commentsCount,
          likesCount: post.likes.length
        };
      })
    );

    const totalPosts = await Post.countDocuments(filter);

    res.status(200).json({
      posts: postsWithCounts,
      totalPages: Math.ceil(totalPosts / limit),
      currentPage: page,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getMyPosts = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const posts = await Post.find({ author: userId })
      .populate("author", "username profileImage")
      .sort({ createdAt: -1 });

    const postsWithCounts = await Promise.all(
      posts.map(async (post) => {
        const commentsCount = await Comment.countDocuments({ post: post._id });
        return {
          ...toPostResponse(post),
          commentsCount,
          likesCount: post.likes.length
        };
      })
    );

    res.status(200).json(postsWithCounts);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * @swagger
 * /api/posts:
 *   post:
 *     summary: Create a new post
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               text:
 *                 type: string
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: The created post
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Post'
 */
export const createPost = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { text } = req.body;
    const tags = normalizeTagsInput(readRawTagsFromBody(req.body as Record<string, unknown>));
    const author = req.user?._id;

    if (!author) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const postData: any = { text, author, tags };
    if (req.file) {
      postData.imageUrl = `/uploads/posts/${req.file.filename}`;
    }

    const post = new Post(postData);
    await post.save();

    res.status(201).json(toPostResponse(post));
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

/**
 * @swagger
 * /api/posts/{id}:
 *   get:
 *     summary: Get a post by ID
 *     tags: [Posts]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: The post
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Post'
 *       404:
 *         description: Post not found
 */
export const getPostById = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const post = await Post.findById(req.params.id)
      .populate("author", "username profileImage");
    if (!post) {
      res.status(404).json({ message: "Post not found" });
      return;
    }
    res.status(200).json(toPostResponse(post));
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * @swagger
 * /api/posts/{id}:
 *   put:
 *     summary: Update a post
 *     tags: [Posts]
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
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               text:
 *                 type: string
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: The updated post
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Post'
 *       404:
 *         description: Post not found
 *       401:
 *         description: Unauthorized
 */
export const updatePost = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { text } = req.body;
    const hasTagsInPayload =
      Object.prototype.hasOwnProperty.call(req.body, "tags") ||
      Object.prototype.hasOwnProperty.call(req.body, "tags[]");
    const post = await Post.findById(req.params.id);

    if (!post) {
      res.status(404).json({ message: "Post not found" });
      return;
    }

    if (post.author.toString() !== req.user?._id.toString()) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    post.text = text || post.text;
    if (hasTagsInPayload) {
      post.tags = normalizeTagsInput(readRawTagsFromBody(req.body as Record<string, unknown>));
    }
    if (req.file) {
      post.imageUrl = `/uploads/posts/${req.file.filename}`;
    }

    const updatedPost = await post.save();
    res.status(200).json(toPostResponse(updatedPost));
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

/**
 * @swagger
 * /api/posts/{id}:
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
 *       401:
 *         description: Unauthorized
 */
export const deletePost = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      res.status(404).json({ message: "Post not found" });
      return;
    }

    if (post.author.toString() !== req.user?._id.toString()) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    await post.deleteOne();
    res.status(200).json({ message: "Post deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * @swagger
 * /api/posts/{id}/like:
 *   post:
 *     summary: Like or unlike a post
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
 *         description: The updated post with likes
 *       404:
 *         description: Post not found
 */
export const likePost = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const post = await Post.findById(req.params.id);
    const userId = req.user?._id;

    if (!post) {
      res.status(404).json({ message: "Post not found" });
      return;
    }

    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const likedIndex = post.likes.findIndex(
      (likeUserId) => likeUserId.toString() === userId.toString()
    );

    if (likedIndex === -1) {
      // Like the post
      post.likes.push(userId);
    } else {
      // Unlike the post
      post.likes.splice(likedIndex, 1);
    }

    await post.save();
    res.status(200).json(toPostResponse(post));
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * @swagger
 * /api/posts/search:
 *   get:
 *     summary: Search for posts using a natural language query
 *     tags: [Posts]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: The natural language search query
 *     responses:
 *       200:
 *         description: A list of posts that match the search query
 *       500:
 *         description: Internal server error
 */
export const searchPosts = async (req: Request, res: Response): Promise<void> => {
  try {
    const query = req.query.q as string;
    if (!query) {
      res.status(400).json({ message: "Search query is required" });
      return;
    }
    const posts = await searchPostsWithAI(query);
    res.status(200).json(posts.map((post: any) => toPostResponse(post)));
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * @swagger
 * /api/posts/search/intelligent:
 *   get:
 *     summary: Anime-aware intelligent search with AI query analysis and matching posts
 *     tags: [Posts]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Natural language query, for example "best dark anime like attack on titan"
 *     responses:
 *       200:
 *         description: Query analysis metadata and matching posts
 *       400:
 *         description: Search query is required
 *       500:
 *         description: Internal server error
 */
export const intelligentSearchPosts = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const query = req.query.q as string;
    if (!query) {
      res.status(400).json({ message: "Search query is required" });
      return;
    }

    const result = await searchPostsWithInsights(query);
    res.status(200).json({
      ...result,
      posts: result.posts.map((post: any) => toPostResponse(post)),
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
