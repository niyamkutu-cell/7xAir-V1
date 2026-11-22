(function initSevenXAirWebAtmosphere() {
  const STORAGE_KEY = "sevenxair.web.atmosphereFx.v1";
  const QUALITY_SCALE = { low: 0.42, balanced: 0.78, high: 1.15, maximum: 1.55 };
  const DEFAULTS = {
    quality: "balanced",
    reducedMotion:
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    density: 1.0,
    speed: 1.0,
    rainParticles: true,
    flyingObjects: true,
    musicVisualizer: true,
    ambientLights: true,
    reactionIcons: true,
  };

  let cfg = loadCfg();
  let canvas = null;
  let ctx = null;
  let width = window.innerWidth;
  let height = window.innerHeight;
  let rafId = 0;
  let hidden = document.hidden;

  function loadCfg() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
    } catch {
      return { ...DEFAULTS };
    }
  }

  function saveCfg() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
    } catch {
      // ignore
    }
  }

  function drawRocket(c, e, t) {
    c.save();
    c.translate(e.x, e.y);
    c.scale(e.dir, 1);
    const s = e.size;
    const fl = 0.84 + Math.sin(t * 34 + e.phase) * 0.22;
    c.fillStyle = "rgba(251, 146, 60, 0.9)";
    c.beginPath();
    c.moveTo(-s * 0.62, -s * 0.16);
    c.lineTo(-s * 1.24 * fl, 0);
    c.lineTo(-s * 0.62, s * 0.16);
    c.closePath();
    c.fill();

    c.fillStyle = e.accent;
    c.beginPath();
    c.moveTo(-s * 0.6, -s * 0.2);
    c.lineTo(-s * 0.84, -s * 0.46);
    c.lineTo(-s * 0.2, -s * 0.2);
    c.closePath();
    c.fill();
    c.beginPath();
    c.moveTo(-s * 0.6, s * 0.2);
    c.lineTo(-s * 0.84, s * 0.46);
    c.lineTo(-s * 0.2, s * 0.2);
    c.closePath();
    c.fill();

    c.fillStyle = e.primary;
    c.beginPath();
    c.moveTo(s * 0.8, 0);
    c.quadraticCurveTo(s * 0.3, -s * 0.26, -s * 0.6, -s * 0.2);
    c.lineTo(-s * 0.6, s * 0.2);
    c.quadraticCurveTo(s * 0.3, s * 0.26, s * 0.8, 0);
    c.closePath();
    c.fill();

    c.fillStyle = "#38bdf8";
    c.beginPath();
    c.arc(s * 0.12, 0, s * 0.11, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  function drawAirplane(c, e) {
    c.save();
    c.translate(e.x, e.y);
    c.scale(e.dir, 1);
    const s = e.size;
    c.fillStyle = e.accent;
    c.beginPath();
    c.moveTo(s * 0.15, 0);
    c.lineTo(-s * 0.34, -s * 0.54);
    c.lineTo(-s * 0.48, -s * 0.54);
    c.lineTo(-s * 0.14, 0);
    c.closePath();
    c.fill();
    c.beginPath();
    c.moveTo(s * 0.15, 0);
    c.lineTo(-s * 0.34, s * 0.54);
    c.lineTo(-s * 0.48, s * 0.54);
    c.lineTo(-s * 0.14, 0);
    c.closePath();
    c.fill();
    c.fillStyle = "#f1f5f9";
    c.beginPath();
    c.ellipse(0, 0, s * 0.66, s * 0.14, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  function drawHelicopter(c, e, t) {
    c.save();
    c.translate(e.x, e.y);
    c.scale(e.dir, 1);
    const s = e.size;
    c.strokeStyle = e.primary;
    c.lineWidth = 2.5;
    c.beginPath();
    c.moveTo(-s * 0.15, 0);
    c.lineTo(-s * 0.82, -s * 0.12);
    c.stroke();
    c.fillStyle = e.primary;
    c.beginPath();
    c.ellipse(0, 0, s * 0.4, s * 0.21, 0, 0, Math.PI * 2);
    c.fill();
    const span = s * (0.25 + Math.abs(Math.sin(t * 25)) * 0.72);
    c.strokeStyle = "#f8fafc";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-span, -s * 0.34);
    c.lineTo(span, -s * 0.34);
    c.stroke();
    c.restore();
  }

  function drawBirdFlock(c, e, t) {
    c.save();
    c.strokeStyle = e.primary;
    c.lineWidth = 1.7;
    for (let i = 0; i < e.flockCount; i++) {
      const bx = e.x - i * e.size * 0.85 * e.dir;
      const by = e.y + (i % 2 === 0 ? -1 : 1) * Math.ceil(i / 2) * e.size * 0.5;
      const flap = Math.sin(t * 9 + e.phase + i * 0.7) * e.size * 0.3;
      const sp = e.size * 0.4;
      c.beginPath();
      c.moveTo(bx - sp, by - flap);
      c.quadraticCurveTo(bx - sp * 0.35, by - sp * 0.35 - flap * 0.5, bx, by);
      c.quadraticCurveTo(bx + sp * 0.35, by - sp * 0.35 - flap * 0.5, bx + sp, by - flap);
      c.stroke();
    }
    c.restore();
  }

  function drawButterfly(c, e, t) {
    c.save();
    c.translate(e.x, e.y);
    const flap = 0.28 + Math.abs(Math.sin(t * 11 + e.phase)) * 0.72;
    const s = e.size * 0.54;
    c.fillStyle = e.primary;
    c.beginPath();
    c.ellipse(-s * 0.45 * flap, -s * 0.18, s * 0.52 * flap, s * 0.34, -0.35, 0, Math.PI * 2);
    c.ellipse(s * 0.45 * flap, -s * 0.18, s * 0.52 * flap, s * 0.34, 0.35, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  function drawGlossyReaction(c, r, t) {
    const prog = r.age / r.maxAge;
    const alpha = Math.min(1, r.age / 0.4) * (prog > 0.78 ? Math.max(0, (1 - prog) / 0.22) : 1);
    const bob = Math.sin(t * 3.1 + r.phase) * 5;
    c.save();
    c.globalAlpha = alpha;
    c.translate(r.x, r.y + bob);
    c.shadowColor = r.accent;
    c.shadowBlur = 16;
    const grad = c.createRadialGradient(-6, -7, 3, 0, 0, 20);
    grad.addColorStop(0, "#fff");
    grad.addColorStop(0.35, r.accent);
    grad.addColorStop(1, "#0f172a");
    c.fillStyle = grad;
    c.beginPath();
    c.arc(0, 0, 20, 0, Math.PI * 2);
    c.fill();
    c.shadowBlur = 0;
    c.fillStyle = "rgba(255,255,255,0.35)";
    c.beginPath();
    c.ellipse(-4, -9, 9, 4, -0.25, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#0f172a";
    c.strokeStyle = "#0f172a";
    c.lineWidth = 2;
    c.beginPath();
    c.arc(-6, -3, 2.4, 0, Math.PI * 2);
    c.arc(6, -3, 2.4, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.arc(0, 3, 6.5, 0.12 * Math.PI, 0.88 * Math.PI);
    c.stroke();
    c.restore();
  }

  function startEngine() {
    canvas = document.getElementById("web-atmosphere-canvas");
    if (!canvas) return;
    ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", () => {
      hidden = document.hidden;
    });

    const rain = Array.from({ length: 70 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      len: 12 + Math.random() * 14,
      speed: 360 + Math.random() * 220,
      alpha: 0.16 + Math.random() * 0.24,
    }));
    const particles = Array.from({ length: 65 }, (_, i) => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 24,
      vy: 14 + Math.random() * 24,
      r: 2.2 + Math.random() * 3.8,
      phase: Math.random() * Math.PI * 2,
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 2,
      idx: i,
    }));
    const smoke = [];
    const flyers = [];
    const reactions = [];

    let serenityBlend = 0;
    let flyerTimer = 1.6;
    let reactionTimer = 7.0;
    let elapsed = 0;
    let lastTs = performance.now();

    const spawnFlyer = (isSerenity) => {
      if (flyers.length >= 4) return;
      const dir = Math.random() < 0.5 ? 1 : -1;
      const startX = dir === 1 ? -85 : width + 85;
      const baseY = 78 + Math.random() * Math.min(200, height * 0.28);
      if (isSerenity) {
        flyers.push({
          kind: Math.random() < 0.72 ? "butterfly" : "bird-flock",
          x: startX,
          y: baseY,
          baseY,
          vx: (54 + Math.random() * 32) * dir,
          dir,
          size: 15 + Math.random() * 6,
          phase: Math.random() * Math.PI * 2,
          amp: 20,
          freq: 2.4,
          primary: "rgba(244, 114, 182, 0.85)",
          accent: "#fde047",
          flockCount: 3,
          smokeTimer: 0,
        });
        return;
      }
      const r = Math.random();
      const kind = r < 0.34 ? "rocket" : r < 0.62 ? "airplane" : r < 0.82 ? "helicopter" : "bird-flock";
      flyers.push({
        kind,
        x: startX,
        y: baseY,
        baseY,
        vx: (kind === "rocket" ? 124 : kind === "helicopter" ? 68 : 90) * dir,
        dir,
        size: 16 + Math.random() * 7,
        phase: Math.random() * Math.PI * 2,
        amp: kind === "rocket" ? 14 : 9,
        freq: 1.5,
        primary: kind === "bird-flock" ? "rgba(186, 230, 253, 0.75)" : "#ef4444",
        accent: "#38bdf8",
        flockCount: 4,
        smokeTimer: 0,
      });
    };

    const tick = (ts) => {
      rafId = window.requestAnimationFrame(tick);
      const rawDt = Math.min(0.05, Math.max(0.001, (ts - lastTs) / 1000));
      lastTs = ts;
      if (hidden || cfg.reducedMotion) {
        ctx.clearRect(0, 0, width, height);
        return;
      }
      const dt = rawDt * cfg.speed;
      const dens = (QUALITY_SCALE[cfg.quality] || 0.78) * cfg.density;
      elapsed += dt;

      const isSerenity = document.documentElement.getAttribute("data-theme") === "serenity-nature";
      serenityBlend += ((isSerenity ? 1 : 0) - serenityBlend) * Math.min(1, rawDt * 2.5);

      ctx.clearRect(0, 0, width, height);

      if (cfg.rainParticles) {
        if (serenityBlend < 0.9) {
          const rc = Math.min(rain.length, Math.round(36 * dens));
          ctx.save();
          ctx.strokeStyle = "rgba(96, 165, 250, 0.4)";
          ctx.lineWidth = 1.2;
          for (let i = 0; i < rc; i++) {
            const d = rain[i];
            d.y += d.speed * dt;
            d.x -= d.speed * 0.14 * dt;
            if (d.y > height + 20) {
              d.y = -20;
              d.x = Math.random() * (width + 120);
            }
            ctx.globalAlpha = d.alpha * (1 - serenityBlend);
            ctx.beginPath();
            ctx.moveTo(d.x, d.y);
            ctx.lineTo(d.x - d.len * 0.15, d.y + d.len);
            ctx.stroke();
          }
          ctx.restore();
        }

        const pc = Math.min(particles.length, Math.round(42 * dens));
        for (let i = 0; i < pc; i++) {
          const p = particles[i];
          p.phase += dt * 1.4;
          p.rot += p.vrot * dt;
          p.x += (p.vx + Math.sin(p.phase) * 12) * dt;
          p.y += p.vy * dt;
          if (p.y > height + 20) {
            p.y = -16;
            p.x = Math.random() * width;
          }
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          if (serenityBlend > 0.5) {
            ctx.globalAlpha = 0.65 * serenityBlend;
            ctx.fillStyle = p.idx % 2 === 0 ? "#f9a8d4" : "#22c55e";
            ctx.beginPath();
            ctx.ellipse(0, 0, p.r * 1.6, p.r * 0.85, 0, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.globalAlpha = 0.42 * (1 - serenityBlend);
            ctx.fillStyle = p.idx % 2 === 0 ? "#60a5fa" : "#f472b6";
            ctx.beginPath();
            ctx.arc(0, 0, p.r * 0.85, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }
      }

      if (cfg.flyingObjects) {
        flyerTimer -= dt;
        if (flyerTimer <= 0) {
          spawnFlyer(serenityBlend > 0.5);
          flyerTimer = Math.max(2.4, 5.4 / Math.max(0.5, dens));
        }
        for (let i = flyers.length - 1; i >= 0; i--) {
          const e = flyers[i];
          e.phase += dt * e.freq;
          e.x += e.vx * dt;
          e.y = e.baseY + Math.sin(e.phase) * e.amp;
          if (e.kind === "rocket") {
            e.smokeTimer += dt;
            if (e.smokeTimer >= 0.05 && smoke.length < 75) {
              e.smokeTimer = 0;
              smoke.push({ x: e.x - e.dir * e.size, y: e.y, r: 3, life: 0, maxLife: 0.9 });
            }
            drawRocket(ctx, e, elapsed);
          } else if (e.kind === "airplane") drawAirplane(ctx, e);
          else if (e.kind === "helicopter") drawHelicopter(ctx, e, elapsed);
          else if (e.kind === "bird-flock") drawBirdFlock(ctx, e, elapsed);
          else drawButterfly(ctx, e, elapsed);

          if (e.x < -150 || e.x > width + 150) flyers.splice(i, 1);
        }
        for (let i = smoke.length - 1; i >= 0; i--) {
          const sm = smoke[i];
          sm.life += dt;
          if (sm.life >= sm.maxLife) {
            smoke.splice(i, 1);
            continue;
          }
          sm.r += 8 * dt;
          ctx.fillStyle = `rgba(226,232,240,${(0.42 * (1 - sm.life / sm.maxLife)).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(sm.x, sm.y, sm.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (cfg.musicVisualizer && serenityBlend < 0.85) {
        ctx.save();
        ctx.globalAlpha = 0.24;
        const bars = 20;
        const startX = Math.max(20, width - bars * 9 - 24);
        for (let b = 0; b < bars; b++) {
          const h = 4 + Math.abs(Math.sin(elapsed * 3.1 + b * 0.6)) * 22;
          ctx.fillStyle = b % 2 === 0 ? "#38bdf8" : "#ec4899";
          ctx.fillRect(startX + b * 9, height - 10 - h, 4, h);
        }
        ctx.restore();
      }

      if (cfg.reactionIcons) {
        reactionTimer -= dt;
        if (reactionTimer <= 0 && reactions.length < 3) {
          const accents = ["#f472b6", "#38bdf8", "#fb923c", "#a78bfa", "#4ade80"];
          reactions.push({
            x: Math.max(60, width - 80 - Math.random() * 110),
            y: 110 + Math.random() * Math.max(100, height * 0.35),
            age: 0,
            maxAge: 6.0,
            phase: Math.random() * Math.PI * 2,
            accent: accents[Math.floor(Math.random() * accents.length)],
          });
          reactionTimer = 11 + Math.random() * 8;
        }
        for (let i = reactions.length - 1; i >= 0; i--) {
          const r = reactions[i];
          r.age += dt;
          if (r.age >= r.maxAge) {
            reactions.splice(i, 1);
            continue;
          }
          drawGlossyReaction(ctx, r, elapsed);
        }
      }
    };

    rafId = window.requestAnimationFrame(tick);
  }

  function bindFxUI() {
    const modal = document.getElementById("web-fx-modal");
    const sync = () => {
      const setV = (id, v) => {
        const el = document.getElementById(id);
        if (el) el.value = String(v);
      };
      const setC = (id, v) => {
        const el = document.getElementById(id);
        if (el) el.checked = Boolean(v);
      };
      setV("web-fx-quality", cfg.quality);
      setV("web-fx-density", Math.round(cfg.density * 100));
      setV("web-fx-speed", Math.round(cfg.speed * 100));
      setC("web-fx-reduced", cfg.reducedMotion);
      setC("web-fx-rain", cfg.rainParticles);
      setC("web-fx-flyers", cfg.flyingObjects);
      setC("web-fx-viz", cfg.musicVisualizer);
      setC("web-fx-reactions", cfg.reactionIcons);
    };

    document.getElementById("open-web-fx-btn")?.addEventListener("click", () => {
      sync();
      modal?.classList.remove("hidden");
    });
    document.getElementById("close-web-fx-btn")?.addEventListener("click", () => {
      modal?.classList.add("hidden");
      window.SevenXAirSound?.play("modalClose");
    });
    modal?.addEventListener("click", (ev) => {
      if (ev.target === modal) {
        modal.classList.add("hidden");
        window.SevenXAirSound?.play("modalClose");
      }
    });

    const bind = (id, key, transform) =>
      document.getElementById(id)?.addEventListener("change", (ev) => {
        cfg[key] = transform(ev.target);
        saveCfg();
      });

    bind("web-fx-quality", "quality", (t) => t.value);
    bind("web-fx-density", "density", (t) => Number(t.value) / 100);
    bind("web-fx-speed", "speed", (t) => Number(t.value) / 100);
    bind("web-fx-reduced", "reducedMotion", (t) => t.checked);
    bind("web-fx-rain", "rainParticles", (t) => t.checked);
    bind("web-fx-flyers", "flyingObjects", (t) => t.checked);
    bind("web-fx-viz", "musicVisualizer", (t) => t.checked);
    bind("web-fx-reactions", "reactionIcons", (t) => t.checked);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      startEngine();
      bindFxUI();
    });
  } else {
    startEngine();
    bindFxUI();
  }
})();
