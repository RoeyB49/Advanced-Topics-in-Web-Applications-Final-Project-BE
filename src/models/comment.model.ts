import mongoose, { Document, Schema } from "mongoose";

export interface IComment extends Document {
  postId: mongoose.Types.ObjectId;
  sender: mongoose.Types.ObjectId;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

const commentSchema = new Schema<IComment>(
  {
    postId: {
      type: Schema.Types.ObjectId,
      ref: "Post",
      required: true,
    },
    sender: { 
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true 
    },
    content: { 
      type: String, 
      required: true 
    },
  },
  { timestamps: true }
);

const Comment = mongoose.model<IComment>("Comment", commentSchema);

export default Comment;
