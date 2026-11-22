export interface FontOption {
  family: string;
  category: "sans" | "display" | "mono";
  license: string;
  weights: number[];
  fallback: string;
}

// 27 Verified Open-Licensed Fonts (Google Fonts SIL OFL / Apache 2.0)
export const FONT_LIBRARY: readonly FontOption[] = [
  { family: "Inter", category: "sans", license: "SIL OFL 1.1", weights: [300, 400, 500, 600, 700, 800], fallback: "system-ui, sans-serif" },
  { family: "Manrope", category: "sans", license: "SIL OFL 1.1", weights: [300, 400, 500, 600, 700, 800], fallback: "system-ui, sans-serif" },
  { family: "Plus Jakarta Sans", category: "sans", license: "SIL OFL 1.1", weights: [400, 500, 600, 700, 800], fallback: "system-ui, sans-serif" },
  { family: "DM Sans", category: "sans", license: "SIL OFL 1.1", weights: [400, 500, 600, 700], fallback: "system-ui, sans-serif" },
  { family: "Outfit", category: "display", license: "SIL OFL 1.1", weights: [300, 400, 500, 600, 700, 800], fallback: "system-ui, sans-serif" },
  { family: "Sora", category: "display", license: "SIL OFL 1.1", weights: [300, 400, 500, 600, 700, 800], fallback: "system-ui, sans-serif" },
  { family: "Space Grotesk", category: "display", license: "SIL OFL 1.1", weights: [400, 500, 600, 700], fallback: "system-ui, sans-serif" },
  { family: "Urbanist", category: "sans", license: "SIL OFL 1.1", weights: [300, 400, 500, 600, 700, 800], fallback: "system-ui, sans-serif" },
  { family: "Rubik", category: "sans", license: "SIL OFL 1.1", weights: [400, 500, 600, 700, 800], fallback: "system-ui, sans-serif" },
  { family: "Nunito Sans", category: "sans", license: "SIL OFL 1.1", weights: [300, 400, 600, 700, 800], fallback: "system-ui, sans-serif" },
  { family: "Poppins", category: "sans", license: "SIL OFL 1.1", weights: [300, 400, 500, 600, 700, 800], fallback: "system-ui, sans-serif" },
  { family: "Montserrat", category: "display", license: "SIL OFL 1.1", weights: [400, 500, 600, 700, 800], fallback: "system-ui, sans-serif" },
  { family: "Lato", category: "sans", license: "SIL OFL 1.1", weights: [300, 400, 700, 900], fallback: "system-ui, sans-serif" },
  { family: "Roboto", category: "sans", license: "Apache 2.0", weights: [300, 400, 500, 700], fallback: "system-ui, sans-serif" },
  { family: "Open Sans", category: "sans", license: "SIL OFL 1.1", weights: [400, 500, 600, 700, 800], fallback: "system-ui, sans-serif" },
  { family: "IBM Plex Sans", category: "sans", license: "SIL OFL 1.1", weights: [300, 400, 500, 600, 700], fallback: "system-ui, sans-serif" },
  { family: "Source Sans 3", category: "sans", license: "SIL OFL 1.1", weights: [300, 400, 600, 700, 800], fallback: "system-ui, sans-serif" },
  { family: "Geist", category: "sans", license: "SIL OFL 1.1", weights: [300, 400, 500, 600, 700, 800], fallback: "system-ui, sans-serif" },
  { family: "Fira Sans", category: "sans", license: "SIL OFL 1.1", weights: [300, 400, 500, 600, 700], fallback: "system-ui, sans-serif" },
  { family: "Work Sans", category: "sans", license: "SIL OFL 1.1", weights: [300, 400, 500, 600, 700, 800], fallback: "system-ui, sans-serif" },
  { family: "Lexend", category: "sans", license: "SIL OFL 1.1", weights: [300, 400, 500, 600, 700], fallback: "system-ui, sans-serif" },
  { family: "Exo 2", category: "display", license: "SIL OFL 1.1", weights: [400, 500, 600, 700, 800], fallback: "system-ui, sans-serif" },
  { family: "Rajdhani", category: "display", license: "SIL OFL 1.1", weights: [400, 500, 600, 700], fallback: "system-ui, sans-serif" },
  { family: "Oxanium", category: "display", license: "SIL OFL 1.1", weights: [400, 500, 600, 700, 800], fallback: "system-ui, sans-serif" },
  { family: "JetBrains Mono", category: "mono", license: "SIL OFL 1.1", weights: [400, 500, 600, 700], fallback: "ui-monospace, monospace" },
  { family: "Fira Code", category: "mono", license: "SIL OFL 1.1", weights: [400, 500, 600, 700], fallback: "ui-monospace, monospace" },
  { family: "Space Mono", category: "mono", license: "SIL OFL 1.1", weights: [400, 700], fallback: "ui-monospace, monospace" },
] as const;

