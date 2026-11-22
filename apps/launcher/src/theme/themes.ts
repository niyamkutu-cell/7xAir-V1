import type {
  CustomWallpaperItem,
  ThemeDefinition,
  ThemeId,
  WallpaperDefinition,
} from "../types/launcher";

export const SEVEN_THEMES: readonly ThemeDefinition[] = [
  {
    id: "obsidian-violet",
    name: "Theme 1",
    tagline: "Liquid-glass black, luminous violet, and subtle crimson-red accents",
    accentHex: "#8b5cf6",
    secondaryHex: "#ef4444",
    surfaceTint: "rgba(10, 8, 18, var(--glass-alpha))",
  },
  {
    id: "midnight-sky",
    name: "Theme 2",
    tagline: "Deep obsidian black glass paired with crisp sky-blue glow",
    accentHex: "#38bdf8",
    secondaryHex: "#0ea5e9",
    surfaceTint: "rgba(6, 12, 22, var(--glass-alpha))",
  },
  {
    id: "azure-mountains",
    name: "Theme 3",
    tagline: "Crisp cobalt peaks, drifting mist, and luminous alpine glass",
    accentHex: "#56ccf2",
    secondaryHex: "#2f80ed",
    surfaceTint: "rgba(10, 22, 42, var(--glass-alpha))",
  },
  {
    id: "sakura-valley",
    name: "Theme 4",
    tagline: "Soft cherry blossom petals drifting over serene rose-tinted glass",
    accentHex: "#f9a8d4",
    secondaryHex: "#ec4899",
    surfaceTint: "rgba(34, 16, 30, var(--glass-alpha))",
  },
  {
    id: "emerald-wilderness",
    name: "Theme 5",
    tagline: "Sunlit evergreen pines, jade valleys, and calm forest glow",
    accentHex: "#4ade80",
    secondaryHex: "#059669",
    surfaceTint: "rgba(9, 26, 20, var(--glass-alpha))",
  },
  {
    id: "frozen-peaks",
    name: "Theme 6",
    tagline: "Snow-crowned ridges, glacial reflections, and crisp frost glass",
    accentHex: "#bae6fd",
    secondaryHex: "#60a5fa",
    surfaceTint: "rgba(14, 24, 38, var(--glass-alpha))",
  },
  {
    id: "sunset-horizon",
    name: "Theme 7",
    tagline: "Warm amber dusk clouds reflecting across golden glass panels",
    accentHex: "#fb923c",
    secondaryHex: "#f59e0b",
    surfaceTint: "rgba(34, 18, 12, var(--glass-alpha))",
  },
  {
    id: "midnight-forest",
    name: "Theme 8",
    tagline: "Moonlit indigo pines, calm night sky, and drifting fireflies",
    accentHex: "#818cf8",
    secondaryHex: "#3b82f6",
    surfaceTint: "rgba(8, 14, 30, var(--glass-alpha))",
  },
  {
    id: "dreamy-anime",
    name: "Theme 9",
    tagline: "Pastel lavender clouds, soft twilight hills, and luminous mist",
    accentHex: "#c4b5fd",
    secondaryHex: "#f472b6",
    surfaceTint: "rgba(24, 18, 42, var(--glass-alpha))",
  },
  {
    id: "midnight-anime",
    name: "Theme 10",
    tagline: "Deep black & midnight-blue surfaces with blue, violet, and pink anime glow",
    accentHex: "#60a5fa",
    secondaryHex: "#ec4899",
    surfaceTint: "rgba(7, 10, 22, var(--glass-alpha))",
  },
  {
    id: "serenity-nature",
    name: "Theme 11",
    tagline: "Bright white translucent glass, natural green accents, falling pink petals & green leaves",
    accentHex: "#16a34a",
    secondaryHex: "#ec4899",
    surfaceTint: "rgba(255, 255, 255, 0.86)",
  },
  {
    id: "anime-glass",
    name: "Theme 12",
    tagline: "Dark translucent acrylic panels with purple, blue, and pink gradients",
    accentHex: "#a855f7",
    secondaryHex: "#38bdf8",
    surfaceTint: "rgba(12, 10, 24, var(--glass-alpha))",
  },
] as const;

export const LAUNCHER_THEMES = SEVEN_THEMES;

export function isValidThemeId(value: string): value is ThemeId {
  return SEVEN_THEMES.some((theme) => theme.id === value);
}

export function getThemeById(id: ThemeId): ThemeDefinition {
  return SEVEN_THEMES.find((theme) => theme.id === id) ?? SEVEN_THEMES[0];
}

