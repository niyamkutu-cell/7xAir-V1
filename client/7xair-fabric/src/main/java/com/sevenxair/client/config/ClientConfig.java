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
 * Caches resolved theme lookups and supports debounced saves to avoid
 * blocking Minecraft's main thread during rapid slider/drag interactions.
 */
public final class ClientConfig {
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
    private static final String CONFIG_FILENAME = "7xair-client.json";
    private static final long SAVE_DEBOUNCE_MS = 250L;

    public String themeId = AirTheme.CRIMSON_OBSIDIAN.id;
    public float glassOpacity = 0.42f;
    public boolean hudVisible = true;
    public boolean snapToGrid = true;
    public boolean toggleSprintActive = true;
    public boolean smoothGuiAnimations = true;
    public boolean performanceMode = false;
    public String activeProfileName = "Default";
    public Map<String, ModuleState> modules = new LinkedHashMap<>();

    private transient AirTheme cachedTheme = null;
    private transient long lastSavedAtMs = 0L;
    private transient boolean dirty = false;

    public static final class ModuleState {
        public boolean enabled;
        public int x;
        public int y;
        public float scale;
        public boolean showGlassBackdrop;
        public boolean textShadow;
        public int textColorRgb;
        public float opacityOverride;
        public int keybindCode;
        public String displayStyle;
        public int paddingPx;
        public String customPrefix;

        public ModuleState() {
            this(true, 10, 10, 1.0f, true);
        }

        public ModuleState(boolean enabled, int x, int y, float scale, boolean showGlassBackdrop) {
            this.enabled = enabled;
            this.x = x;
            this.y = y;
            this.scale = scale;
            this.showGlassBackdrop = showGlassBackdrop;
            this.textShadow = true;
            this.textColorRgb = 0xF1F6FC;
            this.opacityOverride = -1.0f;
            this.keybindCode = -1;
            this.displayStyle = "Glass";
            this.paddingPx = 6;
            this.customPrefix = "";
        }
    }

    public AirTheme getTheme() {
        AirTheme t = this.cachedTheme;
        if (t == null || !t.id.equalsIgnoreCase(this.themeId)) {
            t = AirTheme.byId(this.themeId);
            this.cachedTheme = t;
        }
        return t;
    }

    public void setTheme(AirTheme theme) {
        this.themeId = theme.id;
        this.cachedTheme = theme;
    }

    public ModuleState getOrCreateModuleState(String moduleId, int defaultX, int defaultY, boolean defaultEnabled) {
        ModuleState existing = modules.get(moduleId);
        if (existing != null) {
            return existing;
        }
        ModuleState created = new ModuleState(defaultEnabled, defaultX, defaultY, 1.0f, true);
        modules.put(moduleId, created);
        return created;
    }

    public void validate() {
        AirTheme resolved = AirTheme.byId(this.themeId);
        this.themeId = resolved.id;
        this.cachedTheme = resolved;
        this.glassOpacity = Math.max(0.20f, Math.min(0.72f, this.glassOpacity));
        if (this.modules == null) {
            this.modules = new LinkedHashMap<>();
        }
        for (ModuleState state : this.modules.values()) {
            state.scale = Math.max(0.6f, Math.min(1.8f, state.scale <= 0 ? 1.0f : state.scale));
            if (state.textColorRgb == 0) {
                state.textColorRgb = 0xF1F6FC;
            }
            if (state.opacityOverride >= 0f) {
                state.opacityOverride = Math.max(0.16f, Math.min(0.72f, state.opacityOverride));
            }
            if (state.displayStyle == null || (!state.displayStyle.equals("Glass") && !state.displayStyle.equals("Minimal") && !state.displayStyle.equals("Outline"))) {
                state.displayStyle = "Glass";
            }
            state.paddingPx = Math.max(2, Math.min(14, state.paddingPx <= 0 ? 6 : state.paddingPx));
            if (state.customPrefix == null) {
                state.customPrefix = "";
            } else if (state.customPrefix.length() > 16) {
                state.customPrefix = state.customPrefix.substring(0, 16);
            }
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
                this.setTheme(AirTheme.byId(obj.get("theme").getAsString()));
            }
        } catch (Exception ignored) {
            // Optional sync; never block client startup
        }
    }

    /** Marks config dirty and writes at most once per debounce interval. */
    public void saveDebounced() {
        this.dirty = true;
        long now = System.currentTimeMillis();
        if (now - lastSavedAtMs >= SAVE_DEBOUNCE_MS) {
            save();
        }
    }

    /** Flushes any deferred debounced save immediately (e.g., on GUI close or client shutdown). */
    public void flushPendingSave() {
        if (this.dirty) {
            save();
        }
    }

    public void save() {
        validate();
        this.dirty = false;
        this.lastSavedAtMs = System.currentTimeMillis();
        Path path = configPath();
        Path tmp = path.resolveSibling(CONFIG_FILENAME + ".tmp");
        String json = GSON.toJson(this);
        try {
            Files.createDirectories(path.getParent());
            Files.writeString(tmp, json, StandardCharsets.UTF_8);
            Files.move(tmp, path, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException e) {
            try {
                Files.writeString(path, json, StandardCharsets.UTF_8);
            } catch (IOException ignored) {
                // Ignore secondary write failure
            }
        }
    }
}
