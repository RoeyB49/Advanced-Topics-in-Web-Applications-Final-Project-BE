import "dotenv/config";
import fs from "fs";
import http from "http";
import https from "https";
import connectDB from "./config/db";
import { app } from "./app";

const startServer = async () => {
  await connectDB();

  const isProd = process.env.NODE_ENV === "production";
  const port = Number(process.env.PORT || 3001);

  const hasAccessSecret = Boolean(process.env.ACCESS_TOKEN_SECRET);
  const hasRefreshSecret = Boolean(process.env.REFRESH_TOKEN_SECRET);

  if (!isProd) {
    http.createServer(app).listen(port, () => {
      console.log("development");
      console.log(`HTTP server running on http://localhost:${port}`);
      console.log(
        `Auth secrets loaded: access=${hasAccessSecret ? "yes" : "no"}, refresh=${hasRefreshSecret ? "yes" : "no"}`
      );
      console.log(`Swagger documentation available at http://localhost:${port}/api-docs`);
    });
    return;
  }

  const httpsPort = Number(process.env.HTTPS_PORT || 3443);
  const keyPath = process.env.SSL_KEY_PATH;
  const certPath = process.env.SSL_CERT_PATH;

  if (!keyPath || !certPath) {
    throw new Error("SSL_KEY_PATH and SSL_CERT_PATH must be set in production.");
  }

  const options = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
  };

  https.createServer(options, app).listen(httpsPort, () => {
    console.log("PRODUCTION");
    console.log(`HTTPS server running on https://localhost:${httpsPort}`);
    console.log(
      `Auth secrets loaded: access=${hasAccessSecret ? "yes" : "no"}, refresh=${hasRefreshSecret ? "yes" : "no"}`
    );
    console.log(`Swagger documentation available at https://localhost:${httpsPort}/api-docs`);
  });
};

if (process.env.NODE_ENV !== "test") {
  startServer().catch((error) => {
    console.error("Server startup failed:", error);
    process.exit(1);
  });
}
