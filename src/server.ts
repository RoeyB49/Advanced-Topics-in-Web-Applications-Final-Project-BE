import "dotenv/config";
import fs from "fs";
import http from "http";
import https from "https";
import connectDB from "./config/db";
import { app } from "./app";

const startServer = async () => {
  await connectDB();

  const isProd = process.env.NODE_ENV === "production";
  const host = process.env.HOST || "0.0.0.0";
  const port = Number(process.env.PORT || 3001);

  const hasAccessSecret = Boolean(process.env.ACCESS_TOKEN_SECRET);
  const hasRefreshSecret = Boolean(process.env.REFRESH_TOKEN_SECRET);

  if (!isProd) {
    http.createServer(app).listen(port, host, () => {
      console.log("development");
      console.log(`HTTP server running on http://${host}:${port}`);
      console.log(
        `Auth secrets loaded: access=${hasAccessSecret ? "yes" : "no"}, refresh=${hasRefreshSecret ? "yes" : "no"}`
      );
      console.log(`Swagger documentation available at http://${host}:${port}/api-docs`);
    });
    return;
  }

  const httpsPort = Number(process.env.HTTPS_PORT || 3443);
  const keyPath = process.env.SSL_KEY_PATH;
  const certPath = process.env.SSL_CERT_PATH;

  if (!keyPath || !certPath) {
    throw new Error("SSL_KEY_PATH and SSL_CERT_PATH must be set in production.");
  }

  if (!fs.existsSync(keyPath)) {
    throw new Error(`SSL key file not found: ${keyPath}`);
  }

  if (!fs.existsSync(certPath)) {
    throw new Error(`SSL cert file not found: ${certPath}`);
  }

  const options = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
  };

  https.createServer(options, app).listen(httpsPort, host, () => {
    console.log("PRODUCTION");
    console.log(`HTTPS server running on https://${host}:${httpsPort}`);
    console.log(
      `Auth secrets loaded: access=${hasAccessSecret ? "yes" : "no"}, refresh=${hasRefreshSecret ? "yes" : "no"}`
    );
    console.log(`Swagger documentation available at https://${host}:${httpsPort}/api-docs`);
  });
};

if (process.env.NODE_ENV !== "test") {
  startServer().catch((error) => {
    console.error("Server startup failed:", error);
    process.exit(1);
  });
}
