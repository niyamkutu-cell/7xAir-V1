import {
  getReleaseMetadata,
  loadCustomReleases,
  loadScreenshots,
  loadUsers,
  saveCustomReleases,
  saveScreenshots,
  saveUsers,
  verifySessionToken,
} from "./_store.mjs";
import {
  isAdminEmail,
  isSupabaseConfigured,
  supabaseDeleteScreenshot,
  supabaseGetUserFromToken,
  supabasePublishRelease,
  supabaseSetUserRole,
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

async function requireAdmin(req, res) {
  const token = extractBearer(req);
  if (!token) {
    sendJson(res, 401, { error: "Authentication required." });
    return null;
  }

  let user = null;
  if (isSupabaseConfigured()) {
    user = await supabaseGetUserFromToken(token);
  } else {
    const payload = verifySessionToken(token);
    if (payload) {
      const users = loadUsers();
      const found = users.find((u) => u.id === payload.sub);
      if (found) {
        user = {
          id: found.id,
          username: found.username,
          email: found.email,
          role: found.role || (isAdminEmail(found.email) ? "admin" : "user"),
        };
      }
    }
  }

  if (!user) {
    sendJson(res, 401, { error: "Invalid or expired session." });
    return null;
  }
  if (user.role !== "admin") {
    sendJson(res, 403, { error: "Admin permissions required." });
    return null;
  }
  return user;
}

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  if (req.method === "GET") {
    const users = loadUsers().map((u) => ({
      id: u.id,
      username: u.username,
      email: u.email,
      role: u.role || (isAdminEmail(u.email) ? "admin" : "user"),
    }));
    return sendJson(res, 200, {
      admin: { id: admin.id, username: admin.username, role: admin.role },
      backend: isSupabaseConfigured() ? "supabase" : "local-store",
      users,
      screenshots: loadScreenshots(),
      releases: getReleaseMetadata(),
    });
  }

  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed" });
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

  if (body.action === "delete_screenshot") {
    const id = String(body.screenshotId || "").trim();
    if (!id) return sendJson(res, 400, { error: "screenshotId required" });

    if (isSupabaseConfigured()) {
      await supabaseDeleteScreenshot(id);
    } else {
      const remaining = loadScreenshots().filter((s) => s.id !== id);
      saveScreenshots(remaining);
    }
    return sendJson(res, 200, { deleted: id });
  }

  if (body.action === "publish_release") {
    const version = String(body.version || "").trim();
    const channel = body.channel === "beta" ? "beta" : "stable";
    const installerUrl = String(body.windowsInstallerUrl || "").trim();
    const sha256 = String(body.windowsInstallerSha256 || "").trim();
    const releaseNotes = String(body.releaseNotes || "").trim();
    const highlights = Array.isArray(body.highlights) ? body.highlights : [];

    if (!/^\d+\.\d+\.\d+$/.test(version)) {
      return sendJson(res, 400, { error: "Version must follow SemVer (e.g. 0.2.0)." });
    }
    if (!installerUrl.toLowerCase().endsWith(".exe") || /\.jar/i.test(installerUrl)) {
      return sendJson(res, 400, {
        error: "Release asset must be a Windows .exe installer; separate .jar downloads are forbidden.",
      });
    }
    if (!/^[a-fA-F0-9]{64}$/.test(sha256)) {
      return sendJson(res, 400, { error: "windowsInstallerSha256 must be a 64-char hex SHA-256." });
    }

    const record = {
      version,
      channel,
      published_at: new Date().toISOString(),
      release_notes: releaseNotes,
      highlights,
      windows_installer_url: installerUrl,
      windows_installer_sha256: sha256.toLowerCase(),
      windows_installer_size: Number(body.windowsInstallerSize || 0),
      is_latest: channel === "stable",
    };

    if (isSupabaseConfigured()) {
      const saved = await supabasePublishRelease(record);
      return sendJson(res, 201, { release: saved });
    }

    const custom = loadCustomReleases();
    custom.unshift(record);
    saveCustomReleases(custom);
    return sendJson(res, 201, { release: record });
  }

  if (body.action === "set_user_role") {
    const userId = String(body.userId || "").trim();
    const role = body.role === "admin" ? "admin" : "user";
    if (!userId) return sendJson(res, 400, { error: "userId required" });

    if (isSupabaseConfigured()) {
      const updated = await supabaseSetUserRole(userId, role);
      return sendJson(res, 200, { user: updated });
    }

    const users = loadUsers();
    const target = users.find((u) => u.id === userId);
    if (!target) return sendJson(res, 404, { error: "User not found" });
    target.role = role;
    saveUsers(users);
    return sendJson(res, 200, {
      user: { id: target.id, username: target.username, email: target.email, role: target.role },
    });
  }

  return sendJson(res, 400, { error: "Unknown admin action." });
}
