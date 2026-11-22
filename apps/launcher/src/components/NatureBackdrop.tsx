import { memo, useEffect, useState } from "react";
import { resolveWallpaperUrl } from "../theme/themes";
import type { CustomWallpaperItem, ThemeId, WallpaperFitMode, WallpaperPosition } from "../types/launcher";

interface NatureBackdropProps {
  theme: ThemeId;
  wallpaperId?: string;
  wallpaperDim?: number;
  wallpaperFit?: WallpaperFitMode;
  wallpaperPosition?: WallpaperPosition;
  wallpaperBrightness?: number;
  wallpaperBlur?: number;
  wallpaperSaturation?: number;
  wallpaperContrast?: number;
  customWallpapers?: CustomWallpaperItem[];
  backgroundAnimations?: boolean;
  particleEffects?: boolean;
  paused?: boolean;
}

interface ScenePalette {
  skyTop: string;
  skyMid: string;
  skyHorizon: string;
  sunColor: string;
  sunGlow: string;
  farMountain: string;
  midMountain: string;
  nearMountain: string;
  forestSilhouette: string;
  riverBase: string;
  riverHighlight: string;
  particleType: "mist" | "sakura" | "snow" | "fireflies" | "serenity";
  particleColor: string;
}

const SCENES: Record<ThemeId, ScenePalette> = {
  "obsidian-violet": {
    skyTop: "#05040a",
    skyMid: "#140b24",
    skyHorizon: "#2a1026",
    sunColor: "#d8b4fe",
    sunGlow: "rgba(139, 92, 246, 0.42)",
    farMountain: "#1b1033",
    midMountain: "#130b24",
    nearMountain: "#0b0716",
    forestSilhouette: "#06040c",
    riverBase: "#5b21b6",
    riverHighlight: "#f43f5e",
    particleType: "fireflies",
    particleColor: "rgba(167, 139, 250, 0.55)",
  },
  "midnight-sky": {
    skyTop: "#04070e",
    skyMid: "#0a1930",
    skyHorizon: "#0e3054",
    sunColor: "#bae6fd",
    sunGlow: "rgba(56, 189, 248, 0.4)",
    farMountain: "#0f294a",
    midMountain: "#0a1c36",
    nearMountain: "#061224",
    forestSilhouette: "#040a14",
    riverBase: "#0284c7",
    riverHighlight: "#38bdf8",
    particleType: "mist",
    particleColor: "rgba(56, 189, 248, 0.45)",
  },
  "azure-mountains": {
    skyTop: "#0a1c3a",
    skyMid: "#143b6b",
    skyHorizon: "#2a6ea6",
    sunColor: "#b8ebff",
    sunGlow: "rgba(86, 204, 242, 0.35)",
    farMountain: "#183e6d",
    midMountain: "#122f55",
    nearMountain: "#0c213d",
    forestSilhouette: "#071529",
    riverBase: "#1e6fa8",
    riverHighlight: "#7de2fc",
    particleType: "mist",
    particleColor: "rgba(186, 236, 255, 0.35)",
  },
  "sakura-valley": {
    skyTop: "#241023",
    skyMid: "#4d2043",
    skyHorizon: "#8e446b",
    sunColor: "#ffd6eb",
    sunGlow: "rgba(249, 168, 212, 0.38)",
    farMountain: "#532548",
    midMountain: "#3c1934",
    nearMountain: "#281024",
    forestSilhouette: "#1a0917",
    riverBase: "#6d325b",
    riverHighlight: "#fbcfe8",
    particleType: "sakura",
    particleColor: "#fbcfe8",
  },
  "emerald-wilderness": {
    skyTop: "#081c16",
    skyMid: "#124031",
    skyHorizon: "#246e52",
    sunColor: "#c8fadf",
    sunGlow: "rgba(74, 222, 128, 0.32)",
    farMountain: "#174836",
    midMountain: "#103628",
    nearMountain: "#0a241a",
    forestSilhouette: "#051610",
    riverBase: "#166855",
    riverHighlight: "#6ee7b7",
    particleType: "mist",
    particleColor: "rgba(167, 243, 208, 0.32)",
  },
  "frozen-peaks": {
    skyTop: "#0b1a2e",
    skyMid: "#1a3c5e",
    skyHorizon: "#4b7da8",
    sunColor: "#e6f4ff",
    sunGlow: "rgba(186, 230, 253, 0.42)",
    farMountain: "#2d5278",
    midMountain: "#1e3a57",
    nearMountain: "#13263b",
    forestSilhouette: "#0a1726",
    riverBase: "#3b76a8",
    riverHighlight: "#e0f2fe",
    particleType: "snow",
    particleColor: "#e0f2fe",
  },
  "sunset-horizon": {
    skyTop: "#221014",
    skyMid: "#6b281d",
    skyHorizon: "#c96228",
    sunColor: "#ffe0a3",
    sunGlow: "rgba(251, 146, 60, 0.48)",
    farMountain: "#5d261d",
    midMountain: "#3d1815",
    nearMountain: "#260f0f",
    forestSilhouette: "#170808",
    riverBase: "#9c471b",
    riverHighlight: "#fcd34d",
    particleType: "mist",
    particleColor: "rgba(254, 215, 170, 0.3)",
  },
  "midnight-forest": {
    skyTop: "#040713",
    skyMid: "#0c1533",
    skyHorizon: "#1c2d5e",
    sunColor: "#e0e7ff",
    sunGlow: "rgba(129, 140, 248, 0.35)",
    farMountain: "#131f47",
    midMountain: "#0c1532",
    nearMountain: "#070d21",
    forestSilhouette: "#040814",
    riverBase: "#1d3269",
    riverHighlight: "#a5b4fc",
    particleType: "fireflies",
    particleColor: "#a5b4fc",
  },
  "midnight-anime": {
    skyTop: "#040610",
    skyMid: "#0c1430",
    skyHorizon: "#1e1640",
    sunColor: "#93c5fd",
    sunGlow: "rgba(96, 165, 250, 0.36)",
    farMountain: "#111b3d",
    midMountain: "#0a112a",
    nearMountain: "#060918",
    forestSilhouette: "#040610",
    riverBase: "#2563eb",
    riverHighlight: "#ec4899",
    particleType: "fireflies",
    particleColor: "rgba(147, 197, 253, 0.55)",
  },
  "serenity-nature": {
    skyTop: "#f0fdf4",
    skyMid: "#dcfce7",
    skyHorizon: "#fce7f3",
    sunColor: "#fef08a",
    sunGlow: "rgba(253, 224, 71, 0.42)",
    farMountain: "#86efac",
    midMountain: "#4ade80",
    nearMountain: "#22c55e",
    forestSilhouette: "#15803d",
    riverBase: "#38bdf8",
    riverHighlight: "#f9a8d4",
    particleType: "serenity",
    particleColor: "rgba(244, 114, 182, 0.72)",
  },
  "anime-glass": {
    skyTop: "#090716",
    skyMid: "#1a1138",
    skyHorizon: "#31164a",
    sunColor: "#e879f9",
    sunGlow: "rgba(168, 85, 247, 0.4)",
    farMountain: "#23144a",
    midMountain: "#160d30",
    nearMountain: "#0c071c",
    forestSilhouette: "#070411",
    riverBase: "#7c3aed",
    riverHighlight: "#38bdf8",
    particleType: "fireflies",
    particleColor: "rgba(192, 132, 252, 0.58)",
  },
  "dreamy-anime": {
    skyTop: "#1a1433",
    skyMid: "#412b6b",
    skyHorizon: "#87538e",
    sunColor: "#fde6ff",
    sunGlow: "rgba(196, 181, 253, 0.4)",
    farMountain: "#4a3375",
    midMountain: "#322154",
    nearMountain: "#21153a",
    forestSilhouette: "#140c24",
    riverBase: "#5a3d8a",
    riverHighlight: "#f5d0fe",
    particleType: "sakura",
    particleColor: "#e9d5ff",
  },
};

