import { memo, useEffect, useRef } from "react";
import type { FxQualityPreset, ThemeId } from "../types/launcher";

export type ReactionIconKind =
  | "sparkle-joy"
  | "cool-shades"
  | "hype-flame"
  | "cozy-sleep"
  | "starry-awe"
  | "victory-wink";

export const REACTION_ICON_CATALOG: readonly {
  id: ReactionIconKind;
  label: string;
  accent: string;
}[] = [
  { id: "sparkle-joy", label: "Sparkle Joy", accent: "#f472b6" },
  { id: "cool-shades", label: "Cool Shades", accent: "#38bdf8" },
  { id: "hype-flame", label: "Hype Flame", accent: "#fb923c" },
  { id: "cozy-sleep", label: "Cozy Chill", accent: "#a78bfa" },
  { id: "starry-awe", label: "Starry Awe", accent: "#facc15" },
  { id: "victory-wink", label: "GG Wink", accent: "#4ade80" },
];

export interface AtmosphereOverlayProps {
  theme: ThemeId;
  paused: boolean;
  reducedMotion: boolean;
  musicPlaying: boolean;
  fxQuality?: FxQualityPreset;
  fxDensity?: number;
  fxSpeed?: number;
  fxRainParticles?: boolean;
  fxFlyingObjects?: boolean;
  fxMusicVisualizer?: boolean;
  fxAmbientLights?: boolean;
  fxReactionIcons?: boolean;
}

const QUALITY_SCALE: Record<FxQualityPreset, number> = {
  low: 0.42,
  balanced: 0.78,
  high: 1.15,
  maximum: 1.55,
};

interface RainDrop {
  x: number;
  y: number;
  len: number;
  speed: number;
  alpha: number;
}

interface FloatingParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  phase: number;
  kind: "blue-glow" | "pink" | "nature" | "petal" | "leaf" | "star-decor";
  rot: number;
  vrot: number;
}

interface SmokePuff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  alpha: number;
  life: number;
  maxLife: number;
}

interface FlyingEntity {
  kind: "rocket" | "airplane" | "helicopter" | "bird-flock" | "butterfly";
  x: number;
  y: number;
  baseY: number;
  vx: number;
  dir: 1 | -1;
  size: number;
  phase: number;
  amp: number;
  freq: number;
  primaryColor: string;
  accentColor: string;
  flockCount: number;
  smokeTimer: number;
}

interface ActiveReaction {
  kind: ReactionIconKind;
  x: number;
  y: number;
  age: number;
  maxAge: number;
  phase: number;
  themeAccent: string;
}

function drawRocket(ctx: CanvasRenderingContext2D, e: FlyingEntity, t: number) {
  ctx.save();
  ctx.translate(e.x, e.y);
  const angle = Math.atan2(Math.cos(e.phase) * e.amp * e.freq, Math.abs(e.vx)) * 0.45;
  ctx.scale(e.dir, 1);
  ctx.rotate(angle);
  const s = e.size;

  // Flickering multi-layer engine flame
  const flicker = 0.82 + Math.sin(t * 36 + e.phase) * 0.24;
  ctx.beginPath();
  ctx.moveTo(-s * 0.65, -s * 0.16);
  ctx.lineTo(-s * (1.28 * flicker), 0);
  ctx.lineTo(-s * 0.65, s * 0.16);
  ctx.closePath();
  ctx.fillStyle = "rgba(251, 146, 60, 0.92)";
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(-s * 0.65, -s * 0.08);
  ctx.lineTo(-s * (0.98 * flicker), 0);
  ctx.lineTo(-s * 0.65, s * 0.08);
  ctx.closePath();
  ctx.fillStyle = "rgba(254, 240, 138, 0.96)";
  ctx.fill();

  // Top & bottom fins
  ctx.fillStyle = e.accentColor;
  ctx.beginPath();
  ctx.moveTo(-s * 0.62, -s * 0.22);
  ctx.lineTo(-s * 0.85, -s * 0.48);
  ctx.lineTo(-s * 0.22, -s * 0.22);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(-s * 0.62, s * 0.22);
  ctx.lineTo(-s * 0.85, s * 0.48);
  ctx.lineTo(-s * 0.22, s * 0.22);
  ctx.closePath();
  ctx.fill();

  // Rocket fuselage
  const grad = ctx.createLinearGradient(-s * 0.6, -s * 0.25, s * 0.7, s * 0.25);
  grad.addColorStop(0, e.primaryColor);
  grad.addColorStop(1, "#f8fafc");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(s * 0.82, 0);
  ctx.quadraticCurveTo(s * 0.35, -s * 0.28, -s * 0.62, -s * 0.22);
  ctx.lineTo(-s * 0.62, s * 0.22);
  ctx.quadraticCurveTo(s * 0.35, s * 0.28, s * 0.82, 0);
  ctx.closePath();
  ctx.fill();

  // Nosecone
  ctx.fillStyle = e.accentColor;
  ctx.beginPath();
  ctx.moveTo(s * 0.82, 0);
  ctx.lineTo(s * 0.45, -s * 0.16);
  ctx.lineTo(s * 0.45, s * 0.16);
  ctx.closePath();
  ctx.fill();

  // Glass porthole window
  ctx.beginPath();
  ctx.arc(s * 0.12, 0, s * 0.12, 0, Math.PI * 2);
  ctx.fillStyle = "#38bdf8";
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(255,255,255,0.8)";
  ctx.stroke();

  ctx.restore();
}