export const ANIME_WALLPAPERS: readonly WallpaperDefinition[] = [
  {
    id: "auto",
    name: "Auto (Theme Matched)",
    subtitle: "Automatically pairs each theme with its matching anime backdrop",
    imageUrl: null,
    accentHex: "#ef4444",
  },
  {
    id: "anime-moonlit-window",
    name: "Wallpaper 1",
    subtitle: "Moonlit cobalt window silhouette & crescent night sky",
    imageUrl: "/backgrounds/anime-moonlit-window.jpg",
    accentHex: "#38bdf8",
  },
  {
    id: "anime-serenity-nature",
    name: "Wallpaper 2",
    subtitle: "Bright sunlit meadow, pink cherry blossoms & floating green leaves",
    imageUrl: "/backgrounds/anime-serenity-nature.jpg",
    accentHex: "#16a34a",
  },
  {
    id: "anime-sakura-shrine",
    name: "Wallpaper 3",
    subtitle: "Drifting pink petals, violet light & full moon",
    imageUrl: "/backgrounds/anime-sakura-shrine.jpg",
    accentHex: "#f472b6",
  },
  {
    id: "anime-indigo-shrine",
    name: "Wallpaper 4",
    subtitle: "Mystic indigo temple bridge with luminous butterflies",
    imageUrl: "/backgrounds/anime-indigo-shrine.jpg",
    accentHex: "#818cf8",
  },
  {
    id: "anime-starlit-curtains",
    name: "Wallpaper 5",
    subtitle: "Starlit twilight curtains & glowing crescent moon",
    imageUrl: "/backgrounds/anime-starlit-curtains.jpg",
    accentHex: "#60a5fa",
  },
  {
    id: "anime-midnight-headphones",
    name: "Wallpaper 6",
    subtitle: "Full moon skyline, cyan window glow & calm midnight mood",
    imageUrl: "/backgrounds/anime-midnight-headphones.jpg",
    accentHex: "#22d3ee",
  },
  {
    id: "anime-crimson-eclipse",
    name: "Wallpaper 7",
    subtitle: "Obsidian rooftop, glowing shrine & red crescent moon",
    imageUrl: "/backgrounds/anime-crimson-eclipse.jpg",
    accentHex: "#ef4444",
  },
  {
    id: "anime-azure-peaks",
    name: "Wallpaper 8",
    subtitle: "Twilight snow-dusted peaks & moonlit alpine lake",
    imageUrl: "/backgrounds/anime-azure-peaks.jpg",
    accentHex: "#56ccf2",
  },
  {
    id: "anime-emerald-lanterns",
    name: "Wallpaper 9",
    subtitle: "Tranquil bamboo & pine shrine path with jade lanterns",
    imageUrl: "/backgrounds/anime-emerald-lanterns.jpg",
    accentHex: "#4ade80",
  },
  {
    id: "none",
    name: "Scenic Vector Only",
    subtitle: "Pure animated vector scenery without a wallpaper image",
    imageUrl: null,
    accentHex: "#94a3b8",
  },
] as const;

const THEME_DEFAULT_WALLPAPER: Record<ThemeId, string> = {
  "obsidian-violet": "/backgrounds/anime-crimson-eclipse.jpg",
  "midnight-sky": "/backgrounds/anime-midnight-headphones.jpg",
  "azure-mountains": "/backgrounds/anime-azure-peaks.jpg",
  "sakura-valley": "/backgrounds/anime-sakura-shrine.jpg",
  "emerald-wilderness": "/backgrounds/anime-emerald-lanterns.jpg",
  "frozen-peaks": "/backgrounds/anime-starlit-curtains.jpg",
  "sunset-horizon": "/backgrounds/anime-crimson-eclipse.jpg",
  "midnight-forest": "/backgrounds/anime-indigo-shrine.jpg",
  "dreamy-anime": "/backgrounds/anime-moonlit-window.jpg",
  "midnight-anime": "/backgrounds/anime-midnight-headphones.jpg",
  "serenity-nature": "/backgrounds/anime-serenity-nature.jpg",
  "anime-glass": "/backgrounds/anime-sakura-shrine.jpg",
};

export function resolveWallpaperUrl(
  wallpaperId: string | undefined,
  theme: ThemeId,
  customWallpapers: CustomWallpaperItem[] = []
): string | null {
  const id = wallpaperId || "auto";
  if (id === "none") return null;
  if (id.startsWith("custom:")) {
    const custom = customWallpapers.find((w) => w.id === id);
    if (custom) return custom.dataUrl;
  }
  if (id === "auto") {
    return THEME_DEFAULT_WALLPAPER[theme] ?? THEME_DEFAULT_WALLPAPER["obsidian-violet"];
  }
  const found = ANIME_WALLPAPERS.find((w) => w.id === id);
  return found?.imageUrl ?? THEME_DEFAULT_WALLPAPER[theme] ?? null;
}
