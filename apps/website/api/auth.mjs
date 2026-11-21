import crypto from "node:crypto";
import {
  hashPassword,
  loadUsers,
  saveUsers,
  signSessionToken,
  verifyPassword,
  verifySessionToken,
} from "./_store.mjs";
import {
  isAdminEmail,
  isSupabaseConfigured,
  supabaseGetUserFromToken,
  supabaseLogin,
  supabaseSignup,
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
  if (req.method === "GET") {
    const token = extractBearer(req);
    if (isSupabaseConfigured()) {
      const user = await supabaseGetUserFromToken(token);
      return sendJson(res, 200, { authenticated: Boolean(user), user });
    }

    const payload = verifySessionToken(token);
    if (!payload) {
      return sendJson(res, 200, { authenticated: false, user: null });
    }
    const users = loadUsers();
    const found = users.find((u) => u.id === payload.sub);
    const role = found?.role || (isAdminEmail(payload.email) ? "admin" : "user");
    return sendJson(res, 200, {
      authenticated: true,
      user: {
        id: payload.sub,
        username: payload.username,
        email: payload.email,
        role,
      },
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

  const action = body.action;
  if (action === "logout") {
    return sendJson(res, 200, { ok: true });
  }

  if (action === "signup") {
    const username = String(body.username || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      return sendJson(res, 400, {
        error: "Username must be 3–20 characters (letters, numbers, underscore).",
      });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return sendJson(res, 400, { error: "Please enter a valid email address." });
    }
    if (password.length < 8) {
      return sendJson(res, 400, { error: "Password must be at least 8 characters." });
    }

    if (isSupabaseConfigured()) {
      try {
        const result = await supabaseSignup({ email, password, username });
        return sendJson(res, 201, result);
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
    }

    const users = loadUsers();
    if (
      users.some(
        (u) => u.email === email || u.username.toLowerCase() === username.toLowerCase()
      )
    ) {
      return sendJson(res, 409, {
        error: "An account with that email or username already exists.",
      });
    }

    const role = isAdminEmail(email) ? "admin" : "user";
    const user = {
      id: crypto.randomUUID(),
      username,
      email,
      role,
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    saveUsers(users);

    const token = signSessionToken({
      sub: user.id,
      username: user.username,
      email: user.email,
      role,
    });
    return sendJson(res, 201, {
      token,
      user: { id: user.id, username: user.username, email: user.email, role },
    });
  }

  if (action === "login") {
    const identifier = String(body.email || body.username || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (isSupabaseConfigured()) {
      try {
        const result = await supabaseLogin({ email: identifier, password });
        return sendJson(res, 200, result);
      } catch (err) {
        return sendJson(res, 401, { error: err.message });
      }
    }

    const users = loadUsers();
    const user = users.find(
      (u) => u.email === identifier || u.username.toLowerCase() === identifier
    );
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return sendJson(res, 401, { error: "Invalid credentials." });
    }

    const role = user.role || (isAdminEmail(user.email) ? "admin" : "user");
    const token = signSessionToken({
      sub: user.id,
      username: user.username,
      email: user.email,
      role,
    });
    return sendJson(res, 200, {
      token,
      user: { id: user.id, username: user.username, email: user.email, role },
    });
  }

  return sendJson(res, 400, { error: "Unsupported auth action." });
}
