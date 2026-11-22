const VALID_PAGES = [
  "home",
  "features",
  "performance",
  "client",
  "updates",
  "downloads",
];

async function apiFetch(url, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const resp = await fetch(url, { ...options, headers });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
  return data;
}

function navigateTo(pageId, fromUser = false) {
  const target = VALID_PAGES.includes(pageId) ? pageId : "home";
  document.querySelectorAll(".page-view").forEach((el) => {
    const isTarget = el.id === `page-${target}`;
    el.classList.toggle("active", isTarget);
  });
  document.querySelectorAll(".nav-link").forEach((link) => {
    const isActive = link.getAttribute("data-page") === target;
    link.classList.toggle("active", isActive);
    if (isActive) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  if (fromUser && window.SevenXAirSound) {
    window.SevenXAirSound.play("nav");
    window.setTimeout(() => window.SevenXAirSound.play("page"), 55);
  }
  if (window.location.hash !== `#${target}`) {
    window.history.replaceState(null, "", `#${target}`);
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
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
    if (versionsGrid) {
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
    }

    const changelogList = document.getElementById("changelog-list");
    if (changelogList) {
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
    }
  } catch {
    // Non-fatal if API is unreachable during static preview
  }
}

// Navigation click handlers
document.querySelectorAll("[data-page]").forEach((el) => {
  el.addEventListener("click", (e) => {
    e.preventDefault();
    navigateTo(el.getAttribute("data-page"), true);
  });
});

window.addEventListener("hashchange", () => {
  navigateTo(window.location.hash.replace(/^#/, "") || "home");
});

// Windows EXE Download button (disabled - Launching Soon)
const dlBtn = document.getElementById("windows-exe-btn");
if (dlBtn) {
  dlBtn.disabled = true;
  dlBtn.textContent = "Launching Soon";
  dlBtn.addEventListener("click", (e) => {
    e.preventDefault();
    const feedback = document.getElementById("dl-feedback");
    if (feedback) feedback.textContent = "7xAir for Windows is launching soon!";
  });
}

// Initial boot
navigateTo(window.location.hash.replace(/^#/, "") || "home");
void loadReleases();

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
  const saved = window.localStorage.getItem(SCENE_KEY) || "midnight-anime";
  applyScene(saved);

  document.querySelectorAll(".scene-chip[data-scene]").forEach((btn) => {
    btn.addEventListener("click", () => {
      applyScene(btn.getAttribute("data-scene") || "midnight-anime");
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
