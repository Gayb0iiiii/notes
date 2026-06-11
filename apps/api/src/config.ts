import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  APP_URL: z.string().url().default("http://localhost:5173"),
  NATIVE_APP_ORIGINS: z.string().default("capacitor://localhost,ionic://localhost"),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z
    .string()
    .min(32)
    .refine(
      (s) => new Set(s).size > 8,
      "SESSION_SECRET appears too low-entropy — use a cryptographically random value (e.g. openssl rand -hex 32)"
    ),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(180),
  S3_ENDPOINT: z.string().url(),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1)
});

export const config = envSchema.parse(process.env);
export const isProduction = config.NODE_ENV === "production";
