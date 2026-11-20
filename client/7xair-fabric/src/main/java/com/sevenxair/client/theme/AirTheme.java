package com.sevenxair.client.theme;

/**
 * Seven canonical 7xAir anime-inspired nature themes synchronized with the Tauri launcher.
 * All glass surface colors are rendered dynamically with low alpha so panels
 * remain genuinely translucent over the live Minecraft world.
 */
public enum AirTheme {
    AZURE_MOUNTAINS("azure-mountains", "Azure Mountains", 0x56CCF2, 0x2F80ED, 10, 22, 42),
    SAKURA_VALLEY("sakura-valley", "Sakura Valley", 0xF9A8D4, 0xEC4899, 34, 16, 30),
    EMERALD_WILDERNESS("emerald-wilderness", "Emerald Wilderness", 0x4ADE80, 0x059669, 9, 26, 20),
    FROZEN_PEAKS("frozen-peaks", "Frozen Peaks", 0xBAE6FD, 0x60A5FA, 14, 24, 38),
    SUNSET_HORIZON("sunset-horizon", "Sunset Horizon", 0xFB923C, 0xF59E0B, 34, 18, 12),
    MIDNIGHT_FOREST("midnight-forest", "Midnight Forest", 0x818CF8, 0x3B82F6, 8, 14, 30),
    DREAMY_ANIME("dreamy-anime", "Dreamy Anime", 0xC4B5FD, 0xF472B6, 24, 18, 42);

    public final String id;
    public final String displayName;
    public final int accentRgb;
    public final int secondaryRgb;
    public final int tintR;
    public final int tintG;
    public final int tintB;

    AirTheme(String id, String displayName, int accentRgb, int secondaryRgb, int tintR, int tintG, int tintB) {
        this.id = id;
        this.displayName = displayName;
        this.accentRgb = accentRgb;
        this.secondaryRgb = secondaryRgb;
        this.tintR = tintR;
        this.tintG = tintG;
        this.tintB = tintB;
    }

    public int accentArgb(float alpha) {
        int a = clampByte(Math.round(alpha * 255f));
        return (a << 24) | (accentRgb & 0x00FFFFFF);
    }

    public int glassFillArgb(float opacity) {
        float clamped = Math.max(0.16f, Math.min(0.72f, opacity));
        int a = clampByte(Math.round(clamped * 255f));
        return (a << 24) | ((tintR & 0xFF) << 16) | ((tintG & 0xFF) << 8) | (tintB & 0xFF);
    }

    public int borderArgb(boolean active) {
        return active ? accentArgb(0.68f) : 0x36FFFFFF;
    }

    public static AirTheme byId(String id) {
        if (id == null) return AZURE_MOUNTAINS;
        for (AirTheme theme : values()) {
            if (theme.id.equalsIgnoreCase(id)) {
                return theme;
            }
        }
        return switch (id.toLowerCase()) {
            case "obsidian-cyan" -> AZURE_MOUNTAINS;
            case "sakura-rose" -> SAKURA_VALLEY;
            case "aurora-emerald" -> EMERALD_WILDERNESS;
            case "frost-silver" -> FROZEN_PEAKS;
            case "solar-amber" -> SUNSET_HORIZON;
            case "crimson-ember" -> MIDNIGHT_FOREST;
            case "violet-nebula" -> DREAMY_ANIME;
            default -> AZURE_MOUNTAINS;
        };
    }

    private static int clampByte(int v) {
        return Math.max(0, Math.min(255, v));
    }
}
