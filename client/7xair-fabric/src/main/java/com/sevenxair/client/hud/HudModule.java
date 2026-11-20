package com.sevenxair.client.hud;

import com.sevenxair.client.config.ClientConfig;
import com.sevenxair.client.gui.GlassRenderer;
import com.sevenxair.client.theme.AirTheme;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;

/**
 * Base class for every floating translucent glass HUD module in 7xAir.
 */
public abstract class HudModule {
    public final String id;
    public final String displayName;
    public final int defaultX;
    public final int defaultY;
    public final boolean defaultEnabled;

    protected HudModule(String id, String displayName, int defaultX, int defaultY, boolean defaultEnabled) {
        this.id = id;
        this.displayName = displayName;
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
        ClientConfig.ModuleState st = state(config);
        if (!st.enabled && !editorMode) {
            return;
        }

        AirTheme theme = config.getTheme();
        int w = baseWidth(client);
        int h = baseHeight(client);

        ctx.getMatrices().push();
        ctx.getMatrices().translate(st.x, st.y, 0f);
        ctx.getMatrices().scale(st.scale, st.scale, 1f);

        if (st.showGlassBackdrop || editorMode) {
            float alpha = st.enabled ? config.glassOpacity : Math.max(0.18f, config.glassOpacity * 0.5f);
            GlassRenderer.drawFloatingGlassPanel(ctx, 0, 0, w, h, theme, alpha, selected);
        }

        renderContent(ctx, client, theme, config.glassOpacity, editorMode);
        ctx.getMatrices().pop();
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
    }
}
