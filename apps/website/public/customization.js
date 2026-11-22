(function initSevenXAirWebCustomization() {
  const STORAGE_KEY = "sevenxair.web.customization.v1";
  const WEB_FONTS = [
    "Inter", "Manrope", "Plus Jakarta Sans", "DM Sans", "Outfit", "Sora", "Space Grotesk",
    "Urbanist", "Rubik", "Nunito Sans", "Poppins", "Montserrat", "Lato", "Roboto",
    "Open Sans", "IBM Plex Sans", "Source Sans 3", "Geist", "Fira Sans", "Work Sans",
    "Lexend", "Exo 2", "Rajdhani", "Oxanium", "JetBrains Mono", "Fira Code", "Space Mono",
  ];

  const DEFAULTS = {
    schemaVersion: 1,
    headingFont: "Space Grotesk",
    bodyFont: "Plus Jakarta Sans",
    fontSizePx: 15,
    fontWeight: 500,
    lineHeight: 1.55,
    letterSpacingEm: 0,
    gradientHeadings: false,
    customColorsEnabled: false,
    primaryColor: "#8b5cf6",
    accentColor: "#38bdf8",
    headingColor: "#ffffff",
    bodyColor: "#e2e8f0",
    customGradient: "linear-gradient(135deg, #8b5cf6, #ef4444)",
    soundPack: "glass-chime",
  };

  let saved = loadSaved();
  let draft = { ...saved };
  const loadedFonts = new Set();

  function loadSaved() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
    } catch {
      return { ...DEFAULTS };
    }
  }

  function ensureWebFont(family) {
    if (!family || !WEB_FONTS.includes(family) || loadedFonts.has(family)) return;
    loadedFonts.add(family);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@400;500;600;700;800&display=swap`;
    document.head.appendChild(link);
  }

  function applyState(st) {
    ensureWebFont(st.headingFont);
    ensureWebFont(st.bodyFont);
    const root = document.documentElement;
    root.style.setProperty("--web-heading-font", `"${st.headingFont}", system-ui, sans-serif`);
    root.style.setProperty("--web-body-font", `"${st.bodyFont}", system-ui, sans-serif`);
    root.style.setProperty("--web-font-size", `${st.fontSizePx}px`);
    root.style.setProperty("--web-font-weight", String(st.fontWeight));
    root.style.setProperty("--web-line-height", String(st.lineHeight));
    root.style.setProperty("--web-letter-spacing", `${st.letterSpacingEm}em`);
    root.setAttribute("data-web-gradient-headings", String(st.gradientHeadings));
    if (st.customColorsEnabled) {
      root.style.setProperty("--accent", st.accentColor);
      root.style.setProperty("--web-custom-gradient", st.customGradient);
    } else {
      root.style.removeProperty("--accent");
    }
  }

  function populateFontSelects() {
    for (const id of ["web-cust-heading-font", "web-cust-body-font"]) {
      const sel = document.getElementById(id);
      if (!sel) continue;
      sel.innerHTML = WEB_FONTS.map((f) => `<option value="${f}">${f}</option>`).join("");
    }
  }

  function syncUI() {
    const setV = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.value = String(v);
    };
    const setC = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.checked = Boolean(v);
    };
    setV("web-cust-heading-font", draft.headingFont);
    setV("web-cust-body-font", draft.bodyFont);
    setV("web-cust-size", draft.fontSizePx);
    setV("web-cust-weight", draft.fontWeight);
    setV("web-cust-lh", Math.round(draft.lineHeight * 100));
    setC("web-cust-grad-head", draft.gradientHeadings);
    setC("web-cust-colors-on", draft.customColorsEnabled);
    setV("web-cust-primary", draft.primaryColor);
    setV("web-cust-accent", draft.accentColor);
    setV("web-cust-gradient", draft.customGradient);
  }

  function bindUI() {
    populateFontSelects();
    applyState(saved);

    const modal = document.getElementById("web-customization-modal");
    document.getElementById("open-web-cust-btn")?.addEventListener("click", () => {
      draft = { ...saved };
      syncUI();
      modal?.classList.remove("hidden");
    });
    document.getElementById("close-web-cust-btn")?.addEventListener("click", () => {
      draft = { ...saved };
      applyState(saved);
      modal?.classList.add("hidden");
      window.SevenXAirSound?.play("modalClose");
    });

    const bind = (id, fn) =>
      document.getElementById(id)?.addEventListener("input", (ev) => {
        fn(ev.target);
        applyState(draft);
      });

    bind("web-cust-heading-font", (t) => (draft.headingFont = t.value));
    bind("web-cust-body-font", (t) => (draft.bodyFont = t.value));
    bind("web-cust-size", (t) => (draft.fontSizePx = Number(t.value)));
    bind("web-cust-weight", (t) => (draft.fontWeight = Number(t.value)));
    bind("web-cust-lh", (t) => (draft.lineHeight = Number(t.value) / 100));
    bind("web-cust-grad-head", (t) => (draft.gradientHeadings = t.checked));
    bind("web-cust-colors-on", (t) => (draft.customColorsEnabled = t.checked));
    bind("web-cust-primary", (t) => {
      draft.primaryColor = t.value;
      draft.customColorsEnabled = true;
    });
    bind("web-cust-accent", (t) => {
      draft.accentColor = t.value;
      draft.customColorsEnabled = true;
    });
    bind("web-cust-gradient", (t) => (draft.customGradient = t.value));

    document.getElementById("web-cust-save-btn")?.addEventListener("click", () => {
      saved = { ...draft };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
      } catch {
        // ignore
      }
      applyState(saved);
      window.SevenXAirSound?.play("success");
      modal?.classList.add("hidden");
    });

    document.getElementById("web-cust-cancel-btn")?.addEventListener("click", () => {
      draft = { ...saved };
      applyState(saved);
      modal?.classList.add("hidden");
      window.SevenXAirSound?.play("modalClose");
    });

    document.getElementById("web-cust-reset-btn")?.addEventListener("click", () => {
      draft = { ...DEFAULTS };
      syncUI();
      applyState(draft);
      window.SevenXAirSound?.play("button");
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindUI);
  } else {
    bindUI();
  }
})();
