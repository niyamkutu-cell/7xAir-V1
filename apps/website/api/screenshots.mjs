import crypto from "node:crypto";
import { loadScreenshots, saveScreenshots, verifySessionToken } from "./_store.mjs";
import {
  isSupabaseConfigured,
  supabaseGetUserFromToken,
  supabaseListScreenshots,
  supabaseUploadScreenshot,
} from "./_supabase.mjs";

const ALLOWED_THEMES = new Set([
  "azure-mountains",
  "emerald-wilderness",
  "midnight-forest",
  "dreamy-anime",
  "sunset-horizon",
  "frozen-peaks",
  "sakura-valley",
]);

function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

function extractBearer(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || "";
  if (typeof header === "string" && header.startsWith("Bearer ")) {
    return header.slice(7).trim();
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    if (isSupabaseConfigured()) {
      const remote = await supabaseListScreenshots();
      return sendJson(res, 200, { screenshots: remote });
    }
    return sendJson(res, 200, { screenshots: loadScreenshots() });
  }

  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  const token = extractBearer(req);
  const session = isSupabaseConfigured()
    ? await supabaseGetUserFromToken(token)
    : verifySessionToken(token);

  if (!session) {
    return sendJson(res, 401, { error: "Please log in to upload a showcase screenshot." });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return sendJson(res, 400, { error: "Invalid JSON body" });
    }
  }
  body = body || {};

  const title = String(body.title || "").trim();
  const caption = String(body.caption || "").trim();
  const mcVersion = String(body.mcVersion || "1.21.11").trim();
  const theme = ALLOWED_THEMES.has(body.theme) ? body.theme : "azure-mountains";
  const imageDataUrl = String(body.imageDataUrl || "").trim();

  if (title.length < 3 || title.length > 72) {
    return sendJson(res, 400, { error: "Title must be 3–72 characters." });
  }
  if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(imageDataUrl)) {
    return sendJson(res, 400, {
      error: "Image must be a valid PNG, JPEG, or WebP upload.",
    });
  }
  if (imageDataUrl.length > 2_800_000) {
    return sendJson(res, 413, { error: "Screenshot exceeds 2 MB upload limit." });
  }

  if (isSupabaseConfigured()) {
    try {
      const saved = await supabaseUploadScreenshot({
        userId: session.id,
        authorUsername: session.username,
        title,
        caption: caption.slice(0, 240),
        mcVersion: mcVersion === "26.2" ? "26.2" : "1.21.11",
        theme,
        imageDataUrl,
      });
      return sendJson(res, 201, { screenshot: saved });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  const item = {
    id: crypto.randomUUID(),
    title,
    caption: caption.slice(0, 240),
    mcVersion: mcVersion === "26.2" ? "26.2" : "1.21.11",
    theme,
    author: session.username,
    imageDataUrl,
    createdAt: new Date().toISOString(),
  };

  const items = loadScreenshots();
  items.unshift(item);
  saveScreenshots(items.slice(0, 60));

  return sendJson(res, 201, { screenshot: item });
}
