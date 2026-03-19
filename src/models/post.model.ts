import mongoose, { Document, Schema } from "mongoose";

export interface IPost extends Document {
  title: string;
  content: string;
  sender: mongoose.Types.ObjectId;
}

const postSchema = new Schema<IPost>({
  title: { 
    type: String, 
    required: true 
  },
  content: { 
    type: String 
  },
  sender: { 
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true 
  },
}, {
  timestamps: true
});

const Post = mongoose.model<IPost>("Post", postSchema);

export default Post;
