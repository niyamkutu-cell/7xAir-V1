const TOKEN_KEY = "sevenxair.web.token";
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

function updateAuthUI() {
  const btn = document.getElementById("auth-open-btn");
  const hint = document.getElementById("upload-auth-hint");
  if (currentUser) {
    btn.textContent = `${currentUser.username} (Log Out)`;
    hint.textContent = `Signed in as ${currentUser.username}. Upload PNG, JPG, or WebP (max 2 MB).`;
  } else {
    btn.textContent = "Log In / Sign Up";
    hint.textContent = "Sign in to upload PNG, JPG, or WebP screenshots (max 2 MB).";
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
  const data = await apiFetch("/api/releases");
  const dl = data.windowsDownload;

  document.getElementById("dl-version-pill").textContent = `v${data.latestVersion} · ${data.channel}`;
  document.getElementById("dl-filename").textContent = dl.filename;
  document.getElementById("dl-requirements").textContent = dl.requirements;
  document.getElementById("dl-policy-note").textContent = dl.clientDistributionNote;
  document.getElementById("dl-sha256").textContent = `SHA-256: ${dl.sha256}`;
  document.getElementById("windows-exe-btn").setAttribute("href", dl.url);

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
        <div class="section-head" style="margin-bottom: 8px;">
          <h3 style="margin: 0;">v${entry.version} — ${entry.tag}</h3>
          <span class="pill">${entry.date}</span>
        </div>
        <ul style="margin: 0; padding-left: 20px; line-height: 1.65; color: #c4d5e8;">
          ${entry.highlights.map((h) => `<li>${h}</li>`).join("")}
        </ul>
      </article>
    `
    )
    .join("");
}

async function loadGallery() {
  const data = await apiFetch("/api/screenshots");
  const grid = document.getElementById("gallery-grid");
  grid.innerHTML = (data.screenshots || [])
    .map((shot) => {
      const media = shot.imageDataUrl
        ? `<div class="shot-preview" style="padding: 0;"><img src="${shot.imageDataUrl}" alt="${shot.title}" /></div>`
        : `<div class="shot-preview"><span class="pill">${shot.theme} · MC ${shot.mcVersion}</span></div>`;
      return `
        <article class="glass-surface shot-card">
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
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

document.getElementById("theme-switcher").addEventListener("change", (e) => {
  document.documentElement.setAttribute("data-theme", e.target.value);
});

const modal = document.getElementById("auth-modal");
const usernameInput = document.getElementById("auth-username");
const modalTitle = document.getElementById("auth-modal-title");
const submitBtn = document.getElementById("auth-submit-btn");

function setAuthTab(mode) {
  authMode = mode;
  document.getElementById("tab-login").classList.toggle("active-tab", mode === "login");
  document.getElementById("tab-signup").classList.toggle("active-tab", mode === "signup");
  usernameInput.classList.toggle("hidden", mode === "login");
  usernameInput.required = mode === "signup";
  modalTitle.textContent = mode === "login" ? "Log In to 7xAir" : "Create 7xAir Account";
  submitBtn.textContent = mode === "login" ? "Log In" : "Create Account";
}

document.getElementById("tab-login").addEventListener("click", () => setAuthTab("login"));
document.getElementById("tab-signup").addEventListener("click", () => setAuthTab("signup"));
document.getElementById("auth-close-btn").addEventListener("click", () => modal.classList.add("hidden"));

document.getElementById("auth-open-btn").addEventListener("click", async () => {
  if (currentUser) {
    setToken(null);
    currentUser = null;
    updateAuthUI();
    return;
  }
  modal.classList.remove("hidden");
});

document.getElementById("auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const feedback = document.getElementById("auth-feedback");
  feedback.textContent = "Submitting...";
  try {
    const res = await apiFetch("/api/auth", {
      method: "POST",
      body: JSON.stringify({
        action: authMode,
        username: usernameInput.value,
        email: document.getElementById("auth-email").value,
        password: document.getElementById("auth-password").value,
      }),
    });
    setToken(res.token);
    currentUser = res.user;
    updateAuthUI();
    feedback.textContent = "";
    modal.classList.add("hidden");
  } catch (err) {
    feedback.textContent = err.message;
  }
});

document.getElementById("toggle-upload-btn").addEventListener("click", () => {
  document.getElementById("upload-form").classList.toggle("hidden");
});

document.getElementById("upload-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const status = document.getElementById("upload-status");
  if (!currentUser) {
    status.textContent = "Please log in first.";
    modal.classList.remove("hidden");
    return;
  }
  const file = document.getElementById("shot-file").files?.[0];
  if (!file) {
    status.textContent = "Choose an image file first.";
    return;
  }
  status.textContent = "Uploading...";
  try {
    const imageDataUrl = await readFileAsDataUrl(file);
    await apiFetch("/api/screenshots", {
      method: "POST",
      body: JSON.stringify({
        title: document.getElementById("shot-title").value,
        caption: document.getElementById("shot-caption").value,
        mcVersion: document.getElementById("shot-version").value,
        theme: document.getElementById("shot-theme").value,
        imageDataUrl,
      }),
    });
    status.textContent = "Published to Showcase Gallery!";
    e.target.reset();
    await loadGallery();
  } catch (err) {
    status.textContent = err.message;
  }
});

void Promise.all([loadSession(), loadReleases(), loadGallery()]);
