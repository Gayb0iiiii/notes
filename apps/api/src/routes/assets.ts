import crypto from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { validateImageUpload } from "@notes/shared";
import { config } from "../config";
import { requireAuth, requireWorkspaceRole } from "../auth/session";
import { db } from "../db/client";
import { assets } from "../db/schema";

const s3 = new S3Client({
  endpoint: config.S3_ENDPOINT,
  region: "us-east-1",
  forcePathStyle: true,
  credentials: { accessKeyId: config.S3_ACCESS_KEY, secretAccessKey: config.S3_SECRET_KEY }
});

export const assetRoutes: FastifyPluginAsync = async (app) => {
  app.post("/upload-url", async (request, reply) => {
    const auth = await requireAuth(request);
    const body = z
      .object({
        workspaceId: z.string().uuid(),
        filename: z.string().min(1).max(240),
        mimeType: z.string().min(1),
        sizeBytes: z.number().int().positive()
      })
      .parse(request.body);
    await requireWorkspaceRole(request, body.workspaceId);
    const validation = validateImageUpload(body);
    if (!validation.ok) return reply.code(400).send({ error: validation.reason });

    const [asset] = await db
      .insert(assets)
      .values({
        workspaceId: body.workspaceId,
        uploadedBy: auth.userId,
        storageKey: `${body.workspaceId}/${crypto.randomUUID()}-${body.filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`,
        originalFilename: body.filename,
        mimeType: body.mimeType,
        sizeBytes: body.sizeBytes,
        uploadStatus: "pending"
      })
      .returning();

    const uploadUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({ Bucket: config.S3_BUCKET, Key: asset.storageKey, ContentType: body.mimeType }),
      { expiresIn: 600 }
    );

    return { assetId: asset.id, uploadUrl, storageKey: asset.storageKey };
  });

  app.post("/complete", async (request) => {
    await requireAuth(request);
    const body = z.object({ assetId: z.string().uuid(), width: z.number().int().positive().optional(), height: z.number().int().positive().optional() }).parse(request.body);
    const [asset] = await db.select().from(assets).where(eq(assets.id, body.assetId)).limit(1);
    if (!asset) throw Object.assign(new Error("Not found"), { statusCode: 404 });
    await requireWorkspaceRole(request, asset.workspaceId);
    const [updated] = await db
      .update(assets)
      .set({ uploadStatus: "uploaded", width: body.width, height: body.height, updatedAt: new Date() })
      .where(eq(assets.id, body.assetId))
      .returning();
    return { asset: updated };
  });

  app.get("/:assetId", async (request) => {
    await requireAuth(request);
    const params = z.object({ assetId: z.string().uuid() }).parse(request.params);
    const [asset] = await db.select().from(assets).where(eq(assets.id, params.assetId)).limit(1);
    if (!asset) throw Object.assign(new Error("Not found"), { statusCode: 404 });
    await requireWorkspaceRole(request, asset.workspaceId);
    const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: config.S3_BUCKET, Key: asset.storageKey }), { expiresIn: 300 });
    return { asset, url };
  });

  app.delete("/:assetId", async (request) => {
    await requireAuth(request);
    const params = z.object({ assetId: z.string().uuid() }).parse(request.params);
    const [asset] = await db.select().from(assets).where(eq(assets.id, params.assetId)).limit(1);
    if (!asset) throw Object.assign(new Error("Not found"), { statusCode: 404 });
    const role = await requireWorkspaceRole(request, asset.workspaceId);
    if (role !== "owner") throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
    await db.update(assets).set({ uploadStatus: "failed", updatedAt: new Date() }).where(eq(assets.id, params.assetId));
    return { ok: true };
  });
};
