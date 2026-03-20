import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const connectDB = async () => {
  try {
    const localUri = process.env.MONGO_URI;
    const atlasUri = process.env.MONGODB_URI;
    const mongoUri = atlasUri || localUri;
    if (!mongoUri) {
      console.error("MONGO_URI or MONGODB_URI not found in environment variables");
      process.exit(1);
    }
    if (localUri && atlasUri) {
      console.warn(
        "Both MONGO_URI and MONGODB_URI are set. Using MONGODB_URI and ignoring MONGO_URI."
      );
    }
    await mongoose.connect(mongoUri);
    const { host, name } = mongoose.connection;
    console.log(`MongoDB connected (host=${host}, db=${name})`);
  } catch (error) {
    console.error("MongoDB connection error:", error);
    process.exit(1);
  }
};

export default connectDB;
