/**
 * Zero-dependency Supabase REST, Auth, and Storage client for Vercel Serverless Functions.
 * Automatically activates when SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set;
 * otherwise callers cleanly fall back to the local JSON store for offline dev/testing.
 */

export function isSupabaseConfigured() {
  return Boolean(
    process.env.SUPABASE_URL &&
      process.env.SUPABASE_ANON_KEY &&
      process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function baseUrl() {
  return String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
}

function serviceHeaders(extra = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

function anonHeaders(extra = {}) {
  const key = process.env.SUPABASE_ANON_KEY;
  return {
    apikey: key,
    "Content-Type": "application/json",
    ...extra,
  };
}

export function isAdminEmail(email) {
  const list = String(process.env.SEVENXAIR_ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(String(email || "").trim().toLowerCase());
}

export async function supabaseSignup({ email, password, username }) {
  const resp = await fetch(`${baseUrl()}/auth/v1/signup`, {
    method: "POST",
    headers: anonHeaders(),
    body: JSON.stringify({ email, password, data: { username } }),
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data.msg || data.error_description || "Supabase signup failed");
  }
  const userId = data.user?.id || data.id;
  const role = isAdminEmail(email) ? "admin" : "user";

  if (userId) {
    await fetch(`${baseUrl()}/rest/v1/profiles`, {
      method: "POST",
      headers: serviceHeaders({ Prefer: "resolution=merge-duplicates" }),
      body: JSON.stringify({ id: userId, username, email, role }),
    });
  }

  return {
    token: data.access_token || null,
    user: { id: userId, username, email, role },
  };
}

export async function supabaseLogin({ email, password }) {
  const resp = await fetch(`${baseUrl()}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: anonHeaders(),
    body: JSON.stringify({ email, password }),
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data.error_description || data.msg || "Invalid credentials");
  }

  const userId = data.user?.id;
  const profile = await supabaseGetProfile(userId);
  const role = profile?.role || (isAdminEmail(email) ? "admin" : "user");
  const username = profile?.username || data.user?.user_metadata?.username || email.split("@")[0];

  return {
    token: data.access_token,
    user: { id: userId, username, email, role },
  };
}

export async function supabaseGetUserFromToken(token) {
  if (!token) return null;
  const resp = await fetch(`${baseUrl()}/auth/v1/user`, {
    headers: anonHeaders({ Authorization: `Bearer ${token}` }),
  });
  if (!resp.ok) return null;
  const user = await resp.json();
  const profile = await supabaseGetProfile(user.id);
  return {
    id: user.id,
    email: user.email,
    username: profile?.username || user.user_metadata?.username || "Player",
    role: profile?.role || (isAdminEmail(user.email) ? "admin" : "user"),
  };
}

export async function supabaseGetProfile(userId) {
  if (!userId) return null;
  const resp = await fetch(
    `${baseUrl()}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=*`,
    { headers: serviceHeaders() }
  );
  if (!resp.ok) return null;
  const rows = await resp.json();
  return rows[0] || null;
}

export async function supabaseUploadScreenshot({
  userId,
  authorUsername,
  title,
  caption,
  mcVersion,
  theme,
  imageDataUrl,
}) {
  const match = imageDataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
  if (!match) throw new Error("Unsupported image format");
  const contentType = match[1];
  const ext = contentType === "image/jpeg" ? "jpg" : contentType.split("/")[1];
  const bytes = Buffer.from(match[2], "base64");
  const objectPath = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const uploadResp = await fetch(`${baseUrl()}/storage/v1/object/screenshots/${objectPath}`, {
    method: "POST",
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": contentType,
      "x-upsert": "false",
    },
    body: bytes,
  });
  if (!uploadResp.ok) {
    throw new Error(`Supabase Storage upload failed (${uploadResp.status})`);
  }

  const publicUrl = `${baseUrl()}/storage/v1/object/public/screenshots/${objectPath}`;
  const insertResp = await fetch(`${baseUrl()}/rest/v1/screenshots`, {
    method: "POST",
    headers: serviceHeaders({ Prefer: "return=representation" }),
    body: JSON.stringify({
      user_id: userId,
      author_username: authorUsername,
      title,
      caption,
      mc_version: mcVersion,
      theme,
      storage_path: objectPath,
      public_url: publicUrl,
      approved: true,
    }),
  });
  const rows = await insertResp.json();
  if (!insertResp.ok) throw new Error("Failed to save screenshot metadata");
  return rows[0];
}

export async function supabaseListScreenshots() {
  const resp = await fetch(
    `${baseUrl()}/rest/v1/screenshots?approved=eq.true&order=created_at.desc&limit=60`,
    { headers: serviceHeaders() }
  );
  if (!resp.ok) return [];
  const rows = await resp.json();
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    caption: r.caption,
    mcVersion: r.mc_version,
    theme: r.theme,
    author: r.author_username,
    imageDataUrl: r.public_url,
    storagePath: r.storage_path,
    createdAt: r.created_at,
  }));
}

export async function supabaseDeleteScreenshot(id) {
  const lookup = await fetch(
    `${baseUrl()}/rest/v1/screenshots?id=eq.${encodeURIComponent(id)}&select=storage_path`,
    { headers: serviceHeaders() }
  );
  const rows = lookup.ok ? await lookup.json() : [];
  const storagePath = rows[0]?.storage_path;
  if (storagePath) {
    await fetch(`${baseUrl()}/storage/v1/object/screenshots/${storagePath}`, {
      method: "DELETE",
      headers: serviceHeaders(),
    });
  }
  await fetch(`${baseUrl()}/rest/v1/screenshots?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: serviceHeaders(),
  });
}

export async function supabaseListReleases() {
  const resp = await fetch(
    `${baseUrl()}/rest/v1/releases?order=published_at.desc&limit=20`,
    { headers: serviceHeaders() }
  );
  if (!resp.ok) return [];
  return resp.json();
}

export async function supabasePublishRelease(release) {
  const resp = await fetch(`${baseUrl()}/rest/v1/releases`, {
    method: "POST",
    headers: serviceHeaders({ Prefer: "resolution=merge-duplicates,return=representation" }),
    body: JSON.stringify(release),
  });
  const rows = await resp.json();
  if (!resp.ok) throw new Error(rows.message || "Failed to publish release to Supabase");
  return rows[0];
}

export async function supabaseSetUserRole(userId, role) {
  const resp = await fetch(
    `${baseUrl()}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      headers: serviceHeaders({ Prefer: "return=representation" }),
      body: JSON.stringify({ role }),
    }
  );
  const rows = await resp.json();
  if (!resp.ok) throw new Error(rows.message || "Failed to update user role");
  return rows[0];
}
