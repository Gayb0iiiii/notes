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

const app = Fastify({ logger: true });

await app.register(cors, { origin: config.APP_URL, credentials: true });
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

await app.listen({ host: "0.0.0.0", port: config.PORT });