export interface CustomColorPalette {
  enabled: boolean;
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  surface: string;
  card: string;
  border: string;
  heading: string;
  bodyText: string;
  button: string;
  hover: string;
  activeState: string;
  customGradient: string;
}

export interface CustomThemePreset {
  id: string;
  name: string;
  baseThemeId: string;
  colors: CustomColorPalette;
  createdAtEpoch: number;
}

export interface TextCustomization {
  globalFont: string;
  headingFont: string;
  bodyFont: string;
  customFontName: string | null;
  customFontDataUrl: string | null;
  customFontSizePx: number;
  headingScale: number;
  bodyScale: number;
  fontWeight: number;
  lineHeight: number;
  letterSpacingEm: number;
  textColor: string;
  textOpacity: number;
  textGlowPx: number;
  textShadowPx: number;
  gradientHeadings: boolean;
}

export interface AnimationCustomization {
  speed: number;
  intensity: number;
  hoverAnimation: boolean;
  pageTransitions: boolean;
  buttonTransitions: boolean;
  backgroundTransitions: boolean;
  particleDensity: number;
  flyingObjectFrequency: number;
  rocketFrequency: number;
  airplaneFrequency: number;
  helicopterFrequency: number;
  birdFrequency: number;
  rainIntensity: number;
  fallingLeafIntensity: number;
  animatedIconIntensity: number;
  wallpaperTransitionSec: number;
}

export type SoundPackId = "metallic-pro" | "glass-chime" | "cyber-pulse" | "soft-nature";

export interface AudioCustomization {
  muted?: boolean;
  hoverSound: boolean;
  clickSound: boolean;
  toggleSound: boolean;
  notificationSound: boolean;
  soundPack: SoundPackId;
  volume: number;
}

export interface CustomizationState {
  schemaVersion: number;
  activeCustomThemeId: string | null;
  customThemes: CustomThemePreset[];
  text: TextCustomization;
  colors: CustomColorPalette;
  animations: AnimationCustomization;
  audio: AudioCustomization;
}

