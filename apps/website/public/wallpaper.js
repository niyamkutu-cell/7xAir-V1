(function initSevenXAirWebWallpaperEngine() {
  const STORAGE_KEY = "sevenxair.web.wallpaper.v1";

  const BUILTIN_WALLPAPERS = [
    { id: "auto", name: "Auto (Theme Matched)", url: null },
    { id: "anime-moonlit-window", name: "Wallpaper 1", url: "/backgrounds/anime-moonlit-window.jpg" },
    { id: "anime-serenity-nature", name: "Wallpaper 2", url: "/backgrounds/anime-serenity-nature.jpg" },
    { id: "anime-sakura-shrine", name: "Wallpaper 3", url: "/backgrounds/anime-sakura-shrine.jpg" },
    { id: "anime-indigo-shrine", name: "Wallpaper 4", url: "/backgrounds/anime-indigo-shrine.jpg" },
    { id: "anime-starlit-curtains", name: "Wallpaper 5", url: "/backgrounds/anime-starlit-curtains.jpg" },
    { id: "anime-midnight-headphones", name: "Wallpaper 6", url: "/backgrounds/anime-midnight-headphones.jpg" },
    { id: "anime-crimson-eclipse", name: "Wallpaper 7", url: "/backgrounds/anime-crimson-eclipse.jpg" },
    { id: "anime-azure-peaks", name: "Wallpaper 8", url: "/backgrounds/anime-azure-peaks.jpg" },
    { id: "anime-emerald-lanterns", name: "Wallpaper 9", url: "/backgrounds/anime-emerald-lanterns.jpg" },
    { id: "none", name: "Scenic Vector Only", url: null },
  ];

  const THEME_MAP = {
    "midnight-sky": "/backgrounds/anime-midnight-headphones.jpg",
    "azure-mountains": "/backgrounds/anime-azure-peaks.jpg",
    "sakura-valley": "/backgrounds/anime-sakura-shrine.jpg",
    "emerald-wilderness": "/backgrounds/anime-emerald-lanterns.jpg",
    "sunset-horizon": "/backgrounds/anime-crimson-eclipse.jpg",
    "crimson-obsidian": "/backgrounds/anime-crimson-eclipse.jpg",
    "midnight-anime": "/backgrounds/anime-moonlit-window.jpg",
    "serenity-nature": "/backgrounds/anime-serenity-nature.jpg",
    "anime-glass": "/backgrounds/anime-sakura-shrine.jpg",
  };

  const DEFAULTS = {
    wallpaperId: "auto",
    fit: "cover",
    position: "center",
    brightness: 1.0,
    blur: 0,
    saturation: 1.08,
    contrast: 1.04,
    overlayOpacity: 0.48,
    switchMode: "manual", // "manual" | "schedule" | "system"
    dayTheme: "serenity-nature",
    nightTheme: "midnight-anime",
    dayStartHour: 7,
    nightStartHour: 19,
  };

  let state = loadState();

  function loadState() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
    } catch {
      return { ...DEFAULTS };
    }
  }

  function saveState() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore storage quota errors
    }
  }

  function resolveUrl(themeId) {
    if (state.wallpaperId === "none") return null;
    if (state.wallpaperId === "auto") {
      return THEME_MAP[themeId] || THEME_MAP["midnight-sky"];
    }
    const builtin = BUILTIN_WALLPAPERS.find((w) => w.id === state.wallpaperId);
    return builtin?.url || THEME_MAP[themeId] || null;
  }

  function applyThemeFromAutoMode() {
    if (state.switchMode === "manual") return;
    let targetTheme = state.nightTheme;
    if (state.switchMode === "system" && typeof window.matchMedia === "function") {
      targetTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
        ? state.nightTheme
        : state.dayTheme;
    } else if (state.switchMode === "schedule") {
      const hr = new Date().getHours();
      const isDay =
        state.dayStartHour < state.nightStartHour
          ? hr >= state.dayStartHour && hr < state.nightStartHour
          : hr >= state.dayStartHour || hr < state.nightStartHour;
      targetTheme = isDay ? state.dayTheme : state.nightTheme;
    }
    document.documentElement.setAttribute("data-theme", targetTheme);
    document.querySelectorAll(".scene-chip[data-scene]").forEach((chip) => {
      chip.classList.toggle("active", chip.getAttribute("data-scene") === targetTheme);
    });
  }

  function applyWallpaperVisuals() {
    applyThemeFromAutoMode();
    const themeId = document.documentElement.getAttribute("data-theme") || "midnight-anime";
    const layer = document.getElementById("web-wallpaper-layer");
    const scrim = document.getElementById("web-wallpaper-scrim");
    const url = resolveUrl(themeId);
    const isLight = themeId === "serenity-nature";

    if (layer) {
      if (url) {
        layer.style.backgroundImage = `url("${url}")`;
        layer.style.backgroundSize =
          state.fit === "contain" ? "contain" : state.fit === "center" ? "auto" : "cover";
        layer.style.backgroundPosition = state.position || "center";
        layer.style.filter = `brightness(${state.brightness}) blur(${state.blur}px) saturate(${state.saturation}) contrast(${state.contrast})`;
        layer.classList.remove("hidden");
      } else {
        layer.style.backgroundImage = "none";
        layer.classList.add("hidden");
      }
    }

    if (scrim) {
      if (!url) {
        scrim.classList.add("hidden");
      } else {
        scrim.classList.remove("hidden");
        const op = Number(state.overlayOpacity);
        scrim.style.background = isLight
          ? `radial-gradient(circle at 75% 15%, rgba(254, 249, 195, ${Math.max(0.18, op * 0.45).toFixed(2)}), rgba(255, 255, 255, ${Math.min(0.84, op).toFixed(2)}) 78%)`
          : `radial-gradient(circle at 50% 30%, rgba(6, 8, 16, ${Math.max(0.2, op - 0.14).toFixed(2)}), rgba(4, 6, 12, ${Math.min(0.92, op + 0.18).toFixed(2)}) 82%)`;
      }
    }
  }

  function renderGallery() {
    const grid = document.getElementById("web-wp-gallery");
    if (!grid) return;
    const all = BUILTIN_WALLPAPERS;
    grid.innerHTML = all
      .map(
        (wp) => `
      <div class="web-wp-card ${state.wallpaperId === wp.id ? "web-wp-card--active" : ""}">
        <button type="button" class="web-wp-pick" data-wp-id="${wp.id}" style="${
          wp.url ? `background-image:url('${wp.url}')` : "background:linear-gradient(135deg,#0f172a,#312e81)"
        }">
          <span>${wp.name}</span>
        </button>
      </div>`
      )
      .join("");

    grid.querySelectorAll(".web-wp-pick").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.wallpaperId = btn.getAttribute("data-wp-id") || "auto";
        saveState();
        applyWallpaperVisuals();
        renderGallery();
      });
    });
  }

  function syncControls() {
    const setVal = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.value = String(v);
    };
    setVal("web-wp-fit", state.fit);
    setVal("web-wp-pos", state.position);
    setVal("web-wp-brightness", Math.round(state.brightness * 100));
    setVal("web-wp-blur", state.blur);
    setVal("web-wp-sat", Math.round(state.saturation * 100));
    setVal("web-wp-contrast", Math.round(state.contrast * 100));
    setVal("web-wp-overlay", Math.round(state.overlayOpacity * 100));
    setVal("web-auto-switch-mode", state.switchMode);
  }

  function bindEvents() {
    const modal = document.getElementById("web-wallpaper-modal");
    document.getElementById("open-web-wallpaper-btn")?.addEventListener("click", () => {
      syncControls();
      renderGallery();
      modal?.classList.remove("hidden");
    });
    document.getElementById("close-web-wallpaper-btn")?.addEventListener("click", () => {
      modal?.classList.add("hidden");
      window.SevenXAirSound?.play("modalClose");
    });
    modal?.addEventListener("click", (ev) => {
      if (ev.target === modal) {
        modal.classList.add("hidden");
        window.SevenXAirSound?.play("modalClose");
      }
    });


    document.getElementById("web-wp-restore-btn")?.addEventListener("click", () => {
      state = { ...DEFAULTS };
      saveState();
      syncControls();
      applyWallpaperVisuals();
      renderGallery();
      window.SevenXAirSound?.play("success");
    });

    const bind = (id, fn) =>
      document.getElementById(id)?.addEventListener("input", (ev) => {
        fn(ev.target.value);
        saveState();
        applyWallpaperVisuals();
      });

    bind("web-wp-fit", (v) => (state.fit = v));
    bind("web-wp-pos", (v) => (state.position = v));
    bind("web-wp-brightness", (v) => (state.brightness = Number(v) / 100));
    bind("web-wp-blur", (v) => (state.blur = Number(v)));
    bind("web-wp-sat", (v) => (state.saturation = Number(v) / 100));
    bind("web-wp-contrast", (v) => (state.contrast = Number(v) / 100));
    bind("web-wp-overlay", (v) => (state.overlayOpacity = Number(v) / 100));
    bind("web-auto-switch-mode", (v) => (state.switchMode = v));

    // Re-apply when scene chip clicked
    document.querySelectorAll(".scene-chip[data-scene]").forEach((chip) => {
      chip.addEventListener("click", () => {
        state.switchMode = "manual";
        saveState();
        window.setTimeout(applyWallpaperVisuals, 20);
      });
    });

    if (typeof window.matchMedia === "function") {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
        if (state.switchMode === "system") applyWallpaperVisuals();
      });
    }

    applyWallpaperVisuals();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindEvents);
  } else {
    bindEvents();
  }
})();
