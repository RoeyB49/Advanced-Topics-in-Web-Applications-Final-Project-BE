const express = require("express");
const router = express.Router();
const commentsController = require("../controllers/comments_controller");

router.get("/", commentsController.getAllComments);
router.delete("/:id", commentsController.deleteComment);
router.post("/", commentsController.createComment);
router.put("/:id", commentsController.updateComment);
router.get("/posts/:postId", commentsController.getCommentsByPostId);
router.get("/:id", commentsController.getCommentById);

module.exports = router;
