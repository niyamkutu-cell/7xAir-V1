package com.sevenxair.client.gui;

import com.sevenxair.client.SevenXAirClient;
import com.sevenxair.client.config.ClientConfig;
import com.sevenxair.client.hud.HudModule;
import com.sevenxair.client.theme.AirTheme;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.text.Text;

import java.util.List;

/**
 * 7xAir translucent floating glass ClickGUI (opened via Right Shift).
 * Uses genuinely translucent floating panels over the live world with no opaque full-screen wall.
 */
public final class AirClickGuiScreen extends Screen {
    private boolean draggingOpacity = false;

    public AirClickGuiScreen() {
        super(Text.literal("7xAir Client"));
    }

    @Override
    public boolean shouldPause() {
        return false;
    }

    @Override
    public void renderBackground(DrawContext context, int mouseX, int mouseY, float delta) {
        // Ultra-subtle ambient veil only; preserve full world visibility behind floating glass panels
        context.fill(0, 0, this.width, this.height, 0x1E040812);
    }

    @Override
    public void render(DrawContext ctx, int mouseX, int mouseY, float delta) {
        renderBackground(ctx, mouseX, mouseY, delta);

        ClientConfig config = SevenXAirClient.config;
        AirTheme theme = config.getTheme();

        int panelW = Math.min(460, this.width - 40);
        int panelH = Math.min(310, this.height - 40);
        int panelX = (this.width - panelW) / 2;
        int panelY = (this.height - panelH) / 2;

        // Floating glass header & main shell
        GlassRenderer.drawFloatingGlassPanel(ctx, panelX, panelY, panelW, panelH, theme, config.glassOpacity, false);

        ctx.drawTextWithShadow(this.textRenderer, "7xAir Glass GUI", panelX + 16, panelY + 14, 0xFFF1F6FC);
        ctx.drawTextWithShadow(
            this.textRenderer,
            "Theme: " + theme.displayName + " · Opacity " + Math.round(config.glassOpacity * 100) + "%",
            panelX + 16,
            panelY + 26,
            0xFFAFC2D8
        );

        // Open HUD Editor button in top-right of floating panel
        int editBtnW = 104;
        int editBtnX = panelX + panelW - editBtnW - 14;
        int editBtnY = panelY + 12;
        boolean editHover = inBounds(mouseX, mouseY, editBtnX, editBtnY, editBtnW, 22);
        GlassRenderer.drawGlassPillButton(
            ctx, this.textRenderer, editBtnX, editBtnY, editBtnW, 22, "HUD Editor", theme, config.glassOpacity, true, editHover
        );

        // Modules toggle grid (2 columns of translucent floating pills)
        ctx.drawTextWithShadow(this.textRenderer, "HUD Modules", panelX + 16, panelY + 48, 0xFFD4E2F2);
        List<HudModule> modules = SevenXAirClient.hudManager.getModules();
        int colW = (panelW - 44) / 2;
        for (int i = 0; i < modules.size(); i++) {
            HudModule m = modules.get(i);
            int col = i % 2;
            int row = i / 2;
            int bx = panelX + 16 + col * (colW + 12);
            int by = panelY + 62 + row * 26;
            boolean enabled = m.state(config).enabled;
            boolean hovered = inBounds(mouseX, mouseY, bx, by, colW, 21);
            String label = m.displayName + (enabled ? "  [ON]" : "  [OFF]");
            GlassRenderer.drawGlassPillButton(
                ctx, this.textRenderer, bx, by, colW, 21, label, theme, config.glassOpacity, enabled, hovered
            );
        }

        // Seven Color Themes selector row
        int themesY = panelY + 178;
        ctx.drawTextWithShadow(this.textRenderer, "Seven Color Themes", panelX + 16, themesY, 0xFFD4E2F2);
        AirTheme[] allThemes = AirTheme.values();
        int chipW = (panelW - 32 - (allThemes.length - 1) * 6) / allThemes.length;
        for (int i = 0; i < allThemes.length; i++) {
            AirTheme t = allThemes[i];
            int cx = panelX + 16 + i * (chipW + 6);
            int cy = themesY + 14;
            boolean active = t == theme;
            boolean hovered = inBounds(mouseX, mouseY, cx, cy, chipW, 22);
            GlassRenderer.drawGlassPillButton(
                ctx, this.textRenderer, cx, cy, chipW, 22, t.displayName.split(" ")[0], t, config.glassOpacity, active, hovered
            );
        }

        // Glass Opacity Slider
        int sliderY = panelY + 232;
        int sliderX = panelX + 16;
        int sliderW = panelW - 32;
        ctx.drawTextWithShadow(
            this.textRenderer,
            "Glass Translucency (" + Math.round(config.glassOpacity * 100) + "%)",
            sliderX,
            sliderY,
            0xFFD4E2F2
        );
        int trackY = sliderY + 14;
        ctx.fill(sliderX, trackY, sliderX + sliderW, trackY + 6, 0x3AFFFFFF);
        float norm = (config.glassOpacity - 0.20f) / (0.72f - 0.20f);
        int fillW = Math.round(Math.max(0f, Math.min(1f, norm)) * sliderW);
        ctx.fill(sliderX, trackY, sliderX + fillW, trackY + 6, theme.accentArgb(0.85f));
        ctx.fill(sliderX + fillW - 3, trackY - 3, sliderX + fillW + 3, trackY + 9, 0xFFFFFFFF);

        // Footer toggles
        int footY = panelY + panelH - 32;
        boolean hudVisHover = inBounds(mouseX, mouseY, panelX + 16, footY, 130, 20);
        GlassRenderer.drawGlassPillButton(
            ctx,
            this.textRenderer,
            panelX + 16,
            footY,
            130,
            20,
            "HUD: " + (config.hudVisible ? "Visible" : "Hidden"),
            theme,
            config.glassOpacity,
            config.hudVisible,
            hudVisHover
        );

        boolean sprintHover = inBounds(mouseX, mouseY, panelX + 156, footY, 140, 20);
        GlassRenderer.drawGlassPillButton(
            ctx,
            this.textRenderer,
            panelX + 156,
            footY,
            140,
            20,
            "Toggle Sprint: " + (config.toggleSprintActive ? "ON" : "OFF"),
            theme,
            config.glassOpacity,
            config.toggleSprintActive,
            sprintHover
        );

        super.render(ctx, mouseX, mouseY, delta);
    }

