import dotenv from "dotenv";
import express, { Express } from "express";
import bodyParser from "body-parser";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import connectDB from "./database/db";
import postRoutes from "./routes/post.routes";
import commentRoutes from "./routes/comment.routes";
import authRoutes from "./routes/auth.routes";
import userRoutes from "./routes/user.routes";

// Load environment variables
dotenv.config({ path: ".env.dev" });

const app: Express = express();

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Swagger configuration
const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Advanced Topics in Web Applications - API Documentation",
      version: "2.0.0",
      description: "REST API with TypeScript, JWT Authentication, and full CRUD operations",
      contact: {
        name: "API Support",
      },
    },
    servers: [
      {
        url: `http://localhost:${process.env.PORT || 3000}`,
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
  apis: ["./src/routes/*.ts"],
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// Routes
app.use("/post", postRoutes);
app.use("/comment", commentRoutes);
app.use("/auth", authRoutes);
app.use("/user", userRoutes);

// Health check endpoint
app.get("/", (req, res) => {
  res.json({ 
    message: "Advanced Topics in Web Applications - API is running",
    version: "2.0.0",
    documentation: `/api-docs`
  });
});

if (process.env.NODE_ENV !== "test") {
  connectDB();
}

if (process.env.NODE_ENV !== "test") {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Swagger documentation available at http://localhost:${PORT}/api-docs`);
  });
}

export { app };