export const DEFAULT_CUSTOMIZATION: CustomizationState = {
  schemaVersion: 1,
  activeCustomThemeId: null,
  customThemes: [],
  text: {
    globalFont: "Plus Jakarta Sans",
    headingFont: "Space Grotesk",
    bodyFont: "Plus Jakarta Sans",
    customFontName: null,
    customFontDataUrl: null,
    customFontSizePx: 14,
    headingScale: 1.0,
    bodyScale: 1.0,
    fontWeight: 500,
    lineHeight: 1.55,
    letterSpacingEm: 0,
    textColor: "#f8fafc",
    textOpacity: 1.0,
    textGlowPx: 14,
    textShadowPx: 2,
    gradientHeadings: false,
  },
  colors: {
    enabled: false,
    primary: "#8b5cf6",
    secondary: "#ef4444",
    accent: "#38bdf8",
    background: "#070912",
    surface: "#0d111e",
    card: "#111626",
    border: "#334155",
    heading: "#ffffff",
    bodyText: "#e2e8f0",
    button: "#ef4444",
    hover: "#f87171",
    activeState: "#60a5fa",
    customGradient: "linear-gradient(135deg, #8b5cf6, #ef4444)",
  },
  animations: {
    speed: 1.0,
    intensity: 1.0,
    hoverAnimation: true,
    pageTransitions: true,
    buttonTransitions: true,
    backgroundTransitions: true,
    particleDensity: 1.0,
    flyingObjectFrequency: 1.0,
    rocketFrequency: 1.0,
    airplaneFrequency: 1.0,
    helicopterFrequency: 1.0,
    birdFrequency: 1.0,
    rainIntensity: 1.0,
    fallingLeafIntensity: 1.0,
    animatedIconIntensity: 1.0,
    wallpaperTransitionSec: 0.45,
  },
  audio: {
    muted: false,
    hoverSound: true,
    clickSound: true,
    toggleSound: true,
    notificationSound: true,
    soundPack: "metallic-pro",
    volume: 0.45,
  },
};

export function migrateCustomization(raw: Record<string, unknown> | null | undefined): CustomizationState {
  if (!raw || typeof raw !== "object") return structuredClone(DEFAULT_CUSTOMIZATION);
  return {
    schemaVersion: 1,
    activeCustomThemeId:
      typeof raw.activeCustomThemeId === "string" ? raw.activeCustomThemeId : null,
    customThemes: Array.isArray(raw.customThemes)
      ? (raw.customThemes as CustomThemePreset[])
      : [],
    text: { ...DEFAULT_CUSTOMIZATION.text, ...((raw.text as Partial<TextCustomization>) ?? {}) },
    colors: { ...DEFAULT_CUSTOMIZATION.colors, ...((raw.colors as Partial<CustomColorPalette>) ?? {}) },
    animations: {
      ...DEFAULT_CUSTOMIZATION.animations,
      ...((raw.animations as Partial<AnimationCustomization>) ?? {}),
    },
    audio: { ...DEFAULT_CUSTOMIZATION.audio, ...((raw.audio as Partial<AudioCustomization>) ?? {}) },
  };
}

// ---------- Dynamic Google Font & Custom FontFace Loader ----------

const loadedGoogleFonts = new Set<string>();

