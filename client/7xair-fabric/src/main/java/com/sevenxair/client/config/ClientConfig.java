package com.sevenxair.client.config;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.sevenxair.client.theme.AirTheme;
import net.fabricmc.loader.api.FabricLoader;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Persists 7xAir Fabric client settings and per-module HUD layouts to
 * <gameDir>/config/7xair-client.json using atomic temp-file replacement.
 */
public final class ClientConfig {
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
    private static final String CONFIG_FILENAME = "7xair-client.json";

    public String themeId = AirTheme.OBSIDIAN_CYAN.id;
    public float glassOpacity = 0.42f;
    public boolean hudVisible = true;
    public boolean snapToGrid = true;
    public boolean toggleSprintActive = true;
    public Map<String, ModuleState> modules = new LinkedHashMap<>();

    public static final class ModuleState {
        public boolean enabled;
        public int x;
        public int y;
        public float scale;
        public boolean showGlassBackdrop;

        public ModuleState() {
            this(true, 10, 10, 1.0f, true);
        }

        public ModuleState(boolean enabled, int x, int y, float scale, boolean showGlassBackdrop) {
            this.enabled = enabled;
            this.x = x;
            this.y = y;
            this.scale = scale;
            this.showGlassBackdrop = showGlassBackdrop;
        }
    }

    public AirTheme getTheme() {
        return AirTheme.byId(themeId);
    }

    public void setTheme(AirTheme theme) {
        this.themeId = theme.id;
    }

    public ModuleState getOrCreateModuleState(String moduleId, int defaultX, int defaultY, boolean defaultEnabled) {
        return modules.computeIfAbsent(
            moduleId,
            k -> new ModuleState(defaultEnabled, defaultX, defaultY, 1.0f, true)
        );
    }

    public void validate() {
        this.themeId = AirTheme.byId(this.themeId).id;
        this.glassOpacity = Math.max(0.20f, Math.min(0.72f, this.glassOpacity));
        if (this.modules == null) {
            this.modules = new LinkedHashMap<>();
        }
        for (ModuleState state : this.modules.values()) {
            state.scale = Math.max(0.6f, Math.min(1.8f, state.scale <= 0 ? 1.0f : state.scale));
        }
    }

    public static Path configPath() {
        return FabricLoader.getInstance().getConfigDir().resolve(CONFIG_FILENAME);
    }

    public static ClientConfig load() {
        Path path = configPath();
        if (Files.exists(path)) {
            try {
                String raw = Files.readString(path, StandardCharsets.UTF_8);
                ClientConfig parsed = GSON.fromJson(raw, ClientConfig.class);
                if (parsed != null) {
                    parsed.validate();
                    return parsed;
                }
            } catch (Exception ignored) {
                // Fall back to fresh defaults if config is corrupted
            }
        }
        ClientConfig defaults = new ClientConfig();
        defaults.syncInitialThemeFromLauncher();
        defaults.save();
        return defaults;
    }

    /**
     * Reads the active theme from %APPDATA%\7xAir\settings.json on first launch so the
     * in-game translucent glass GUI matches the launcher's selected theme out of the box.
     */
    private void syncInitialThemeFromLauncher() {
        try {
            String appData = System.getenv("APPDATA");
            if (appData == null || appData.isBlank()) return;
            Path launcherSettings = Path.of(appData, "7xAir", "settings.json");
            if (!Files.exists(launcherSettings)) return;
            String raw = Files.readString(launcherSettings, StandardCharsets.UTF_8);
            JsonObject obj = JsonParser.parseString(raw).getAsJsonObject();
            if (obj.has("theme")) {
                this.themeId = AirTheme.byId(obj.get("theme").getAsString()).id;
            }
        } catch (Exception ignored) {
            // Optional sync; never block client startup
        }
    }

    public void save() {
        validate();
        Path path = configPath();
        Path tmp = path.resolveSibling(CONFIG_FILENAME + ".tmp");
        try {
            Files.createDirectories(path.getParent());
            Files.writeString(tmp, GSON.toJson(this), StandardCharsets.UTF_8);
            Files.move(tmp, path, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException e) {
            try {
                Files.writeString(path, GSON.toJson(this), StandardCharsets.UTF_8);
            } catch (IOException ignored) {
                // Ignore secondary write failure
            }
        }
    }
}
