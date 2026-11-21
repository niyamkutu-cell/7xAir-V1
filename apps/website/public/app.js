const TOKEN_KEY = "sevenxair.web.token";
const VALID_PAGES = [
  "home",
  "features",
  "performance",
  "client",
  "screenshots",
  "updates",
  "downloads",
  "account",
];

let authMode = "login";
let currentUser = null;

function getToken() {
  return window.localStorage.getItem(TOKEN_KEY);
}

function setToken(token) {
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

async function apiFetch(url, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const resp = await fetch(url, { ...options, headers });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
  return data;
}

function navigateTo(pageId) {
  const target = VALID_PAGES.includes(pageId) ? pageId : "home";
  document.querySelectorAll(".page-view").forEach((el) => {
    el.classList.toggle("active", el.id === `page-${target}`);
  });
  document.querySelectorAll(".nav-link").forEach((link) => {
    const isActive = link.getAttribute("data-page") === target;
    link.classList.toggle("active", isActive);
    if (isActive) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  if (window.location.hash !== `#${target}`) {
    window.history.replaceState(null, "", `#${target}`);
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function updateAuthUI() {
  const navBtn = document.getElementById("nav-auth-btn");
  const uploadHint = document.getElementById("upload-auth-hint");
  const dlStatus = document.getElementById("dl-auth-status");
  const dlBtn = document.getElementById("windows-exe-btn");
  const signedInBox = document.getElementById("account-signed-in");
  const authBox = document.getElementById("account-auth-box");
  const accName = document.getElementById("account-username");
  const accEmail = document.getElementById("account-email");

  if (currentUser) {
    if (navBtn) navBtn.textContent = `${currentUser.username} · Account`;
    if (uploadHint) uploadHint.textContent = `Signed in as ${currentUser.username}. Upload PNG, JPG, or WebP (max 2 MB).`;
    if (dlStatus) dlStatus.textContent = `Signed in as ${currentUser.username}. Ready to download.`;
    if (dlBtn) dlBtn.textContent = "Download 7xAir for Windows";
    if (signedInBox) signedInBox.classList.remove("hidden");
    if (authBox) authBox.classList.add("hidden");
    if (accName) accName.textContent = currentUser.username;
    if (accEmail) accEmail.textContent = currentUser.email || "";
  } else {
    if (navBtn) navBtn.textContent = "Sign In";
    if (uploadHint) uploadHint.textContent = "Sign in on the Account page to upload PNG, JPG, or WebP screenshots (max 2 MB).";
    if (dlStatus) dlStatus.textContent = "Sign in to start your download.";
    if (dlBtn) dlBtn.textContent = "Sign In to Download Windows EXE";
    if (signedInBox) signedInBox.classList.add("hidden");
    if (authBox) authBox.classList.remove("hidden");
  }
}

async function loadSession() {
  try {
    const data = await apiFetch("/api/auth");
    currentUser = data.authenticated ? data.user : null;
  } catch {
    currentUser = null;
  }
  updateAuthUI();
}

async function loadReleases() {
  try {
    const data = await apiFetch("/api/releases");
    const dl = data.windowsDownload;

    const verEl = document.getElementById("dl-version-pill");
    const fileEl = document.getElementById("dl-filename");
    if (verEl) verEl.textContent = `v${data.latestVersion} · ${data.channel}`;
    if (fileEl) fileEl.textContent = dl.filename;

    const versionsGrid = document.getElementById("versions-grid");
    versionsGrid.innerHTML = data.compatibilityTargets
      .map(
        (t) => `
        <article class="glass-surface card-pad">
          <span class="pill">Minecraft ${t.mcVersion}</span>
          <h3 style="margin: 12px 0 6px;">${t.loader}</h3>
          <p class="muted">Runtime: ${t.javaRequired}</p>
          <p class="muted">${t.availabilityNote}</p>
        </article>
      `
      )
      .join("");

    const changelogList = document.getElementById("changelog-list");
    changelogList.innerHTML = data.changelog
      .map(
        (entry) => `
        <article class="glass-surface card-pad">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:8px;flex-wrap:wrap;">
            <h3 style="margin: 0;">v${entry.version} — ${entry.tag}</h3>
            <span class="pill">${entry.date}</span>
          </div>
          <ul style="margin: 0; padding-left: 20px; line-height: 1.65; color: var(--muted);">
            ${entry.highlights.map((h) => `<li>${h}</li>`).join("")}
          </ul>
        </article>
      `
      )
      .join("");
  } catch {
    // Non-fatal if API is unreachable during static preview
  }
}

async function loadGallery() {
  try {
    const data = await apiFetch("/api/screenshots");
    const grid = document.getElementById("gallery-grid");
    grid.innerHTML = (data.screenshots || [])
      .map((shot) => {
        const media = shot.imageDataUrl
          ? `<div class="shot-preview"><img src="${shot.imageDataUrl}" alt="${shot.title}" loading="lazy" /></div>`
          : `<div class="shot-preview"><span class="pill">${shot.theme} · MC ${shot.mcVersion}</span></div>`;
        return `
          <article class="glass-surface shot-card hover-card">
            ${media}
            <div class="shot-body">
              <strong>${shot.title}</strong>
              <span class="muted">${shot.caption || ""}</span>
              <span class="muted" style="font-size: 12px;">by ${shot.author} · MC ${shot.mcVersion}</span>
            </div>
          </article>
        `;
      })
      .join("");
  } catch {
    // Non-fatal
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function setAuthTab(mode) {
  authMode = mode;
  document.getElementById("tab-login").classList.toggle("active-tab", mode === "login");
  document.getElementById("tab-signup").classList.toggle("active-tab", mode === "signup");
  const userInput = document.getElementById("auth-username");
  userInput.classList.toggle("hidden", mode === "login");
  userInput.required = mode === "signup";
  document.getElementById("auth-form-title").textContent =
    mode === "login" ? "Sign In to 7xAir" : "Create 7xAir Account";
  document.getElementById("auth-submit-btn").textContent =
    mode === "login" ? "Log In" : "Create Account";
}

// Navigation click handlers
document.querySelectorAll("[data-page]").forEach((el) => {
  el.addEventListener("click", (e) => {
    e.preventDefault();
    navigateTo(el.getAttribute("data-page"));
  });
});

window.addEventListener("hashchange", () => {
  navigateTo(window.location.hash.replace(/^#/, "") || "home");
});

document.getElementById("nav-auth-btn").addEventListener("click", () => {
  navigateTo("account");
});

document.getElementById("tab-login").addEventListener("click", () => setAuthTab("login"));
document.getElementById("tab-signup").addEventListener("click", () => setAuthTab("signup"));

document.getElementById("account-signout-btn").addEventListener("click", () => {
  setToken(null);
  currentUser = null;
  updateAuthUI();
  document.getElementById("auth-feedback").textContent = "Signed out cleanly.";
});

// Working Login / Sign Up form with validation
document.getElementById("auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const feedback = document.getElementById("auth-feedback");
  const email = document.getElementById("auth-email").value.trim();
  const password = document.getElementById("auth-password").value;
  const username = document.getElementById("auth-username").value.trim();

  if (!email.includes("@")) {
    feedback.textContent = "Please enter a valid email address.";
    return;
  }
  if (password.length < 8) {
    feedback.textContent = "Password must be at least 8 characters.";
    return;
  }
  if (authMode === "signup" && username.length < 3) {
    feedback.textContent = "Username must be at least 3 characters.";
    return;
  }

  feedback.textContent = "Authenticating...";
  try {
    const res = await apiFetch("/api/auth", {
      method: "POST",
      body: JSON.stringify({
        action: authMode,
        email,
        password,
        username: authMode === "signup" ? username : undefined,
      }),
    });
    setToken(res.token);
    currentUser = res.user;
    updateAuthUI();
    feedback.textContent = `Welcome, ${res.user.username}!`;
  } catch (err) {
    feedback.textContent = err.message;
  }
});

// Server-Protected Windows EXE Download handler
document.getElementById("windows-exe-btn").addEventListener("click", async () => {
  const feedback = document.getElementById("dl-feedback");
  if (!currentUser) {
    feedback.textContent = "Please sign in first to download the Windows installer.";
    navigateTo("account");
    return;
  }
  feedback.textContent = "Preparing your download...";
  try {
    const authRes = await apiFetch("/api/download");
    feedback.textContent = "Starting download...";
    const link = document.createElement("a");
    link.href = authRes.downloadUrl;
    link.setAttribute("download", authRes.filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    feedback.textContent = "Download started!";
  } catch (err) {
    feedback.textContent = err.message;
    if (String(err.message).toLowerCase().includes("sign in") || String(err.message).includes("401")) {
      navigateTo("account");
    }
  }
});

// Screenshot upload handler
document.getElementById("screenshot-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const feedback = document.getElementById("shot-feedback");
  if (!currentUser) {
    feedback.textContent = "Please sign in on the Account page before uploading.";
    navigateTo("account");
    return;
  }
  const file = document.getElementById("shot-file").files[0];
  if (!file) {
    feedback.textContent = "Please select a PNG, JPG, or WebP image.";
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    feedback.textContent = "Image exceeds the 2 MB limit.";
    return;
  }
  feedback.textContent = "Uploading screenshot...";
  try {
    const imageDataUrl = await readFileAsDataUrl(file);
    await apiFetch("/api/screenshots", {
      method: "POST",
      body: JSON.stringify({
        title: document.getElementById("shot-title").value.trim(),
        caption: document.getElementById("shot-caption").value.trim(),
        mcVersion: document.getElementById("shot-version").value,
        theme: document.documentElement.getAttribute("data-theme") || "midnight-sky",
        imageDataUrl,
      }),
    });
    feedback.textContent = "Screenshot published!";
    document.getElementById("screenshot-form").reset();
    await loadGallery();
  } catch (err) {
    feedback.textContent = err.message;
  }
});

// Initial boot
setAuthTab("login");
navigateTo(window.location.hash.replace(/^#/, "") || "home");
void loadSession();
void loadReleases();
void loadGallery();


// === Interactive Scenic Atmosphere Switcher ===
const SCENE_KEY = "sevenxair.web.scene";
const HERO_QUOTES = [
  "“Built to disappear behind your gameplay.”",
  "“Zero clutter. Pure frame rate. Pure control.”",
  "“Your worlds, your mods, your atmosphere.”",
  "“Designed for players who care about every millisecond.”",
];
let quoteIdx = 0;

function applyScene(sceneId) {
  document.documentElement.setAttribute("data-theme", sceneId);
  try {
    window.localStorage.setItem(SCENE_KEY, sceneId);
  } catch {
    // ignore
  }
  document.querySelectorAll(".scene-chip[data-scene]").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-scene") === sceneId);
  });
}

function initScenicAtmosphere() {
  const saved = window.localStorage.getItem(SCENE_KEY) || "midnight-sky";
  applyScene(saved);

  document.querySelectorAll(".scene-chip[data-scene]").forEach((btn) => {
    btn.addEventListener("click", () => {
      applyScene(btn.getAttribute("data-scene") || "midnight-sky");
    });
  });

  // Lightweight floating atmospheric particles
  const container = document.getElementById("scenic-particles");
  if (container && container.children.length === 0) {
    for (let i = 0; i < 18; i++) {
      const dot = document.createElement("span");
      dot.className = "scenic-dot";
      const size = 2 + (i % 4);
      dot.style.width = `${size}px`;
      dot.style.height = `${size}px`;
      dot.style.left = `${(i * 5.7) % 100}%`;
      dot.style.animationDuration = `${12 + (i % 9) * 2}s`;
      dot.style.animationDelay = `${-(i * 1.4)}s`;
      container.appendChild(dot);
    }
  }

  // Interactive rotating quotes on Home
  const quoteEl = document.getElementById("hero-quote");
  const nextQuoteBtn = document.getElementById("next-quote-btn");
  if (quoteEl && nextQuoteBtn) {
    nextQuoteBtn.addEventListener("click", () => {
      quoteIdx = (quoteIdx + 1) % HERO_QUOTES.length;
      quoteEl.textContent = HERO_QUOTES[quoteIdx];
    });
  }

  // Interactive HUD Preview toggles on Client page
  document.querySelectorAll("[data-hud-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-hud-toggle");
      btn.classList.toggle("active");
      const widget = document.querySelector(`[data-hud-widget="${id}"]`);
      if (widget) {
        widget.classList.toggle("hidden", !btn.classList.contains("active"));
      }
    });
  });
}

initScenicAtmosphere();
