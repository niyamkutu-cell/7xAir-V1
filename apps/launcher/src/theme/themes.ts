import type { ThemeDefinition, ThemeId } from "../types/launcher";

export const SEVEN_THEMES: readonly ThemeDefinition[] = [
  {
    id: "azure-mountains",
    name: "Azure Mountains",
    tagline: "Crisp cobalt peaks, drifting mist, and a crystal-clear alpine river",
    accentHex: "#56ccf2",
    secondaryHex: "#2f80ed",
    surfaceTint: "rgba(10, 22, 42, var(--glass-alpha))",
  },
  {
    id: "sakura-valley",
    name: "Sakura Valley",
    tagline: "Soft cherry blossom petals drifting over serene rose-tinted hills",
    accentHex: "#f9a8d4",
    secondaryHex: "#ec4899",
    surfaceTint: "rgba(34, 16, 30, var(--glass-alpha))",
  },
  {
    id: "emerald-wilderness",
    name: "Emerald Wilderness",
    tagline: "Sunlit evergreen pines, jade valleys, and winding forest streams",
    accentHex: "#4ade80",
    secondaryHex: "#059669",
    surfaceTint: "rgba(9, 26, 20, var(--glass-alpha))",
  },
  {
    id: "frozen-peaks",
    name: "Frozen Peaks",
    tagline: "Snow-crowned ridges, glacial ice reflections, and crisp frost glass",
    accentHex: "#bae6fd",
    secondaryHex: "#60a5fa",
    surfaceTint: "rgba(14, 24, 38, var(--glass-alpha))",
  },
  {
    id: "sunset-horizon",
    name: "Sunset Horizon",
    tagline: "Warm amber dusk clouds reflecting across a golden mountain river",
    accentHex: "#fb923c",
    secondaryHex: "#f59e0b",
    surfaceTint: "rgba(34, 18, 12, var(--glass-alpha))",
  },
  {
    id: "midnight-forest",
    name: "Midnight Forest",
    tagline: "Moonlit indigo pines, calm night sky, and drifting forest fireflies",
    accentHex: "#818cf8",
    secondaryHex: "#3b82f6",
    surfaceTint: "rgba(8, 14, 30, var(--glass-alpha))",
  },
  {
    id: "dreamy-anime",
    name: "Dreamy Anime",
    tagline: "Pastel lavender clouds, soft twilight hills, and luminous horizon mist",
    accentHex: "#c4b5fd",
    secondaryHex: "#f472b6",
    surfaceTint: "rgba(24, 18, 42, var(--glass-alpha))",
  },
] as const;

export function isValidThemeId(value: string): value is ThemeId {
  return SEVEN_THEMES.some((theme) => theme.id === value);
}

export function getThemeById(id: ThemeId): ThemeDefinition {
  return SEVEN_THEMES.find((theme) => theme.id === id) ?? SEVEN_THEMES[0];
}
