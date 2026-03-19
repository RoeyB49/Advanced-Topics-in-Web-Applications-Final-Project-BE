// commentsController.js
const Comment = require("../models/comments_model");

const getAllComments = async (req, res) => {
  try {
    const filter = {};
    if (req.query.postId) {
      filter.postId = req.query.postId;
    }
    const comments = await Comment.find(filter);
    res.json(comments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getCommentsByPostId = async (req, res) => {
  try {
    const comments = await Comment.find({ postId: req.params.postId });
    res.json(comments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createComment = async (req, res) => {
  const comment = new Comment({
    postId: req.body.postId,
    sender: req.body.sender,
    content: req.body.content,
  });

  try {
    const newComment = await comment.save();
    res.status(201).json(newComment);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const updateComment = async (req, res) => {
  try {
    const updatedComment = await Comment.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    if (!updatedComment) {
      return res.status(404).json({ message: "Comment not found" });
    }
    res.json(updatedComment);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const getCommentById = async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id);
    if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }
    res.json(comment);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteComment = async (req, res) => {
  try {
    const result = await Comment.findByIdAndDelete(req.params.id);
    if (!result) {
      return res.status(404).json({ message: "Comment not found" });
    }
    res.status(200).json({ message: "Comment deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getAllComments,
  getCommentsByPostId,
  deleteComment,
  updateComment,
  createComment,
  getCommentById,
};
