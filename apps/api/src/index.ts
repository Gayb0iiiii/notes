import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import csrf from "@fastify/csrf-protection";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { config, isProduction } from "./config";
import { authRoutes } from "./routes/auth";
import { userRoutes } from "./routes/users";
import { workspaceRoutes } from "./routes/workspaces";
import { pageRoutes } from "./routes/pages";
import { syncRoutes } from "./routes/sync";
import { assetRoutes } from "./routes/assets";
import { backlinkRoutes } from "./routes/backlinks";
import { importRoutes } from "./routes/imports";

const app = Fastify({ logger: true });
const nativeOrigins = config.NATIVE_APP_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean);
const allowedOrigins = new Set([
  config.APP_URL,
  "capacitor://localhost",
  "ionic://localhost",
  "http://localhost",
  "http://localhost:5173",
  ...nativeOrigins
]);

await app.register(cors, {
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin) || /^https?:\/\/localhost(?::\d+)?$/.test(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`Origin not allowed: ${origin}`), false);
  },
  credentials: true
});
await app.register(cookie, { secret: config.SESSION_SECRET });
await app.register(csrf, { cookieOpts: { sameSite: "lax", secure: isProduction } });
await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });

app.get("/health", async () => ({ ok: true }));
await app.register(authRoutes, { prefix: "/api/auth" });
await app.register(userRoutes, { prefix: "/api/users" });
await app.register(workspaceRoutes, { prefix: "/api/workspaces" });
await app.register(pageRoutes, { prefix: "/api" });
await app.register(syncRoutes, { prefix: "/api/sync" });
await app.register(assetRoutes, { prefix: "/api/assets" });
await app.register(backlinkRoutes, { prefix: "/api/pages" });
await app.register(importRoutes, { prefix: "/api/imports" });

await app.listen({ host: "0.0.0.0", port: config.PORT });