const PARTICLES = [
  { left: "9%", delay: "0s", dur: "15s", size: 5 },
  { left: "22%", delay: "-4s", dur: "18s", size: 4 },
  { left: "36%", delay: "-9s", dur: "16s", size: 5 },
  { left: "51%", delay: "-2s", dur: "20s", size: 4 },
  { left: "67%", delay: "-7s", dur: "17s", size: 5 },
  { left: "81%", delay: "-11s", dur: "19s", size: 4 },
  { left: "92%", delay: "-5s", dur: "16s", size: 5 },
];

export const NatureBackdrop = memo(function NatureBackdrop({
  theme,
  wallpaperId = "auto",
  wallpaperDim = 0.56,
  wallpaperFit = "cover",
  wallpaperPosition = "center",
  wallpaperBrightness = 1.0,
  wallpaperBlur = 0,
  wallpaperSaturation = 1.08,
  wallpaperContrast = 1.04,
  customWallpapers = [],
  backgroundAnimations = true,
  particleEffects = true,
  paused = false,
}: NatureBackdropProps) {
  const wallpaperUrl = resolveWallpaperUrl(wallpaperId, theme, customWallpapers);
  const isLightTheme = theme === "serenity-nature";
  const bgSize =
    wallpaperFit === "contain" ? "contain" : wallpaperFit === "center" ? "auto" : "cover";
  const [sceneMounted, setSceneMounted] = useState(false);
  const [fadeIn, setFadeIn] = useState(true);
  const p = SCENES[theme] ?? SCENES["obsidian-violet"];

  // Lazy-mount SVG scene on the next idle frame so startup paints instantaneously
  useEffect(() => {
    const id = window.requestAnimationFrame(() => setSceneMounted(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  // Smooth fade transition when switching between the 7 nature themes
  useEffect(() => {
    if (!backgroundAnimations) {
      setFadeIn(true);
      return;
    }
    setFadeIn(false);
    const id = window.requestAnimationFrame(() => setFadeIn(true));
    return () => window.cancelAnimationFrame(id);
  }, [theme, backgroundAnimations]);

  return (
    <div
      className="nature-backdrop"
      aria-hidden="true"
      style={{
        background: `linear-gradient(180deg, ${p.skyTop} 0%, ${p.skyMid} 52%, ${p.skyHorizon} 100%)`,
      }}
    >
      {sceneMounted && (
        <svg
          className="nature-svg"
          viewBox="0 0 1440 900"
          preserveAspectRatio="xMidYMid slice"
          style={{
            opacity: fadeIn ? 1 : 0.72,
            transition: backgroundAnimations ? "opacity 380ms ease" : "none",
          }}
        >
          <defs>
            <linearGradient id={`sky-${theme}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={p.skyTop} />
              <stop offset="52%" stopColor={p.skyMid} />
              <stop offset="100%" stopColor={p.skyHorizon} />
            </linearGradient>
            <radialGradient id={`glow-${theme}`} cx="74%" cy="28%" r="34%">
              <stop offset="0%" stopColor={p.sunGlow} />
              <stop offset="100%" stopColor="rgba(0,0,0,0)" />
            </radialGradient>
            <linearGradient id={`river-${theme}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={p.riverHighlight} stopOpacity="0.6" />
              <stop offset="50%" stopColor={p.riverBase} stopOpacity="0.88" />
              <stop offset="100%" stopColor={p.riverHighlight} stopOpacity="0.45" />
            </linearGradient>
          </defs>

          <rect width="1440" height="900" fill={`url(#sky-${theme})`} />
          <rect width="1440" height="900" fill={`url(#glow-${theme})`} />
          <circle cx="1068" cy="242" r="54" fill={p.sunColor} opacity="0.88" />

          <path
            d="M0 320 Q210 285 420 315 T860 305 T1440 318 L1440 440 L0 440 Z"
            fill={p.sunColor}
            opacity="0.08"
          />

          <path
            d="M0 540 L180 410 L350 485 L560 355 L780 470 L1020 330 L1240 445 L1440 375 L1440 900 L0 900 Z"
            fill={p.farMountain}
          />
          <path
            d="M0 610 L140 500 L310 565 L490 455 L700 570 L930 440 L1150 555 L1340 480 L1440 530 L1440 900 L0 900 Z"
            fill={p.midMountain}
          />
          <path
            d="M0 660 Q280 595 560 665 T1120 635 T1440 670 L1440 900 L0 900 Z"
            fill={p.nearMountain}
          />
          <path
            d="M660 655 C740 675 610 730 710 770 C810 810 640 865 770 900 L1030 900 C880 860 980 805 860 760 C750 718 820 678 725 655 Z"
            fill={`url(#river-${theme})`}
          />
          <path
            d="M0 735 L45 685 L85 730 L130 675 L175 728 L225 692 L270 742 L340 720 L405 760 L0 900 Z"
            fill={p.forestSilhouette}
          />
          <path
            d="M1440 725 L1390 670 L1345 720 L1295 668 L1245 722 L1190 684 L1140 738 L1070 725 L1015 775 L1440 900 Z"
            fill={p.forestSilhouette}
          />
          <rect x="0" y="868" width="1440" height="32" fill={p.forestSilhouette} opacity="0.65" />
        </svg>
      )}

      {/* Anime Wallpaper Background Layer with Full Fit, Position, Filter & Readability Scrim */}
      {wallpaperUrl && (
        <>
          <div
            className="anime-wallpaper-layer"
            style={{
              backgroundImage: `url("${wallpaperUrl}")`,
              backgroundSize: bgSize,
              backgroundPosition: wallpaperPosition,
              filter: `brightness(${wallpaperBrightness.toFixed(2)}) blur(${wallpaperBlur.toFixed(
                1
              )}px) saturate(${wallpaperSaturation.toFixed(2)}) contrast(${wallpaperContrast.toFixed(
                2
              )})`,
            }}
          />
          <div
            className="anime-wallpaper-scrim"
            style={{
              background: isLightTheme
                ? `radial-gradient(circle at 75% 15%, rgba(254, 249, 195, ${Math.max(
                    0.18,
                    wallpaperDim * 0.45
                  ).toFixed(2)}), rgba(255, 255, 255, ${Math.min(0.82, wallpaperDim).toFixed(
                    2
                  )}) 78%)`
                : `radial-gradient(circle at 50% 35%, rgba(6, 8, 16, ${Math.max(
                    0.2,
                    wallpaperDim - 0.14
                  ).toFixed(2)}), rgba(5, 7, 14, ${Math.min(0.92, wallpaperDim + 0.18).toFixed(
                    2
                  )}) 82%)`,
            }}
          />
        </>
      )}

      {/* Subtle Environmental Lighting (disabled when paused or turned off) */}
      {backgroundAnimations && !paused && <div className="nature-ambient-light" />}

      {/* Lightweight Floating Particles (unmounted when disabled or paused) */}
      {particleEffects && !paused && (
        <div className={`nature-particles nature-particles--${p.particleType}`}>
          {PARTICLES.map((pt, idx) => (
            <span
              key={idx}
              className="nature-particle"
              style={{
                left: pt.left,
                width: pt.size,
                height:
                  p.particleType === "sakura" || p.particleType === "serenity"
                    ? pt.size * 1.45
                    : pt.size,
                background:
                  p.particleType === "serenity"
                    ? idx % 2 === 0
                      ? "rgba(244, 114, 182, 0.78)"
                      : "rgba(34, 197, 94, 0.72)"
                    : p.particleColor,
                animationDelay: pt.delay,
                animationDuration: pt.dur,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
});
