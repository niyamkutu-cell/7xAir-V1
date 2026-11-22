package com.sevenxair.client.hud;

import com.sevenxair.client.compat.RendererCompat;
import com.sevenxair.client.config.ClientConfig;
import com.sevenxair.client.gui.GlassRenderer;
import com.sevenxair.client.theme.AirTheme;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;

/**
 * Base class for every floating translucent glass HUD module in 7xAir.
 * Supports 8 structured categories, descriptions, custom keybinds,
 * renderer fault isolation, and lightweight crash-safe rendering.
 */
public abstract class HudModule {
    public enum Category {
        ALL("All", "\u25A3"),
        COMBAT("Combat", "\u2694"),
        MOVEMENT("Movement", "\u27A4"),
        RENDER("Render", "\u25C9"),
        PLAYER("Player", "\u263A"),
        WORLD("World", "\u25C8"),
        UTILITY("Utility", "\u2692"),
        HUD("HUD", "\u25A6"),
        MISCELLANEOUS("Misc", "\u2726");

        public final String label;
        public final String icon;

        Category(String label, String icon) {
            this.label = label;
            this.icon = icon;
        }
    }

    public final String id;
    public final String displayName;
    public final String description;
    public final Category category;
    public final int defaultX;
    public final int defaultY;
    public final boolean defaultEnabled;

    protected HudModule(String id, String displayName, int defaultX, int defaultY, boolean defaultEnabled) {
        this(id, displayName, "7xAir HUD module", Category.HUD, defaultX, defaultY, defaultEnabled);
    }

    protected HudModule(
        String id,
        String displayName,
        Category category,
        int defaultX,
        int defaultY,
        boolean defaultEnabled
    ) {
        this(id, displayName, "7xAir " + category.label + " module", category, defaultX, defaultY, defaultEnabled);
    }

    protected HudModule(
        String id,
        String displayName,
        String description,
        Category category,
        int defaultX,
        int defaultY,
        boolean defaultEnabled
    ) {
        this.id = id;
        this.displayName = displayName;
        this.description = description;
        this.category = category;
        this.defaultX = defaultX;
        this.defaultY = defaultY;
        this.defaultEnabled = defaultEnabled;
    }

    public ClientConfig.ModuleState state(ClientConfig config) {
        return config.getOrCreateModuleState(id, defaultX, defaultY, defaultEnabled);
    }

    public abstract int baseWidth(MinecraftClient client);

    public abstract int baseHeight(MinecraftClient client);

    protected abstract void renderContent(
        DrawContext ctx,
        MinecraftClient client,
        AirTheme theme,
        float glassOpacity,
        boolean editorMode
    );

    public void render(
        DrawContext ctx,
        MinecraftClient client,
        ClientConfig config,
        boolean editorMode,
        boolean selected
    ) {
        if (!editorMode && RendererCompat.isModuleQuarantined(id)) {
            return;
        }
        ClientConfig.ModuleState st = state(config);
        if (!st.enabled && !editorMode) {
            return;
        }

        AirTheme theme = config.getTheme();
        int w = baseWidth(client);
        int h = baseHeight(client);
        float effectiveOpacity = st.opacityOverride >= 0f ? st.opacityOverride : config.glassOpacity;

        ctx.getMatrices().push();
        try {
            int sw = client.getWindow() != null ? client.getWindow().getScaledWidth() : 1280;
            int sh = client.getWindow() != null ? client.getWindow().getScaledHeight() : 720;
            int clampedX = Math.max(0, Math.min(Math.max(0, sw - Math.round(w * st.scale)), st.x));
            int clampedY = Math.max(0, Math.min(Math.max(0, sh - Math.round(h * st.scale)), st.y));
            ctx.getMatrices().translate(clampedX, clampedY, 0f);
            if (Math.abs(st.scale - 1.0f) > 0.001f) {
                ctx.getMatrices().scale(st.scale, st.scale, 1f);
            }

            int padOffset = Math.max(0, st.paddingPx - 6);
            int rw = w + padOffset * 2;
            int rh = h + padOffset;
            if ((st.showGlassBackdrop && !"Minimal".equals(st.displayStyle)) || editorMode) {
                float alpha = st.enabled ? effectiveOpacity : Math.max(0.18f, effectiveOpacity * 0.5f);
                if ("Outline".equals(st.displayStyle) && !editorMode) {
                    GlassRenderer.drawFloatingGlassPanel(ctx, 0, 0, rw, rh, theme, 0.16f, true);
                } else {
                    GlassRenderer.drawFloatingGlassPanel(ctx, 0, 0, rw, rh, theme, alpha, selected);
                }
            }

            renderContent(ctx, client, theme, effectiveOpacity, editorMode);
        } catch (Throwable error) {
            // Isolate fault to this module instead of crashing Minecraft
            RendererCompat.reportModuleFault(id, error);
        } finally {
            ctx.getMatrices().pop();
        }
    }

    public int scaledWidth(MinecraftClient client, ClientConfig config) {
        return Math.round(baseWidth(client) * state(config).scale);
    }

    public int scaledHeight(MinecraftClient client, ClientConfig config) {
        return Math.round(baseHeight(client) * state(config).scale);
    }

    public boolean hitTest(double mouseX, double mouseY, MinecraftClient client, ClientConfig config) {
        ClientConfig.ModuleState st = state(config);
        int w = scaledWidth(client, config);
        int h = scaledHeight(client, config);
        return mouseX >= st.x && mouseX <= st.x + w && mouseY >= st.y && mouseY <= st.y + h;
    }

    public void resetPosition(ClientConfig config) {
        ClientConfig.ModuleState st = state(config);
        st.x = defaultX;
        st.y = defaultY;
        st.scale = 1.0f;
        st.textShadow = true;
        st.textColorRgb = 0xF1F6FC;
        st.opacityOverride = -1.0f;
    }
}
