import { getReleaseMetadata, verifySessionToken } from "./_store.mjs";
import {
  isSupabaseConfigured,
  supabaseGetUserFromToken,
  supabaseListReleases,
} from "./_supabase.mjs";

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
  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  const token = extractBearer(req);
  if (!token) {
    return sendJson(res, 401, {
      error: "Authentication required. Sign in to your 7xAir account before downloading.",
    });
  }

  let user = null;
  if (isSupabaseConfigured()) {
    user = await supabaseGetUserFromToken(token);
  } else {
    const payload = verifySessionToken(token);
    if (payload) {
      user = {
        id: payload.sub,
        username: payload.username,
        email: payload.email,
      };
    }
  }

  if (!user) {
    return sendJson(res, 401, {
      error: "Invalid or expired session. Please sign in again to download 7xAir.",
    });
  }

  const external = isSupabaseConfigured() ? await supabaseListReleases() : null;
  const meta = getReleaseMetadata(external);
  const dl = meta.windowsDownload;

  if (!dl?.url || dl.url.toLowerCase().endsWith(".jar")) {
    return sendJson(res, 500, { error: "Invalid installer asset configuration." });
  }

  return sendJson(res, 200, {
    authorized: true,
    user: user.username,
    version: meta.latestVersion,
    channel: meta.channel,
    filename: dl.filename,
    sha256: dl.sha256,
    downloadUrl: dl.url,
  });
}
