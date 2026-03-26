import dotenv from "dotenv";
import express, { Express } from "express";
import cors from "cors";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import fs from "fs";
import postRoutes from "./routes/post.routes";
import commentRoutes from "./routes/comment.routes";
import authRoutes from "./routes/auth.routes";
import userRoutes from "./routes/user.routes";
import aiRoutes from "./routes/ai.routes";
import path from "path";

// Load environment variables
dotenv.config();

const app: Express = express();

const swaggerServerUrl = process.env.SWAGGER_SERVER_URL || "/";

const defaultOrigins = ["http://localhost:5173", "http://127.0.0.1:5173"];
const configuredOrigins = (process.env.FRONTEND_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedOrigins = configuredOrigins.length > 0 ? configuredOrigins : defaultOrigins;

// Middleware
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files for uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Swagger configuration
const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Advanced Topics in Web Applications - Final Project API",
      version: "1.0.0",
      description: "API documentation for the final project",
    },
    servers: [
      {
        url: swaggerServerUrl,
        description: "Current server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
  },
  apis: ["./src/routes/*.ts", "./src/controllers/*.ts"],
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);

app.get("/api-docs.json", (req, res) => {
  const configuredUrl = process.env.SWAGGER_SERVER_URL?.trim();
  const forwardedProto = req.header("x-forwarded-proto")?.split(",")[0].trim();
  const protocol = forwardedProto || req.protocol;
  const host = req.get("host");
  const requestBasedUrl = host ? `${protocol}://${host}` : "/";
  const resolvedUrl = configuredUrl || requestBasedUrl;

  res.json({
    ...swaggerDocs,
    servers: [
      {
        url: resolvedUrl,
        description: configuredUrl ? "Configured server" : "Current server",
      },
    ],
  });
});

app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(undefined, {
    swaggerOptions: {
      url: "/api-docs.json",
    },
  })
);

// Routes
app.use("/api/posts", postRoutes);
app.use("/api/posts/:postId/comments", commentRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/ai", aiRoutes);

const publicDir = path.resolve(__dirname, "../public");
const publicIndexPath = path.join(publicDir, "index.html");
const hasFrontendBuild = fs.existsSync(publicIndexPath);

if (hasFrontendBuild) {
  app.use(express.static(publicDir));

  app.get(/^\/(?!api(?:\/|$)|api-docs(?:\/|$)|uploads(?:\/|$)).*/, (req, res) => {
    res.sendFile(publicIndexPath);
  });
}

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    message: "Advanced Topics in Web Applications - API is running",
    version: "1.0.0",
    documentation: `/api-docs`,
    frontendServed: hasFrontendBuild,
  });
});

if (process.env.NODE_ENV !== "test") {
  // Server startup is handled in src/server.ts.
}

export { app };
