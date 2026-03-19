import mongoose, { Document, Schema, Types } from "mongoose";

export interface IUser extends Document {
  _id: Types.ObjectId;
  username: string;
  email: string;
  password?: string;
  profileImage?: string;
  provider?: "local" | "google" | "facebook";
  providerId?: string;
  refreshTokens: string[];
}

const userSchema = new Schema<IUser>(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email']
    },
    password: {
      type: String,
      minlength: 6
    },
    profileImage: {
      type: String,
      default: ""
    },
    provider: {
      type: String,
      enum: ["local", "google", "facebook"],
      default: "local"
    },
    providerId: {
      type: String,
      default: ""
    },
    refreshTokens: {
      type: [String],
      default: []
    }
  },
  { timestamps: true }
);

const User = mongoose.model<IUser>("User", userSchema);

export default User;
