import { Readable } from "node:stream";
import { getReleaseMetadata, verifySessionToken } from "./_store.mjs";
import {
  isSupabaseConfigured,
  supabaseGetUserFromToken,
  supabaseListReleases,
} from "./_supabase.mjs";

const DEFAULT_GITHUB_REPO = process.env.SEVENXAIR_GITHUB_REPO || "niyamkutu-cell/7xAir-V1";

function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

function getQueryParam(req, key) {
  try {
    const u = new URL(req.url || "/", "http://localhost");
    return u.searchParams.get(key);
  } catch {
    return null;
  }
}

function extractToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || "";
  if (typeof header === "string" && header.startsWith("Bearer ")) {
    return header.slice(7).trim();
  }
  const qToken = getQueryParam(req, "token");
  if (qToken && qToken.trim()) {
    return qToken.trim();
  }
  return null;
}

async function resolveLatestExeAsset(fallbackMeta) {
  try {
    const headers = {
      Accept: "application/vnd.github+json",
      "User-Agent": "7xAir-Website/0.1.0",
    };
    if (process.env.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }
    const resp = await fetch(
      `https://api.github.com/repos/${DEFAULT_GITHUB_REPO}/releases/latest`,
      { headers }
    );
    if (resp.ok) {
      const release = await resp.json();
      const assets = Array.isArray(release.assets) ? release.assets : [];
      const exe = assets.find(
        (a) =>
          typeof a?.name === "string" &&
          a.name.toLowerCase().endsWith(".exe") &&
          !a.name.toLowerCase().endsWith(".jar") &&
          typeof a.browser_download_url === "string"
      );
      if (exe) {
        return {
          url: exe.browser_download_url,
          filename: exe.name,
          version:
            typeof release.tag_name === "string"
              ? release.tag_name.replace(/^v/i, "")
              : fallbackMeta.latestVersion,
        };
      }
    }
  } catch {
    // Fall back to release metadata URL
  }

  return {
    url: fallbackMeta.windowsDownload?.url || null,
    filename: fallbackMeta.windowsDownload?.filename || `7xAir-Setup-${fallbackMeta.latestVersion}.exe`,
    version: fallbackMeta.latestVersion,
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  const token = extractToken(req);
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

  // Stream the Windows .exe directly from the 7xAir website so users never leave the site
  // and never see any third-party repository URL or username.
  if (getQueryParam(req, "stream") === "1") {
    const asset = await resolveLatestExeAsset(meta);
    if (!asset.url || asset.url.toLowerCase().endsWith(".jar")) {
      return sendJson(res, 404, {
        error: "Windows installer is not published yet. Please try again shortly.",
      });
    }

    try {
      const upstream = await fetch(asset.url, {
        redirect: "follow",
        headers: { "User-Agent": "7xAir-Website/0.1.0" },
      });
      if (!upstream.ok || !upstream.body) {
        return sendJson(res, 502, {
          error: "Installer file is currently unavailable. Please try again in a moment.",
        });
      }

      const safeFilename = `7xAir-Setup-${asset.version}.exe`;
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}"`);
      res.setHeader("Cache-Control", "private, no-store");
      const contentLen = upstream.headers.get("content-length");
      if (contentLen) {
        res.setHeader("Content-Length", contentLen);
      }

      const nodeStream = Readable.fromWeb(upstream.body);
      nodeStream.on("error", () => {
        if (!res.writableEnded) res.end();
      });
      nodeStream.pipe(res);
      return;
    } catch {
      return sendJson(res, 502, {
        error: "Unable to stream the Windows installer right now. Please try again.",
      });
    }
  }

  return sendJson(res, 200, {
    authorized: true,
    user: user.username,
    version: meta.latestVersion,
    channel: meta.channel,
    filename: dl.filename,
    sha256: dl.sha256,
    downloadUrl: `/api/download?stream=1&token=${encodeURIComponent(token)}&file=${encodeURIComponent(dl.filename)}`,
  });
}
