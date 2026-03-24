import dotenv from "dotenv";
import express, { Express } from "express";
import cors from "cors";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import connectDB from "./config/db";
import postRoutes from "./routes/post.routes";
import commentRoutes from "./routes/comment.routes";
import authRoutes from "./routes/auth.routes";
import userRoutes from "./routes/user.routes";
import aiRoutes from "./routes/ai.routes";
import path from "path";

// Load environment variables
dotenv.config();

const app: Express = express();

// Middleware
app.use(
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
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
        url: `http://localhost:${process.env.PORT || 3001}`,
        description: "Development server",
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
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// Routes
app.use("/api/posts", postRoutes);
app.use("/api/posts/:postId/comments", commentRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/ai", aiRoutes);

// Health check endpoint
app.get("/", (req, res) => {
  res.json({
    message: "Advanced Topics in Web Applications - API is running",
    version: "1.0.0",
    documentation: `/api-docs`,
  });
});

if (process.env.NODE_ENV !== "test") {
  connectDB();
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    const hasAccessSecret = Boolean(process.env.ACCESS_TOKEN_SECRET);
    const hasRefreshSecret = Boolean(process.env.REFRESH_TOKEN_SECRET);

    console.log(`Server running on port ${PORT}`);
    console.log(
      `Auth secrets loaded: access=${hasAccessSecret ? "yes" : "no"}, refresh=${hasRefreshSecret ? "yes" : "no"}`
    );
    console.log(
      `Swagger documentation available at http://localhost:${PORT}/api-docs`
    );
  });
}

export { app };
