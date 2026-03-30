import mongoose, { Document, Schema } from "mongoose";

export interface IPost extends Document {
  text: string;
  imageUrl?: string;
  author: mongoose.Types.ObjectId;
  likes: mongoose.Types.ObjectId[];
  tags: string[];
}

const postSchema = new Schema<IPost>(
  {
    text: {
      type: String,
      required: true,
    },
    imageUrl: {
      type: String,
    },
    author: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    likes: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    tags: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

const Post = mongoose.model<IPost>("Post", postSchema);

export default Post;
