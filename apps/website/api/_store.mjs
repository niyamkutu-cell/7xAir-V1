import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const SESSION_SECRET =
  process.env.SEVENXAIR_SESSION_SECRET || "7xair-local-dev-session-secret-change-in-prod";

function dataDir() {
  const dir = process.env.SEVENXAIR_WEB_DATA_DIR || "/tmp/7xair-web-data";
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function readJson(filename, fallback) {
  const filePath = path.join(dataDir(), filename);
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(filename, value) {
  const filePath = path.join(dataDir(), filename);
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(tmpPath, filePath);
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(password, stored) {
  const [salt, keyHex] = String(stored || "").split(":");
  if (!salt || !keyHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(keyHex, "hex");
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

export function signSessionToken(payload) {
  const body = Buffer.from(
    JSON.stringify({
      ...payload,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
    })
  ).toString("base64url");
  const sig = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(body)
    .digest("base64url");
  return `${body}.${sig}`;
}

export function verifySessionToken(token) {
  if (!token || typeof token !== "string") return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(body)
    .digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (parsed.exp && parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function loadUsers() {
  return readJson("users.json", []);
}

export function saveUsers(users) {
  writeJsonAtomic("users.json", users);
}

export function loadCustomReleases() {
  return readJson("releases.json", []);
}

export function saveCustomReleases(releases) {
  writeJsonAtomic("releases.json", releases);
}

const DEFAULT_SHOWCASE = [
  {
    id: "seed-glass-hud",
    title: "Translucent Glass HUD — Azure Mountains",
    caption:
      "Floating low-alpha FPS, CPS, Ping, Keystrokes, and Coordinates panels over live 1.21.11 gameplay.",
    mcVersion: "1.21.11",
    theme: "azure-mountains",
    author: "7xAir Team",
    imageDataUrl: null,
    accentHex: "#38e8ff",
    createdAt: "2026-11-20T00:00:00Z",
  },
  {
    id: "seed-perf-center",
    title: "Performance Center & Crash Diagnostics",
    caption:
      "Live CPU/RAM/GPU telemetry, Competitive PvP G1GC presets, and automated crash-log analysis.",
    mcVersion: "1.21.11",
    theme: "emerald-wilderness",
    author: "7xAir Team",
    imageDataUrl: null,
    accentHex: "#34d399",
    createdAt: "2026-11-20T00:00:00Z",
  },
  {
    id: "seed-hud-editor",
    title: "Interactive Drag-and-Drop HUD Editor",
    caption:
      "Snap-to-grid positioning, center guides, and scroll scaling with zero opaque background walls.",
    mcVersion: "26.2",
    theme: "dreamy-anime",
    author: "7xAir Team",
    imageDataUrl: null,
    accentHex: "#a855f7",
    createdAt: "2026-11-20T00:00:00Z",
  },
];

export function loadScreenshots() {
  return readJson("screenshots.json", DEFAULT_SHOWCASE);
}

export function saveScreenshots(items) {
  writeJsonAtomic("screenshots.json", items);
}

export function getReleaseMetadata(externalReleases = null) {
  const custom = externalReleases || loadCustomReleases();
  const latestCustom = custom.find((r) => r.channel === "stable") || custom[0] || null;

  const latestVersion = latestCustom?.version || "0.1.0";
  const installerUrl =
    latestCustom?.windows_installer_url || `/downloads/7xAir-Setup-${latestVersion}.exe`;
  const installerSha256 =
    latestCustom?.windows_installer_sha256 ||
    "0000000000000000000000000000000000000000000000000000000000000000";

  const baseChangelog = [
    {
      version: "0.1.0",
      date: "2026-11-20",
      tag: "Initial Release",
      highlights: [
        "Windows 10/11 Tauri 2 launcher with frameless translucent floating glass UI and 7 color themes.",
        "Independent per-instance directories with cloning, Mojang Piston Meta v2, Java detection, and Fabric loader selection.",
        "Offline local profiles (deterministic UUID v3) and optional Microsoft Device Code OAuth.",
        "Modrinth v2 mods & resource-pack browser with recursive dependency resolution, SHA-512 verification, updates, and compatibility audits.",
        "Automatic per-instance 7xAir Fabric Client installation with global ON/OFF, tri-state per-instance overrides, repair, removal, and SHA-256 integrity checks.",
        "Performance Center with live CPU/RAM/GPU telemetry, G1GC presets, diagnostics, and crash-log analysis.",
        "Verified background auto-updates with staging, running-game safety guard, and atomic rollback.",
      ],
    },
  ];

  const mergedChangelog = [
    ...custom.map((r) => ({
      version: r.version,
      date: String(r.published_at || "").slice(0, 10) || "2026-11-20",
      tag: r.channel === "beta" ? "Beta Release" : "Stable Release",
      highlights:
        Array.isArray(r.highlights) && r.highlights.length > 0
          ? r.highlights
          : [r.release_notes || `7xAir v${r.version} Windows installer release.`],
    })),
    ...baseChangelog,
  ];

  return {
    productName: "7xAir",
    latestVersion,
    channel: latestCustom?.channel || "stable",
    publishedAt: String(latestCustom?.published_at || "2026-11-20").slice(0, 10),
    windowsDownload: {
      filename: `7xAir-Setup-${latestVersion}.exe`,
      installerType: "Windows 10/11 NSIS EXE Installer (x64)",
      url: installerUrl,
      sha256: installerSha256,
      requirements:
        "Windows 10 or Windows 11 (64-bit), WebView2 runtime, Java 21+ (auto-detected)",
      clientDistributionNote:
        "The 7xAir Fabric Client is installed, verified, and updated automatically per instance inside the launcher. No separate client JAR download is offered.",
    },
    compatibilityTargets: [
      {
        mcVersion: "1.21.11",
        loader: "Fabric Loader 0.16.10+",
        javaRequired: "Java 21+",
        availabilityNote: "Target supported subject to official Mojang & Fabric availability.",
      },
      {
        mcVersion: "26.2",
        loader: "Fabric Loader 0.16.10+",
        javaRequired: "Java 21+",
        availabilityNote: "Target supported subject to official Mojang & Fabric availability.",
      },
    ],
    changelog: mergedChangelog,
  };
}