    @Override
    public boolean mouseClicked(double mouseX, double mouseY, int button) {
        if (button != 0) return super.mouseClicked(mouseX, mouseY, button);
        ClientConfig config = SevenXAirClient.config;
        int panelW = Math.min(460, this.width - 40);
        int panelH = Math.min(310, this.height - 40);
        int panelX = (this.width - panelW) / 2;
        int panelY = (this.height - panelH) / 2;

        // HUD Editor button
        int editBtnW = 104;
        if (inBounds(mouseX, mouseY, panelX + panelW - editBtnW - 14, panelY + 12, editBtnW, 22)) {
            if (this.client != null) {
                this.client.setScreen(new HudEditorScreen(this));
            }
            return true;
        }

        // Module toggles
        List<HudModule> modules = SevenXAirClient.hudManager.getModules();
        int colW = (panelW - 44) / 2;
        for (int i = 0; i < modules.size(); i++) {
            int col = i % 2;
            int row = i / 2;
            int bx = panelX + 16 + col * (colW + 12);
            int by = panelY + 62 + row * 26;
            if (inBounds(mouseX, mouseY, bx, by, colW, 21)) {
                ClientConfig.ModuleState st = modules.get(i).state(config);
                st.enabled = !st.enabled;
                config.save();
                return true;
            }
        }

        // Theme chips
        int themesY = panelY + 178;
        AirTheme[] allThemes = AirTheme.values();
        int chipW = (panelW - 32 - (allThemes.length - 1) * 6) / allThemes.length;
        for (int i = 0; i < allThemes.length; i++) {
            int cx = panelX + 16 + i * (chipW + 6);
            int cy = themesY + 14;
            if (inBounds(mouseX, mouseY, cx, cy, chipW, 22)) {
                config.setTheme(allThemes[i]);
                config.save();
                return true;
            }
        }

        // Opacity slider
        int sliderX = panelX + 16;
        int sliderW = panelW - 32;
        int trackY = panelY + 246;
        if (inBounds(mouseX, mouseY, sliderX, trackY - 6, sliderW, 18)) {
            draggingOpacity = true;
            updateOpacityFromMouse(mouseX, sliderX, sliderW);
            return true;
        }

        // Footer buttons
        int footY = panelY + panelH - 32;
        if (inBounds(mouseX, mouseY, panelX + 16, footY, 130, 20)) {
            config.hudVisible = !config.hudVisible;
            config.save();
            return true;
        }
        if (inBounds(mouseX, mouseY, panelX + 156, footY, 140, 20)) {
            config.toggleSprintActive = !config.toggleSprintActive;
            config.save();
            return true;
        }

        return super.mouseClicked(mouseX, mouseY, button);
    }

    @Override
    public boolean mouseDragged(double mouseX, double mouseY, int button, double deltaX, double deltaY) {
        if (draggingOpacity) {
            int panelW = Math.min(460, this.width - 40);
            int panelX = (this.width - panelW) / 2;
            updateOpacityFromMouse(mouseX, panelX + 16, panelW - 32);
            return true;
        }
        return super.mouseDragged(mouseX, mouseY, button, deltaX, deltaY);
    }

    @Override
    public boolean mouseReleased(double mouseX, double mouseY, int button) {
        if (draggingOpacity) {
            draggingOpacity = false;
            SevenXAirClient.config.save();
            return true;
        }
        return super.mouseReleased(mouseX, mouseY, button);
    }

    private void updateOpacityFromMouse(double mouseX, int sliderX, int sliderW) {
        float norm = (float) Math.max(0.0, Math.min(1.0, (mouseX - sliderX) / (double) sliderW));
        SevenXAirClient.config.glassOpacity = 0.20f + norm * (0.72f - 0.20f);
    }

    private boolean inBounds(double mx, double my, int x, int y, int w, int h) {
        return mx >= x && mx <= x + w && my >= y && my <= y + h;
    }
}