function drawAirplane(ctx: CanvasRenderingContext2D, e: FlyingEntity) {
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.scale(e.dir, 1);
  const s = e.size;

  // Subtle contrail
  const trail = ctx.createLinearGradient(-s * 2.8, 0, -s * 0.5, 0);
  trail.addColorStop(0, "rgba(255,255,255,0)");
  trail.addColorStop(1, "rgba(224,242,254,0.32)");
  ctx.strokeStyle = trail;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-s * 2.8, 0);
  ctx.lineTo(-s * 0.6, 0);
  ctx.stroke();

  // Swept wings
  ctx.fillStyle = e.accentColor;
  ctx.beginPath();
  ctx.moveTo(s * 0.15, -s * 0.05);
  ctx.lineTo(-s * 0.32, -s * 0.55);
  ctx.lineTo(-s * 0.48, -s * 0.55);
  ctx.lineTo(-s * 0.15, -s * 0.05);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(s * 0.15, s * 0.05);
  ctx.lineTo(-s * 0.32, s * 0.55);
  ctx.lineTo(-s * 0.48, s * 0.55);
  ctx.lineTo(-s * 0.15, s * 0.05);
  ctx.closePath();
  ctx.fill();

  // Tailfin
  ctx.beginPath();
  ctx.moveTo(-s * 0.52, -s * 0.06);
  ctx.lineTo(-s * 0.74, -s * 0.34);
  ctx.lineTo(-s * 0.64, -s * 0.06);
  ctx.closePath();
  ctx.fill();

  // Fuselage
  ctx.fillStyle = e.primaryColor;
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.68, s * 0.15, 0, 0, Math.PI * 2);
  ctx.fill();

  // Cockpit highlight
  ctx.fillStyle = "#bae6fd";
  ctx.beginPath();
  ctx.ellipse(s * 0.38, -s * 0.03, s * 0.15, s * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawHelicopter(ctx: CanvasRenderingContext2D, e: FlyingEntity, t: number) {
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.scale(e.dir, 1);
  const s = e.size;

  // Tail boom
  ctx.strokeStyle = e.primaryColor;
  ctx.lineWidth = Math.max(2.5, s * 0.12);
  ctx.beginPath();
  ctx.moveTo(-s * 0.15, -s * 0.04);
  ctx.lineTo(-s * 0.85, -s * 0.14);
  ctx.stroke();

  // Spinning tail rotor
  ctx.save();
  ctx.translate(-s * 0.86, -s * 0.14);
  ctx.rotate(t * 22);
  ctx.strokeStyle = "rgba(226, 232, 240, 0.85)";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-s * 0.14, 0);
  ctx.lineTo(s * 0.14, 0);
  ctx.stroke();
  ctx.restore();

  // Landing skids
  ctx.strokeStyle = "rgba(203, 213, 225, 0.8)";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-s * 0.32, s * 0.32);
  ctx.lineTo(s * 0.36, s * 0.32);
  ctx.moveTo(-s * 0.14, s * 0.16);
  ctx.lineTo(-s * 0.14, s * 0.32);
  ctx.moveTo(s * 0.18, s * 0.16);
  ctx.lineTo(s * 0.18, s * 0.32);
  ctx.stroke();

  // Cabin fuselage
  ctx.fillStyle = e.primaryColor;
  ctx.beginPath();
  ctx.ellipse(s * 0.04, 0, s * 0.42, s * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();

  // Glass canopy
  ctx.fillStyle = e.accentColor;
  ctx.beginPath();
  ctx.ellipse(s * 0.22, -s * 0.03, s * 0.18, s * 0.13, 0, -Math.PI * 0.5, Math.PI * 0.45);
  ctx.fill();

  // Rotor mast + animated spinning main rotor blade width
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(s * 0.02, -s * 0.22);
  ctx.lineTo(s * 0.02, -s * 0.36);
  ctx.stroke();

  const bladeSpan = s * (0.25 + Math.abs(Math.sin(t * 26)) * 0.72);
  ctx.strokeStyle = "rgba(248, 250, 252, 0.9)";
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(s * 0.02 - bladeSpan, -s * 0.36);
  ctx.lineTo(s * 0.02 + bladeSpan, -s * 0.36);
  ctx.stroke();

  ctx.restore();
}

