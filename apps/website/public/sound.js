(function initSevenXAirSound() {
  const STORAGE_KEY = "sevenxair.web.soundSettings.v1";
  const DEFAULT_SOUND_SETTINGS = {
    enabled: true,
    masterVolume: 0.45,
    navSound: true,
    buttonSound: true,
    notificationSound: true,
  };

  let settings = loadSettings();
  let audioCtx = null;
  let lastPlayedAt = {};
  let activeVoices = 0;
  const MAX_VOICES = 3;
  const MIN_GAP_MS = 60;

  function loadSettings() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULT_SOUND_SETTINGS };
      const parsed = JSON.parse(raw);
      return {
        enabled: parsed.enabled !== false,
        masterVolume: Math.max(0, Math.min(1, Number(parsed.masterVolume ?? 0.45))),
        navSound: parsed.navSound !== false,
        buttonSound: parsed.buttonSound !== false,
        notificationSound: parsed.notificationSound !== false,
      };
    } catch {
      return { ...DEFAULT_SOUND_SETTINGS };
    }
  }

  function saveSettings() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // ignore storage quota issues
    }
  }

  function ensureContext() {
    if (typeof window === "undefined") return null;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!audioCtx) {
      audioCtx = new Ctx();
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  function tone(ctx, freqStart, freqEnd, durationSec, type, gainPeak, delaySec = 0) {
    const now = ctx.currentTime + delaySec;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);
    if (freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), now + durationSec);
    }
    const peak = Math.max(0.0001, gainPeak * settings.masterVolume);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(peak, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

    osc.connect(gain);
    gain.connect(ctx.destination);
    activeVoices += 1;
    osc.onended = () => {
      activeVoices = Math.max(0, activeVoices - 1);
      osc.disconnect();
      gain.disconnect();
    };
    osc.start(now);
    osc.stop(now + durationSec + 0.015);
  }

  function canPlay(kind) {
    if (!settings.enabled || settings.masterVolume <= 0.001) return false;
    if (activeVoices >= MAX_VOICES) return false;
    if (kind === "button" || kind === "dropdown" || kind === "modalClose") {
      if (!settings.buttonSound) return false;
    } else if (kind === "nav" || kind === "page") {
      if (!settings.navSound) return false;
    } else if (kind === "success" || kind === "error") {
      if (!settings.notificationSound) return false;
    }
    const now = performance.now();
    if (lastPlayedAt[kind] && now - lastPlayedAt[kind] < MIN_GAP_MS) {
      return false;
    }
    lastPlayedAt[kind] = now;
    return true;
  }

  function play(kind) {
    if (!canPlay(kind)) return;
    const ctx = ensureContext();
    if (!ctx) return;

    switch (kind) {
      case "button":
        // Crisp, clean glass tap
        tone(ctx, 640, 420, 0.045, "sine", 0.14);
        break;
      case "nav":
        // Subtle ascending glass chime for category selection
        tone(ctx, 480, 680, 0.075, "triangle", 0.13);
        break;
      case "page":
        // Soft airy transition tone when opening a page
        tone(ctx, 360, 520, 0.095, "sine", 0.1);
        break;
      case "modalClose":
        // Gentle descending dampened click
        tone(ctx, 520, 300, 0.065, "sine", 0.12);
        break;
      case "dropdown":
        // Delicate tick when opening a dropdown
        tone(ctx, 760, 600, 0.038, "triangle", 0.1);
        break;
      case "success":
        // Warm two-note harmonic confirmation
        tone(ctx, 523.25, 523.25, 0.085, "sine", 0.14, 0);
        tone(ctx, 783.99, 783.99, 0.12, "sine", 0.14, 0.065);
        break;
      case "cardHover":
        tone(ctx, 740, 880, 0.028, "sine", 0.055);
        tone(ctx, 1850, 2100, 0.024, "sine", 0.02);
        break;
      case "toggle":
        tone(ctx, 580, 960, 0.052, "sine", 0.11);
        tone(ctx, 1220, 1980, 0.042, "sine", 0.035);
        break;
      case "important":
        tone(ctx, 440, 880, 0.11, "triangle", 0.13);
        tone(ctx, 660, 1320, 0.11, "sine", 0.06, 0.03);
        break;
      case "error":
        // Soft muted low double-pulse
        tone(ctx, 240, 190, 0.085, "triangle", 0.15, 0);
        tone(ctx, 195, 160, 0.095, "triangle", 0.14, 0.08);
        break;
      default:
        break;
    }
  }

  function updateSettings(patch) {
    settings = { ...settings, ...patch };
    settings.masterVolume = Math.max(0, Math.min(1, Number(settings.masterVolume)));
    saveSettings();
    syncSoundSettingsUI();
  }

  function syncSoundSettingsUI() {
    const toggleBtn = document.getElementById("sound-master-toggle");
    const navToggle = document.getElementById("sound-nav-toggle");
    const btnToggle = document.getElementById("sound-btn-toggle");
    const notifToggle = document.getElementById("sound-notif-toggle");
    const volSlider = document.getElementById("sound-volume-slider");
    const volLabel = document.getElementById("sound-volume-label");
    const navSoundBtn = document.getElementById("nav-sound-btn");

    if (toggleBtn) {
      toggleBtn.textContent = settings.enabled ? "ON" : "OFF";
      toggleBtn.classList.toggle("active-chip", settings.enabled);
      toggleBtn.setAttribute("aria-pressed", String(settings.enabled));
    }
    if (navToggle) {
      navToggle.textContent = settings.navSound ? "ON" : "OFF";
      navToggle.classList.toggle("active-chip", settings.navSound);
      navToggle.setAttribute("aria-pressed", String(settings.navSound));
    }
    if (btnToggle) {
      btnToggle.textContent = settings.buttonSound ? "ON" : "OFF";
      btnToggle.classList.toggle("active-chip", settings.buttonSound);
      btnToggle.setAttribute("aria-pressed", String(settings.buttonSound));
    }
    if (notifToggle) {
      notifToggle.textContent = settings.notificationSound ? "ON" : "OFF";
      notifToggle.classList.toggle("active-chip", settings.notificationSound);
      notifToggle.setAttribute("aria-pressed", String(settings.notificationSound));
    }
    if (volSlider) volSlider.value = String(Math.round(settings.masterVolume * 100));
    if (volLabel) volLabel.textContent = `${Math.round(settings.masterVolume * 100)}%`;
    if (navSoundBtn) {
      navSoundBtn.textContent = settings.enabled ? "Sound: ON" : "Sound: OFF";
      navSoundBtn.setAttribute("aria-pressed", String(settings.enabled));
    }
  }

  function bindGlobalSoundUI() {
    syncSoundSettingsUI();

    const modal = document.getElementById("sound-settings-modal");
    const openBtn = document.getElementById("nav-sound-btn");
    const closeBtn = document.getElementById("sound-modal-close");

    openBtn?.addEventListener("click", () => {
      modal?.classList.remove("hidden");
      play("button");
    });

    closeBtn?.addEventListener("click", () => {
      modal?.classList.add("hidden");
      play("modalClose");
    });

    modal?.addEventListener("click", (ev) => {
      if (ev.target === modal) {
        modal.classList.add("hidden");
        play("modalClose");
      }
    });

    document.getElementById("sound-master-toggle")?.addEventListener("click", () => {
      updateSettings({ enabled: !settings.enabled });
      if (settings.enabled) play("success");
    });
    document.getElementById("sound-nav-toggle")?.addEventListener("click", () => {
      updateSettings({ navSound: !settings.navSound });
      play("nav");
    });
    document.getElementById("sound-btn-toggle")?.addEventListener("click", () => {
      updateSettings({ buttonSound: !settings.buttonSound });
      play("button");
    });
    document.getElementById("sound-notif-toggle")?.addEventListener("click", () => {
      updateSettings({ notificationSound: !settings.notificationSound });
      play("success");
    });
    document.getElementById("sound-volume-slider")?.addEventListener("input", (ev) => {
      updateSettings({ masterVolume: Number(ev.target.value) / 100 });
    });
    document.getElementById("sound-test-success")?.addEventListener("click", () => play("success"));
    document.getElementById("sound-test-error")?.addEventListener("click", () => play("error"));

    // Delegated subtle sounds for buttons & dropdowns
    document.addEventListener("click", (ev) => {
      const target = ev.target instanceof Element ? ev.target.closest("button") : null;
      if (!target) return;
      if (target.id === "sound-modal-close" || target.id === "web-music-collapse") return;
      if (target.classList.contains("nav-link")) return;
      play("button");
    });

    document.addEventListener("pointerenter", (ev) => {
      const el = ev.target instanceof Element ? ev.target : null;
      if (!el) return;
      if (el.matches(".nav-link")) play("nav");
      else if (el.matches("button, .btn-primary, .btn-glass, .btn-music-red, .scene-chip")) play("button");
      else if (el.matches(".hover-card, .music-track-card")) play("cardHover");
    }, true);

    document.addEventListener("mousedown", (ev) => {
      const sel = ev.target instanceof Element ? ev.target.closest("select") : null;
      if (sel) play("dropdown");
    });
  }

  window.SevenXAirSound = {
    play,
    getSettings: () => ({ ...settings }),
    updateSettings,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindGlobalSoundUI);
  } else {
    bindGlobalSoundUI();
  }
})();
