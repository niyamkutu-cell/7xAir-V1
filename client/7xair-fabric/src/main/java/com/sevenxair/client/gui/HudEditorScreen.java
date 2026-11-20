package com.sevenxair.client.gui;

import com.sevenxair.client.SevenXAirClient;
import com.sevenxair.client.config.ClientConfig;
import com.sevenxair.client.hud.HudModule;
import com.sevenxair.client.theme.AirTheme;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.text.Text;

/**
 * Interactive drag-and-drop HUD Editor over the live Minecraft world.
 * Left-drag to move, scroll wheel to scale, right-click to toggle module, snap-to-grid optional.
 */
public final class HudEditorScreen extends Screen {
    private static final int GRID_STEP = 4;
    private final Screen parent;
    private HudModule draggingModule = null;
    private int dragOffsetX = 0;
    private int dragOffsetY = 0;

    public HudEditorScreen(Screen parent) {
        super(Text.literal("7xAir HUD Editor"));
        this.parent = parent;
    }

    @Override
    public boolean shouldPause() {
        return false;
    }

    @Override
    public void renderBackground(DrawContext context, int mouseX, int mouseY, float delta) {
        // Keep the live world visible while positioning HUD modules
    }

    @Override
    public void render(DrawContext ctx, int mouseX, int mouseY, float delta) {
        ClientConfig config = SevenXAirClient.config;
        AirTheme theme = config.getTheme();

        // Center alignment guides while dragging
        if (draggingModule != null) {
            ctx.fill(this.width / 2, 0, this.width / 2 + 1, this.height, theme.accentArgb(0.35f));
            ctx.fill(0, this.height / 2, this.width, this.height / 2 + 1, theme.accentArgb(0.35f));
        }

        if (this.client != null) {
            for (HudModule module : SevenXAirClient.hudManager.getModules()) {
                boolean hovered = module.hitTest(mouseX, mouseY, this.client, config);
                module.render(ctx, this.client, config, true, module == draggingModule || hovered);
            }
        }

        // Floating glass bottom toolbar
        int barW = 310;
        int barH = 34;
        int barX = (this.width - barW) / 2;
        int barY = this.height - barH - 14;
        GlassRenderer.drawFloatingGlassPanel(ctx, barX, barY, barW, barH, theme, config.glassOpacity, false);

        GlassRenderer.drawGlassPillButton(
            ctx,
            this.textRenderer,
            barX + 8,
            barY + 6,
            98,
            22,
            "Grid: " + (config.snapToGrid ? "ON" : "OFF"),
            theme,
            config.glassOpacity,
            config.snapToGrid,
            inBounds(mouseX, mouseY, barX + 8, barY + 6, 98, 22)
        );
        GlassRenderer.drawGlassPillButton(
            ctx,
            this.textRenderer,
            barX + 112,
            barY + 6,
            96,
            22,
            "Reset Layout",
            theme,
            config.glassOpacity,
            false,
            inBounds(mouseX, mouseY, barX + 112, barY + 6, 96, 22)
        );
        GlassRenderer.drawGlassPillButton(
            ctx,
            this.textRenderer,
            barX + 214,
            barY + 6,
            88,
            22,
            "Done",
            theme,
            config.glassOpacity,
            true,
            inBounds(mouseX, mouseY, barX + 214, barY + 6, 88, 22)
        );

        super.render(ctx, mouseX, mouseY, delta);
    }

    @Override
    public boolean mouseClicked(double mouseX, double mouseY, int button) {
        ClientConfig config = SevenXAirClient.config;
        int barW = 310;
        int barH = 34;
        int barX = (this.width - barW) / 2;
        int barY = this.height - barH - 14;

        if (button == 0) {
            if (inBounds(mouseX, mouseY, barX + 8, barY + 6, 98, 22)) {
                config.snapToGrid = !config.snapToGrid;
                config.save();
                return true;
            }
            if (inBounds(mouseX, mouseY, barX + 112, barY + 6, 96, 22)) {
                SevenXAirClient.hudManager.resetAllPositions(config);
                return true;
            }
            if (inBounds(mouseX, mouseY, barX + 214, barY + 6, 88, 22)) {
                close();
                return true;
            }
        }

        if (this.client != null) {
            for (HudModule module : SevenXAirClient.hudManager.getModules()) {
                if (module.hitTest(mouseX, mouseY, this.client, config)) {
                    ClientConfig.ModuleState st = module.state(config);
                    if (button == 1) {
                        st.enabled = !st.enabled;
                        config.save();
                        return true;
                    }
                    if (button == 0) {
                        draggingModule = module;
                        dragOffsetX = (int) mouseX - st.x;
                        dragOffsetY = (int) mouseY - st.y;
                        return true;
                    }
                }
            }
        }
        return super.mouseClicked(mouseX, mouseY, button);
    }

    @Override
    public boolean mouseDragged(double mouseX, double mouseY, int button, double deltaX, double deltaY) {
        if (draggingModule != null && this.client != null) {
            ClientConfig config = SevenXAirClient.config;
            ClientConfig.ModuleState st = draggingModule.state(config);
            int nextX = (int) mouseX - dragOffsetX;
            int nextY = (int) mouseY - dragOffsetY;

            if (config.snapToGrid) {
                nextX = Math.round(nextX / (float) GRID_STEP) * GRID_STEP;
                nextY = Math.round(nextY / (float) GRID_STEP) * GRID_STEP;
            }

            int maxX = Math.max(0, this.width - draggingModule.scaledWidth(this.client, config));
            int maxY = Math.max(0, this.height - draggingModule.scaledHeight(this.client, config));
            st.x = Math.max(0, Math.min(maxX, nextX));
            st.y = Math.max(0, Math.min(maxY, nextY));
            return true;
        }
        return super.mouseDragged(mouseX, mouseY, button, deltaX, deltaY);
    }

    @Override
    public boolean mouseReleased(double mouseX, double mouseY, int button) {
        if (draggingModule != null) {
            draggingModule = null;
            SevenXAirClient.config.save();
            return true;
        }
        return super.mouseReleased(mouseX, mouseY, button);
    }

    @Override
    public boolean mouseScrolled(double mouseX, double mouseY, double horizontalAmount, double verticalAmount) {
        if (this.client != null) {
            ClientConfig config = SevenXAirClient.config;
            for (HudModule module : SevenXAirClient.hudManager.getModules()) {
                if (module.hitTest(mouseX, mouseY, this.client, config)) {
                    ClientConfig.ModuleState st = module.state(config);
                    float nextScale = st.scale + (verticalAmount > 0 ? 0.1f : -0.1f);
                    st.scale = Math.max(0.6f, Math.min(1.8f, Math.round(nextScale * 10f) / 10f));
                    config.save();
                    return true;
                }
            }
        }
        return super.mouseScrolled(mouseX, mouseY, horizontalAmount, verticalAmount);
    }

    @Override
    public void close() {
        SevenXAirClient.config.save();
        if (this.client != null) {
            this.client.setScreen(parent);
        }
    }

    private boolean inBounds(double mx, double my, int x, int y, int w, int h) {
        return mx >= x && mx <= x + w && my >= y && my <= y + h;
    }
}