function drawBirdFlock(ctx: CanvasRenderingContext2D, e: FlyingEntity, t: number) {
  ctx.save();
  ctx.strokeStyle = e.primaryColor;
  ctx.lineWidth = 1.8;
  ctx.lineCap = "round";
  for (let i = 0; i < e.flockCount; i++) {
    const ox = -i * e.size * 0.9 * e.dir;
    const oy = (i % 2 === 0 ? -1 : 1) * Math.ceil(i / 2) * e.size * 0.55;
    const flap = Math.sin(t * 9 + e.phase + i * 0.7) * e.size * 0.32;
    const bx = e.x + ox;
    const by = e.y + oy;
    const span = e.size * 0.42;
    ctx.beginPath();
    ctx.moveTo(bx - span, by - flap);
    ctx.quadraticCurveTo(bx - span * 0.4, by - span * 0.35 - flap * 0.5, bx, by);
    ctx.quadraticCurveTo(bx + span * 0.4, by - span * 0.35 - flap * 0.5, bx + span, by - flap);
    ctx.stroke();
  }
  ctx.restore();
}

function drawButterfly(ctx: CanvasRenderingContext2D, e: FlyingEntity, t: number) {
  ctx.save();
  ctx.translate(e.x, e.y);
  const flap = 0.28 + Math.abs(Math.sin(t * 11 + e.phase)) * 0.72;
  const s = e.size * 0.55;

  // Left & right wings
  ctx.fillStyle = e.primaryColor;
  ctx.beginPath();
  ctx.ellipse(-s * 0.45 * flap, -s * 0.2, s * 0.55 * flap, s * 0.36, -0.35, 0, Math.PI * 2);
  ctx.ellipse(s * 0.45 * flap, -s * 0.2, s * 0.55 * flap, s * 0.36, 0.35, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = e.accentColor;
  ctx.beginPath();
  ctx.ellipse(-s * 0.35 * flap, s * 0.26, s * 0.36 * flap, s * 0.26, 0.35, 0, Math.PI * 2);
  ctx.ellipse(s * 0.35 * flap, s * 0.26, s * 0.36 * flap, s * 0.26, -0.35, 0, Math.PI * 2);
  ctx.fill();

  // Body
  ctx.fillStyle = "#1e293b";
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.08, s * 0.38, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawReactionIcon(ctx: CanvasRenderingContext2D, r: ActiveReaction, t: number) {
  const progress = r.age / r.maxAge;
  const enter = Math.min(1, r.age / 0.45);
  const exit = progress > 0.78 ? Math.max(0, (1 - progress) / 0.22) : 1;
  const scale = (0.7 + 0.3 * enter) * (0.85 + 0.15 * exit);
  const alpha = Math.min(1, enter) * exit;
  const bobY = Math.sin(t * 3.2 + r.phase) * 6;
  const radius = 21;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(r.x, r.y + bobY);
  ctx.scale(scale, scale);

  // Soft outer theme-aware glow
  ctx.shadowColor = r.themeAccent;
  ctx.shadowBlur = 18;

  // Glossy body sphere
  const grad = ctx.createRadialGradient(-7, -8, 3, 0, 0, radius);
  grad.addColorStop(0, "#ffffff");
  grad.addColorStop(0.32, r.themeAccent);
  grad.addColorStop(1, "#0f172a");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.48)";
  ctx.stroke();

  // Glossy specular top arc
  ctx.fillStyle = "rgba(255, 255, 255, 0.36)";
  ctx.beginPath();
  ctx.ellipse(-4, -10, 10, 4.5, -0.25, 0, Math.PI * 2);
  ctx.fill();

  // Custom illustrated expressions (zero Unicode emojis)
  ctx.strokeStyle = "#0f172a";
  ctx.fillStyle = "#0f172a";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";

  if (r.kind === "cool-shades") {
    ctx.fillStyle = "#090d16";
    ctx.fillRect(-13, -6, 11, 7);
    ctx.fillRect(2, -6, 11, 7);
    ctx.fillRect(-2, -4, 4, 2);
    ctx.beginPath();
    ctx.arc(0, 5, 6, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  } else if (r.kind === "cozy-sleep") {
    ctx.beginPath();
    ctx.arc(-6, -2, 3.5, 0, Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(6, -2, 3.5, 0, Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 7, 2.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (r.kind === "victory-wink") {
    ctx.beginPath();
    ctx.arc(-6, -3, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(3, -3);
    ctx.quadraticCurveTo(7, -6, 10, -2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 4, 7, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.stroke();
  } else if (r.kind === "starry-awe") {
    // Twin star eyes
    for (const ex of [-6.5, 6.5]) {
      ctx.fillStyle = "#fef08a";
      ctx.beginPath();
      ctx.moveTo(ex, -8);
      ctx.lineTo(ex + 2, -4);
      ctx.lineTo(ex + 6, -2);
      ctx.lineTo(ex + 2, 0);
      ctx.lineTo(ex, 4);
      ctx.lineTo(ex - 2, 0);
      ctx.lineTo(ex - 6, -2);
      ctx.lineTo(ex - 2, -4);
      ctx.closePath();
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(0, 8, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = "#0f172a";
    ctx.fill();
  } else if (r.kind === "hype-flame") {
    ctx.beginPath();
    ctx.moveTo(-10, -5);
    ctx.lineTo(-4, -2);
    ctx.moveTo(10, -5);
    ctx.lineTo(4, -2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 6, 6.5, 0, Math.PI);
    ctx.fill();
  } else {
    // sparkle-joy
    ctx.beginPath();
    ctx.arc(-6, -3, 2.6, 0, Math.PI * 2);
    ctx.arc(6, -3, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(244, 114, 182, 0.6)";
    ctx.beginPath();
    ctx.arc(-11, 2, 3, 0, Math.PI * 2);
    ctx.arc(11, 2, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 3, 7, 0.12 * Math.PI, 0.88 * Math.PI);
    ctx.stroke();
  }

  ctx.restore();
}

export const AtmosphereOverlay = memo(function AtmosphereOverlay({
  theme,
  paused,
  reducedMotion,
  musicPlaying,
  fxQuality = "balanced",
  fxDensity = 1.0,
  fxSpeed = 1.0,
  fxRainParticles = true,
  fxFlyingObjects = true,
  fxMusicVisualizer = true,
  fxAmbientLights = true,
  fxReactionIcons = true,
}: AtmosphereOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const propsRef = useRef({
    theme,
    paused,
    reducedMotion,
    musicPlaying,
    fxQuality,
    fxDensity,
    fxSpeed,
    fxRainParticles,
    fxFlyingObjects,
    fxMusicVisualizer,
    fxAmbientLights,
    fxReactionIcons,
  });
  propsRef.current = {
    theme,
    paused,
    reducedMotion,
    musicPlaying,
    fxQuality,
    fxDensity,
    fxSpeed,
    fxRainParticles,
    fxFlyingObjects,
    fxMusicVisualizer,
    fxAmbientLights,
    fxReactionIcons,
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = window.innerWidth;
    let height = window.innerHeight;
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

    // Pooled particle structures (fixed maximum capacities prevent memory leaks)
    const rainPool: RainDrop[] = Array.from({ length: 85 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      len: 12 + Math.random() * 14,
      speed: 380 + Math.random() * 240,
      alpha: 0.16 + Math.random() * 0.26,
    }));

    const kinds: FloatingParticle["kind"][] = [
      "blue-glow",
      "pink",
      "nature",
      "petal",
      "leaf",
      "star-decor",
    ];
    const particlePool: FloatingParticle[] = Array.from({ length: 75 }, (_, i) => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 28,
      vy: 14 + Math.random() * 26,
      r: 2.2 + Math.random() * 4.2,
      phase: Math.random() * Math.PI * 2,
      kind: kinds[i % kinds.length],
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 2.2,
    }));

    const smokePool: SmokePuff[] = [];
    const flyers: FlyingEntity[] = [];
    const reactions: ActiveReaction[] = [];

    let serenityBlend = propsRef.current.theme === "serenity-nature" ? 1 : 0;
    let flyerSpawnTimer = 1.2;
    let reactionSpawnTimer = 5.5;
    let elapsed = 0;
    let lastTs = performance.now();
    let rafId = 0;

    const spawnReaction = (forcedKind?: ReactionIconKind) => {
      if (reactions.length >= 4) return;
      const picked =
        REACTION_ICON_CATALOG.find((r) => r.id === forcedKind) ??
        REACTION_ICON_CATALOG[Math.floor(Math.random() * REACTION_ICON_CATALOG.length)];
      // Spawn cleanly near peripheral right/upper edges so core controls stay unobstructed
      const x = Math.max(280, width - 95 - Math.random() * 140);
      const y = 90 + Math.random() * Math.max(120, height * 0.42);
      reactions.push({
        kind: picked.id,
        x,
        y,
        age: 0,
        maxAge: 6.2,
        phase: Math.random() * Math.PI * 2,
        themeAccent: picked.accent,
      });
    };

    const handleCustomReaction = (ev: Event) => {
      const detail = (ev as CustomEvent<{ kind?: ReactionIconKind }>).detail;
      spawnReaction(detail?.kind);
    };
    window.addEventListener("7xair:spawn-reaction", handleCustomReaction);

    const spawnFlyer = (isSerenity: boolean) => {
      if (flyers.length >= 5) return;
      const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
      const startX = dir === 1 ? -90 : width + 90;
      // Safe-zone flight corridors (upper strip & peripheral mid-edge)
      const baseY = 58 + Math.random() * Math.min(220, height * 0.3);

      if (isSerenity) {
        const isButterfly = Math.random() < 0.72;
        flyers.push({
          kind: isButterfly ? "butterfly" : "bird-flock",
          x: startX,
          y: baseY,
          baseY,
          vx: (isButterfly ? 52 + Math.random() * 35 : 78 + Math.random() * 40) * dir,
          dir,
          size: isButterfly ? 15 + Math.random() * 7 : 14 + Math.random() * 6,
          phase: Math.random() * Math.PI * 2,
          amp: isButterfly ? 22 + Math.random() * 18 : 10,
          freq: isButterfly ? 2.6 : 1.4,
          primaryColor: isButterfly
            ? Math.random() < 0.5
              ? "rgba(244, 114, 182, 0.85)"
              : "rgba(56, 189, 248, 0.82)"
            : "rgba(22, 101, 52, 0.65)",
          accentColor: "rgba(254, 240, 138, 0.85)",
          flockCount: 3 + Math.floor(Math.random() * 3),
          smokeTimer: 0,
        });
        return;
      }

      const roll = Math.random();
      const palettes = [
        ["#ef4444", "#fb923c"],
        ["#38bdf8", "#818cf8"],
        ["#ec4899", "#a855f7"],
        ["#22c55e", "#38bdf8"],
      ];
      const [pCol, aCol] = palettes[Math.floor(Math.random() * palettes.length)];

      if (roll < 0.34) {
        flyers.push({
          kind: "rocket",
          x: startX,
          y: baseY,
          baseY,
          vx: (118 + Math.random() * 68) * dir,
          dir,
          size: 16 + Math.random() * 9,
          phase: Math.random() * Math.PI * 2,
          amp: 14 + Math.random() * 16,
          freq: 1.5,
          primaryColor: pCol,
          accentColor: aCol,
          flockCount: 1,
          smokeTimer: 0,
        });
      } else if (roll < 0.62) {
        flyers.push({
          kind: "airplane",
          x: startX,
          y: baseY,
          baseY,
          vx: (92 + Math.random() * 54) * dir,
          dir,
          size: 17 + Math.random() * 8,
          phase: Math.random() * Math.PI * 2,
          amp: 8,
          freq: 0.9,
          primaryColor: "#e2e8f0",
          accentColor: pCol,
          flockCount: 1,
          smokeTimer: 0,
        });
      } else if (roll < 0.82) {
        flyers.push({
          kind: "helicopter",
          x: startX,
          y: baseY + 12,
          baseY: baseY + 12,
          vx: (68 + Math.random() * 36) * dir,
          dir,
          size: 17 + Math.random() * 6,
          phase: Math.random() * Math.PI * 2,
          amp: 10,
          freq: 1.8,
          primaryColor: pCol,
          accentColor: "#7dd3fc",
          flockCount: 1,
          smokeTimer: 0,
        });
      } else {
        flyers.push({
          kind: "bird-flock",
          x: startX,
          y: baseY,
          baseY,
          vx: (76 + Math.random() * 40) * dir,
          dir,
          size: 13 + Math.random() * 6,
          phase: Math.random() * Math.PI * 2,
          amp: 12,
          freq: 1.4,
          primaryColor: "rgba(186, 230, 253, 0.72)",
          accentColor: "#f472b6",
          flockCount: 3 + Math.floor(Math.random() * 3),
          smokeTimer: 0,
        });
      }
    };

    const tick = (ts: number) => {
      rafId = window.requestAnimationFrame(tick);
      const rawDt = Math.min(0.05, Math.max(0.001, (ts - lastTs) / 1000));
      lastTs = ts;

      const cfg = propsRef.current;
      if (cfg.paused || cfg.reducedMotion) {
        ctx.clearRect(0, 0, width, height);
        return;
      }

      const speedMul = Math.max(0.4, Math.min(2.0, cfg.fxSpeed));
      const densityMul =
        (QUALITY_SCALE[cfg.fxQuality] ?? 0.78) * Math.max(0.25, Math.min(2.0, cfg.fxDensity));
      const dt = rawDt * speedMul;
      elapsed += dt;

      // Smooth environmental transition between Midnight (0) and Serenity (1)
      const targetBlend = cfg.theme === "serenity-nature" ? 1 : 0;
      serenityBlend += (targetBlend - serenityBlend) * Math.min(1, rawDt * 2.4);

      ctx.clearRect(0, 0, width, height);

      // 1. Ambient Light Effects & Corner Swaying Foliage (Serenity)
      if (cfg.fxAmbientLights) {
        if (serenityBlend > 0.04) {
          ctx.save();
          ctx.globalAlpha = serenityBlend * 0.24;
          const sunGrad = ctx.createRadialGradient(
            width * 0.84,
            height * 0.1,
            20,
            width * 0.84,
            height * 0.1,
            width * 0.45
          );
          sunGrad.addColorStop(0, "rgba(254, 240, 138, 0.7)");
          sunGrad.addColorStop(0.5, "rgba(253, 224, 71, 0.2)");
          sunGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
          ctx.fillStyle = sunGrad;
          ctx.fillRect(0, 0, width, height);

          // Gentle swaying corner foliage branches
          const sway = Math.sin(elapsed * 1.1) * 7;
          ctx.strokeStyle = "rgba(22, 163, 74, 0.26)";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(width, 0);
          ctx.quadraticCurveTo(width - 80, 48 + sway, width - 165, 34 + sway * 1.4);
          ctx.stroke();
          ctx.restore();
        }
        if (serenityBlend < 0.96) {
          ctx.save();
          ctx.globalAlpha = (1 - serenityBlend) * 0.14;
          const sweepX = width * (0.5 + Math.sin(elapsed * 0.35) * 0.32);
          const lightGrad = ctx.createRadialGradient(sweepX, 60, 10, sweepX, 60, 320);
          lightGrad.addColorStop(0, "rgba(96, 165, 250, 0.55)");
          lightGrad.addColorStop(0.6, "rgba(236, 72, 153, 0.18)");
          lightGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
          ctx.fillStyle = lightGrad;
          ctx.fillRect(0, 0, width, height);
          ctx.restore();
        }
      }

      // 2. Raindrops (Midnight) & Floating Particles / Petals / Leaves
      if (cfg.fxRainParticles) {
        const rainCount = Math.min(rainPool.length, Math.round(42 * densityMul));
        if (serenityBlend < 0.92) {
          ctx.save();
          ctx.strokeStyle = "rgba(96, 165, 250, 0.42)";
          ctx.lineWidth = 1.2;
          for (let i = 0; i < rainCount; i++) {
            const d = rainPool[i];
            d.y += d.speed * dt;
            d.x -= d.speed * 0.14 * dt;
            if (d.y > height + 20) {
              d.y = -20;
              d.x = Math.random() * (width + 140);
            }
            ctx.globalAlpha = d.alpha * (1 - serenityBlend);
            ctx.beginPath();
            ctx.moveTo(d.x, d.y);
            ctx.lineTo(d.x - d.len * 0.16, d.y + d.len);
            ctx.stroke();
          }
          ctx.restore();
        }

        const pCount = Math.min(particlePool.length, Math.round(46 * densityMul));
        for (let i = 0; i < pCount; i++) {
          const pt = particlePool[i];
          pt.phase += dt * 1.4;
          pt.rot += pt.vrot * dt;
          pt.x += (pt.vx + Math.sin(pt.phase) * 14) * dt;
          pt.y += pt.vy * dt;
          if (pt.y > height + 24) {
            pt.y = -18;
            pt.x = Math.random() * width;
          }
          if (pt.x < -24) pt.x = width + 20;
          if (pt.x > width + 24) pt.x = -20;

          if (serenityBlend > 0.5) {
            // Falling pink cherry blossom petals, green leaves & nature motes
            ctx.save();
            ctx.translate(pt.x, pt.y);
            ctx.rotate(pt.rot);
            ctx.globalAlpha = 0.65 * serenityBlend;
            if (i % 3 === 0) {
              // Pink petal
              ctx.fillStyle = "#f9a8d4";
              ctx.beginPath();
              ctx.ellipse(0, 0, pt.r * 1.6, pt.r * 0.85, 0, 0, Math.PI * 2);
              ctx.fill();
            } else if (i % 3 === 1) {
              // Green leaf with natural rotation
              ctx.fillStyle = "#22c55e";
              ctx.beginPath();
              ctx.moveTo(-pt.r * 1.8, 0);
              ctx.quadraticCurveTo(0, -pt.r * 1.2, pt.r * 1.8, 0);
              ctx.quadraticCurveTo(0, pt.r * 1.2, -pt.r * 1.8, 0);
              ctx.fill();
            } else {
              // Golden floating nature mote
              ctx.fillStyle = "rgba(253, 224, 71, 0.72)";
              ctx.beginPath();
              ctx.arc(0, 0, pt.r * 0.6, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.restore();
          } else {
            // Floating glowing blue, pink & decorative star particles
            ctx.save();
            ctx.globalAlpha = (0.35 + Math.sin(pt.phase) * 0.2) * (1 - serenityBlend);
            if (pt.kind === "pink") {
              ctx.fillStyle = "#f472b6";
              ctx.beginPath();
              ctx.arc(pt.x, pt.y, pt.r * 0.85, 0, Math.PI * 2);
              ctx.fill();
            } else if (pt.kind === "star-decor") {
              ctx.translate(pt.x, pt.y);
              ctx.rotate(pt.rot * 0.4);
              ctx.fillStyle = "#bae6fd";
              ctx.beginPath();
              const s = pt.r * 1.3;
              ctx.moveTo(0, -s);
              ctx.lineTo(s * 0.3, -s * 0.3);
              ctx.lineTo(s, 0);
              ctx.lineTo(s * 0.3, s * 0.3);
              ctx.lineTo(0, s);
              ctx.lineTo(-s * 0.3, s * 0.3);
              ctx.lineTo(-s, 0);
              ctx.lineTo(-s * 0.3, -s * 0.3);
              ctx.closePath();
              ctx.fill();
            } else {
              ctx.fillStyle = "#60a5fa";
              ctx.beginPath();
              ctx.arc(pt.x, pt.y, pt.r * 0.9, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.restore();
          }
        }
      }

      // 3. Flying Object System + Rocket Smoke Trail Pool
      if (cfg.fxFlyingObjects) {
        flyerSpawnTimer -= dt;
        const spawnInterval = Math.max(2.2, 5.2 / Math.max(0.5, densityMul));
        if (flyerSpawnTimer <= 0) {
          spawnFlyer(serenityBlend > 0.5);
          flyerSpawnTimer = spawnInterval * (0.75 + Math.random() * 0.5);
        }

        for (let i = flyers.length - 1; i >= 0; i--) {
          const e = flyers[i];
          e.phase += dt * e.freq;
          e.x += e.vx * dt;
          e.y = e.baseY + Math.sin(e.phase) * e.amp;

          if (e.kind === "rocket") {
            e.smokeTimer += dt;
            if (e.smokeTimer >= 0.045 && smokePool.length < 90) {
              e.smokeTimer = 0;
              smokePool.push({
                x: e.x - e.dir * e.size * 0.95,
                y: e.y + (Math.random() - 0.5) * 4,
                vx: -e.dir * (18 + Math.random() * 14),
                vy: (Math.random() - 0.5) * 12,
                r: 3 + Math.random() * 3,
                alpha: 0.48,
                life: 0,
                maxLife: 0.95,
              });
            }
            drawRocket(ctx, e, elapsed);
          } else if (e.kind === "airplane") {
            drawAirplane(ctx, e);
          } else if (e.kind === "helicopter") {
            drawHelicopter(ctx, e, elapsed);
          } else if (e.kind === "bird-flock") {
            drawBirdFlock(ctx, e, elapsed);
          } else if (e.kind === "butterfly") {
            drawButterfly(ctx, e, elapsed);
          }

          if (e.x < -160 || e.x > width + 160) {
            flyers.splice(i, 1);
          }
        }

        // Update & draw rocket smoke trails
        for (let i = smokePool.length - 1; i >= 0; i--) {
          const sm = smokePool[i];
          sm.life += dt;
          if (sm.life >= sm.maxLife) {
            smokePool.splice(i, 1);
            continue;
          }
          sm.x += sm.vx * dt;
          sm.y += sm.vy * dt;
          sm.r += 9 * dt;
          const a = sm.alpha * (1 - sm.life / sm.maxLife);
          ctx.fillStyle = `rgba(226, 232, 240, ${a.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(sm.x, sm.y, sm.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 4. Subtle Bottom-Edge Animated Music Visualizer Bars (Midnight / Active Music)
      if (cfg.fxMusicVisualizer && (cfg.musicPlaying || serenityBlend < 0.85)) {
        const barCount = 24;
        const barW = 4;
        const gap = 5;
        const totalW = barCount * (barW + gap);
        const startX = Math.max(255, width - totalW - 28);
        const baseY = height - 10;
        const ampBoost = cfg.musicPlaying ? 1.0 : 0.32;
        ctx.save();
        ctx.globalAlpha = cfg.musicPlaying ? 0.52 : 0.22;
        for (let b = 0; b < barCount; b++) {
          const wave =
            0.25 +
            0.75 *
              Math.abs(
                Math.sin(elapsed * (3.2 + (b % 4) * 0.7) + b * 0.55) *
                  Math.cos(elapsed * 1.9 + b * 0.25)
              );
          const h = 4 + wave * 28 * ampBoost;
          const barGrad = ctx.createLinearGradient(0, baseY - h, 0, baseY);
          barGrad.addColorStop(0, "#ec4899");
          barGrad.addColorStop(1, "#38bdf8");
          ctx.fillStyle = barGrad;
          ctx.fillRect(startX + b * (barW + gap), baseY - h, barW, h);
        }
        ctx.restore();
      }

      // 5. Original Glossy Animated Reaction Icons
      if (cfg.fxReactionIcons) {
        reactionSpawnTimer -= dt;
        if (reactionSpawnTimer <= 0) {
          spawnReaction();
          reactionSpawnTimer = 11 + Math.random() * 8;
        }
        for (let i = reactions.length - 1; i >= 0; i--) {
          const r = reactions[i];
          r.age += dt;
          if (r.age >= r.maxAge) {
            reactions.splice(i, 1);
            continue;
          }
          drawReactionIcon(ctx, r, elapsed);
        }
      }
    };

    rafId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("7xair:spawn-reaction", handleCustomReaction);
    };
  }, []);

  if (reducedMotion || paused) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="atmosphere-fx-canvas"
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        pointerEvents: "none",
        zIndex: 32,
      }}
    />
  );
});