export function ensureFontLoaded(family: string): void {
  if (!family || typeof document === "undefined") return;
  const entry = FONT_LIBRARY.find((f) => f.family === family);
  if (!entry || loadedGoogleFonts.has(family)) return;
  loadedGoogleFonts.add(family);
  const encoded = family.replace(/ /g, "+");
  const weights = entry.weights.join(";");
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${encoded}:wght@${weights}&display=swap`;
  document.head.appendChild(link);
}

export async function registerCustomFontFace(name: string, dataUrl: string): Promise<void> {
  if (typeof document === "undefined" || typeof FontFace === "undefined") return;
  const face = new FontFace(name, `url(${dataUrl})`);
  const loaded = await face.load();
  document.fonts.add(loaded);
}

// ---------- HEX / RGB / HSL Parser & WCAG Contrast Calculator ----------

export function parseColorToHex(input: string): string | null {
  const s = input.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toLowerCase();
  }
  const rgb = s.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);
  if (rgb) {
    const [r, g, b] = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])].map((v) =>
      Math.max(0, Math.min(255, v))
    );
    return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  }
  const hsl = s.match(/^hsl\(\s*(\d{1,3})\s*,\s*(\d{1,3})%\s*,\s*(\d{1,3})%\s*\)$/i);
  if (hsl) {
    const h = (Number(hsl[1]) % 360) / 360;
    const sat = Math.max(0, Math.min(100, Number(hsl[2]))) / 100;
    const l = Math.max(0, Math.min(100, Number(hsl[3]))) / 100;
    const hue2rgb = (p: number, q: number, t: number) => {
      let tt = t;
      if (tt < 0) tt += 1;
      if (tt > 1) tt -= 1;
      if (tt < 1 / 6) return p + (q - p) * 6 * tt;
      if (tt < 1 / 2) return q;
      if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat;
    const p = 2 * l - q;
    const r = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
    const g = Math.round(hue2rgb(p, q, h) * 255);
    const b = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);
    return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  }
  return null;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = parseColorToHex(hex) ?? "#0f172a";
  return [
    parseInt(clean.slice(1, 3), 16),
    parseInt(clean.slice(3, 5), 16),
    parseInt(clean.slice(5, 7), 16),
  ];
}

export function computeContrastRatio(fgHex: string, bgHex: string): number {
  const lum = (hex: string) => {
    const [r, g, b] = hexToRgb(hex).map((c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const l1 = lum(fgHex);
  const l2 = lum(bgHex);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

// ---------- Live DOM CSS Variable Applier ----------

export function applyCustomizationToDocument(state: CustomizationState): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const { text, colors, animations } = state;

  ensureFontLoaded(text.globalFont);
  ensureFontLoaded(text.headingFont);
  ensureFontLoaded(text.bodyFont);

  const headingFamily = text.customFontName
    ? `"${text.customFontName}", "${text.headingFont}", system-ui, sans-serif`
    : `"${text.headingFont}", system-ui, sans-serif`;
  const bodyFamily = text.customFontName
    ? `"${text.customFontName}", "${text.bodyFont}", system-ui, sans-serif`
    : `"${text.bodyFont}", system-ui, sans-serif`;

  root.style.setProperty("--custom-heading-font", headingFamily);
  root.style.setProperty("--custom-body-font", bodyFamily);
  root.style.setProperty("--custom-font-size", `${text.customFontSizePx}px`);
  root.style.setProperty("--custom-heading-scale", String(text.headingScale));
  root.style.setProperty("--custom-body-scale", String(text.bodyScale));
  root.style.setProperty("--custom-font-weight", String(text.fontWeight));
  root.style.setProperty("--custom-line-height", String(text.lineHeight));
  root.style.setProperty("--custom-letter-spacing", `${text.letterSpacingEm}em`);
  root.style.setProperty("--custom-text-opacity", String(text.textOpacity));
  root.style.setProperty("--custom-text-glow", `${text.textGlowPx}px`);
  root.style.setProperty("--custom-text-shadow", `${text.textShadowPx}px`);
  root.style.setProperty("--wallpaper-transition-sec", `${animations.wallpaperTransitionSec}s`);
  root.setAttribute("data-gradient-headings", String(text.gradientHeadings));
  root.setAttribute("data-hover-anim", String(animations.hoverAnimation));
  root.setAttribute("data-page-transitions", String(animations.pageTransitions));
  root.setAttribute("data-btn-transitions", String(animations.buttonTransitions));
  root.setAttribute("data-bg-transitions", String(animations.backgroundTransitions));

  if (colors.enabled) {
    // Auto-guard contrast if user sets unreadable bodyText vs card
    const ratio = computeContrastRatio(colors.bodyText, colors.card);
    const safeBody = ratio < 3.5 ? "#f8fafc" : colors.bodyText;
    root.style.setProperty("--accent", colors.accent);
    root.style.setProperty("--accent-secondary", colors.secondary);
    root.style.setProperty("--glass-border", colors.border);
    root.style.setProperty("--text-primary", colors.heading);
    root.style.setProperty("--text-secondary", safeBody);
    root.style.setProperty("--custom-gradient", colors.customGradient);
    root.setAttribute("data-custom-colors", "true");
  } else {
    root.style.removeProperty("--accent");
    root.style.removeProperty("--accent-secondary");
    root.style.removeProperty("--glass-border");
    root.style.removeProperty("--text-primary");
    root.style.removeProperty("--text-secondary");
    root.removeAttribute("data-custom-colors");
  }
}
