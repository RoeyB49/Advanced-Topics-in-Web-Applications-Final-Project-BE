import fs from "fs";
import multer from "multer";
import path from "path";

const createStorage = (folder: "posts" | "profiles") =>
  multer.diskStorage({
    destination: (_req, _file, cb) => {
      const uploadDir = path.resolve(process.cwd(), "uploads", folder);
      fs.mkdirSync(uploadDir, { recursive: true });
      cb(null, uploadDir);
    },
    filename: (_req, file, cb) => {
      const safeName = file.originalname.replace(/\s+/g, "-");
      cb(null, `${Date.now()}-${safeName}`);
    },
  });

export const uploadPostImage = multer({ storage: createStorage("posts") });
export const uploadProfileImage = multer({ storage: createStorage("profiles") });
