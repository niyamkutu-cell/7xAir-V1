package com.sevenxair.client.gui;

import com.sevenxair.client.SevenXAirClient;
import com.sevenxair.client.config.ClientConfig;
import com.sevenxair.client.hud.HudModule;
import com.sevenxair.client.theme.AirTheme;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.text.Text;
import org.lwjgl.glfw.GLFW;

import java.util.List;

/**
 * Dedicated 7xAir in-game HUD Editor over the live Minecraft world.
 * Features smooth opening/closing toolbar transitions, inspector slide-in,
 * alignment guide fade, corner-handle & scroll resizing, snap-to-grid & alignment guides,
 * resolution/GUI-scale clamping, keyboard nudging, automatic saving, and clean teardown.
 */
public final class HudEditorScreen extends Screen {
    private static final int GRID_STEP = 4;
    private static final int SNAP_TOLERANCE = 5;
    private static final int[] COLOR_CYCLE = {
        0xF1F6FC, 0xEF4444, 0x38BDF8, 0xA78BFA, 0x4ADE80, 0xFB923C, 0xF9A8D4
    };
    private static final String[] BG_CYCLE = { "Glass", "Outline", "Minimal" };

    private final Screen parent;
    private HudModule draggingModule = null;
    private HudModule resizingModule = null;
    private HudModule selectedModule = null;
    private int dragOffsetX = 0;
    private int dragOffsetY = 0;
    private double resizeStartX = 0;
    private float resizeStartScale = 1.0f;
    private Integer snapGuideX = null;
    private Integer snapGuideY = null;

    // Frame-rate-independent HUD editor transitions
    private long lastFrameNanos = 0L;
    private float editorAnim = 0.0f;
    private float inspectorAnim = 0.0f;
    private float guideAnim = 0.0f;
    private boolean closing = false;

    public HudEditorScreen(Screen parent) {
        super(Text.literal("7xAir HUD Editor"));
        this.parent = parent;
    }

    @Override
    protected void init() {
        super.init();
        this.lastFrameNanos = System.nanoTime();
        this.closing = false;
        this.editorAnim = SevenXAirClient.config.smoothGuiAnimations ? 0.0f : 1.0f;
        this.inspectorAnim = 0.0f;
        this.guideAnim = 0.0f;
        clampAllModules();
    }

    @Override
    public void resize(MinecraftClient client, int width, int height) {
        super.resize(client, width, height);
        clampAllModules();
    }

    private void clampAllModules() {
        if (this.client == null) return;
        ClientConfig config = SevenXAirClient.config;
        for (HudModule m : SevenXAirClient.hudManager.getModules()) {
            clampModuleToScreen(m, config);
        }
    }

    @Override
    public boolean shouldPause() {
        return false;
    }

    @Override
    public void renderBackground(DrawContext context, int mouseX, int mouseY, float delta) {
        // Keep the live world visible while previewing and editing HUD modules
    }

    private void clampModuleToScreen(HudModule module, ClientConfig config) {
        if (this.client == null) return;
        ClientConfig.ModuleState st = module.state(config);
        int maxX = Math.max(0, this.width - module.scaledWidth(this.client, config));
        int maxY = Math.max(0, this.height - module.scaledHeight(this.client, config));
        st.x = Math.max(0, Math.min(maxX, st.x));
        st.y = Math.max(0, Math.min(maxY, st.y));
    }

    private float nextDeltaSeconds() {
        long now = System.nanoTime();
        float dt = lastFrameNanos == 0L ? 0.016f : (now - lastFrameNanos) / 1_000_000_000.0f;
        lastFrameNanos = now;
        return Math.max(0.001f, Math.min(0.05f, dt));
    }

    @Override
    public void render(DrawContext ctx, int mouseX, int mouseY, float delta) {
        float dt = nextDeltaSeconds();
        ClientConfig config = SevenXAirClient.config;
        AirTheme theme = config.getTheme();
        boolean smooth = config.smoothGuiAnimations;

        float editorGoal = closing ? 0.0f : 1.0f;
        editorAnim = smooth ? GuiAnimator.smoothStep(editorAnim, editorGoal, dt, closing ? 22.0f : 17.0f) : editorGoal;
        if (closing && editorAnim <= 0.03f) {
            finalizeClose();
            return;
        }

        inspectorAnim = smooth
            ? GuiAnimator.smoothStep(inspectorAnim, (selectedModule != null && !closing) ? 1.0f : 0.0f, dt, 18.0f)
            : ((selectedModule != null && !closing) ? 1.0f : 0.0f);
        guideAnim = smooth
            ? GuiAnimator.smoothStep(guideAnim, draggingModule != null ? 1.0f : 0.0f, dt, 20.0f)
            : (draggingModule != null ? 1.0f : 0.0f);

        float uiAlpha = GuiAnimator.easeOutCubic(editorAnim);

        // Alignment assistance guides with smooth fade-in
        if (guideAnim > 0.02f) {
            float gAlpha = GuiAnimator.easeOutCubic(guideAnim) * uiAlpha;
            ctx.fill(this.width / 2, 0, this.width / 2 + 1, this.height, GuiAnimator.scaleAlpha(theme.accentArgb(0.32f), gAlpha));
            ctx.fill(0, this.height / 2, this.width, this.height / 2 + 1, GuiAnimator.scaleAlpha(theme.accentArgb(0.32f), gAlpha));
            if (snapGuideX != null) {
                ctx.fill(snapGuideX, 0, snapGuideX + 1, this.height, GuiAnimator.scaleAlpha(theme.accentArgb(0.78f), gAlpha));
            }
            if (snapGuideY != null) {
                ctx.fill(0, snapGuideY, this.width, snapGuideY + 1, GuiAnimator.scaleAlpha(theme.accentArgb(0.78f), gAlpha));
            }
        }

        if (this.client != null) {
            List<HudModule> modules = SevenXAirClient.hudManager.getModules();
            for (HudModule module : modules) {
                ClientConfig.ModuleState st = module.state(config);
                if (!st.enabled && module != selectedModule && module != draggingModule) {
                    continue;
                }
                boolean hovered = module.hitTest(mouseX, mouseY, this.client, config);
                boolean isSel = module == selectedModule || module == draggingModule || module == resizingModule;
                module.render(ctx, this.client, config, true, isSel || hovered);

                // Draw editor-only element boundaries & corner selection indicators
                int w = module.scaledWidth(this.client, config);
                int h = module.scaledHeight(this.client, config);
                int bx = Math.max(0, Math.min(Math.max(0, this.width - w), st.x));
                int by = Math.max(0, Math.min(Math.max(0, this.height - h), st.y));
                int outline = GuiAnimator.scaleAlpha(
                    isSel ? theme.accentArgb(0.95f) : (hovered ? 0x88FFFFFF : 0x44FFFFFF),
                    uiAlpha
                );

                ctx.fill(bx, by, bx + w, by + 1, outline);
                ctx.fill(bx, by + h - 1, bx + w, by + h, outline);
                ctx.fill(bx, by, bx + 1, by + h, outline);
                ctx.fill(bx + w - 1, by, bx + w, by + h, outline);

                if (isSel) {
                    int c = GuiAnimator.scaleAlpha(theme.accentArgb(1.0f), uiAlpha);
                    ctx.fill(bx - 2, by - 2, bx + 2, by + 2, c);
                    ctx.fill(bx + w - 2, by - 2, bx + w + 2, by + 2, c);
                    ctx.fill(bx - 2, by + h - 2, bx + 2, by + h + 2, c);
                    ctx.fill(bx + w - 3, by + h - 3, bx + w + 3, by + h + 3, GuiAnimator.scaleAlpha(0xFFFFFFFF, uiAlpha));

                    String tag = module.displayName + " (" + bx + "," + by + " \u00B7 " + String.format("%.1fx", st.scale) + ")";
                    int ty = by >= 14 ? by - 12 : by + h + 4;
                    ctx.drawTextWithShadow(this.textRenderer, tag, bx, ty, GuiAnimator.scaleAlpha(0xFFF8FAFC, uiAlpha));
                }
            }
        }

        // Top floating inspector toolbar with smooth slide-in from top
        if (selectedModule != null && inspectorAnim > 0.02f) {
            ClientConfig.ModuleState st = selectedModule.state(config);
            float inspEase = GuiAnimator.easeOutCubic(inspectorAnim);
            int topW = Math.min(540, this.width - 20);
            int topH = 30;
            int topX = (this.width - topW) / 2;
            int topY = 10 - Math.round((1.0f - inspEase) * 16.0f);
            float inspAlpha = uiAlpha * inspEase;

            GlassRenderer.drawFloatingGlassPanel(ctx, topX, topY, topW, topH, theme, config.glassOpacity, true, inspAlpha);

            int cx = topX + 8;
            int cy = topY + 5;
            GlassRenderer.drawGlassPillButton(ctx, this.textRenderer, cx, cy, 62, 20, st.enabled ? "ON" : "OFF", theme, config.glassOpacity, st.enabled, inBounds(mouseX, mouseY, cx, cy, 62, 20), inspAlpha);
            cx += 66;
            GlassRenderer.drawGlassPillButton(ctx, this.textRenderer, cx, cy, 66, 20, "Scale-", theme, config.glassOpacity, false, inBounds(mouseX, mouseY, cx, cy, 66, 20), inspAlpha);
            cx += 70;
            GlassRenderer.drawGlassPillButton(ctx, this.textRenderer, cx, cy, 66, 20, "Scale+", theme, config.glassOpacity, false, inBounds(mouseX, mouseY, cx, cy, 66, 20), inspAlpha);
            cx += 70;
            GlassRenderer.drawGlassPillButton(ctx, this.textRenderer, cx, cy, 74, 20, "Opacity", theme, config.glassOpacity, false, inBounds(mouseX, mouseY, cx, cy, 74, 20), inspAlpha);
            cx += 78;
            GlassRenderer.drawGlassPillButton(ctx, this.textRenderer, cx, cy, 58, 20, "Color", theme, config.glassOpacity, true, inBounds(mouseX, mouseY, cx, cy, 58, 20), inspAlpha);
            cx += 62;
            GlassRenderer.drawGlassPillButton(ctx, this.textRenderer, cx, cy, 62, 20, st.displayStyle, theme, config.glassOpacity, false, inBounds(mouseX, mouseY, cx, cy, 62, 20), inspAlpha);
            cx += 66;
            GlassRenderer.drawGlassPillButton(ctx, this.textRenderer, cx, cy, 50, 20, "Reset", theme, config.glassOpacity, false, inBounds(mouseX, mouseY, cx, cy, 50, 20), inspAlpha);
        }

        // Bottom floating layout toolbar with smooth slide-up entrance
        int barW = 368;
        int barH = 34;
        int barX = (this.width - barW) / 2;
        int barY = this.height - barH - 12 + Math.round((1.0f - uiAlpha) * 18.0f);
        GlassRenderer.drawFloatingGlassPanel(ctx, barX, barY, barW, barH, theme, config.glassOpacity, false, uiAlpha);

        GlassRenderer.drawGlassPillButton(
            ctx, this.textRenderer, barX + 8, barY + 6, 84, 22,
            "Grid: " + (config.snapToGrid ? "ON" : "OFF"),
            theme, config.glassOpacity, config.snapToGrid,
            inBounds(mouseX, mouseY, barX + 8, barY + 6, 84, 22), uiAlpha
        );
        GlassRenderer.drawGlassPillButton(
            ctx, this.textRenderer, barX + 98, barY + 6, 84, 22,
            "Shadow",
            theme, config.glassOpacity, selectedModule != null && selectedModule.state(config).textShadow,
            inBounds(mouseX, mouseY, barX + 98, barY + 6, 84, 22), uiAlpha
        );
        GlassRenderer.drawGlassPillButton(
            ctx, this.textRenderer, barX + 188, barY + 6, 90, 22,
            "Reset All",
            theme, config.glassOpacity, false,
            inBounds(mouseX, mouseY, barX + 188, barY + 6, 90, 22), uiAlpha
        );
        GlassRenderer.drawGlassPillButton(
            ctx, this.textRenderer, barX + 284, barY + 6, 76, 22,
            "Done",
            theme, config.glassOpacity, true,
            inBounds(mouseX, mouseY, barX + 284, barY + 6, 76, 22), uiAlpha
        );

        super.render(ctx, mouseX, mouseY, delta);
    }

    @Override
    public boolean keyPressed(int keyCode, int scanCode, int modifiers) {
        if (closing && keyCode == GLFW.GLFW_KEY_ESCAPE) {
            finalizeClose();
            return true;
        }
        if (selectedModule != null && this.client != null) {
            ClientConfig config = SevenXAirClient.config;
            ClientConfig.ModuleState st = selectedModule.state(config);
            int step = (modifiers & GLFW.GLFW_MOD_SHIFT) != 0 ? GRID_STEP : 1;
            boolean moved = false;
            if (keyCode == GLFW.GLFW_KEY_LEFT) { st.x -= step; moved = true; }
            else if (keyCode == GLFW.GLFW_KEY_RIGHT) { st.x += step; moved = true; }
            else if (keyCode == GLFW.GLFW_KEY_UP) { st.y -= step; moved = true; }
            else if (keyCode == GLFW.GLFW_KEY_DOWN) { st.y += step; moved = true; }
            if (moved) {
                clampModuleToScreen(selectedModule, config);
                config.save();
                return true;
            }
        }
        return super.keyPressed(keyCode, scanCode, modifiers);
    }

    @Override
    public boolean mouseClicked(double mouseX, double mouseY, int button) {
        if (closing) return true;
        ClientConfig config = SevenXAirClient.config;

        // Top selected-element toolbar clicks
        if (button == 0 && selectedModule != null) {
            ClientConfig.ModuleState st = selectedModule.state(config);
            int topW = Math.min(540, this.width - 20);
            int topX = (this.width - topW) / 2;
            int cy = 15;
            int cx = topX + 8;
            if (inBounds(mouseX, mouseY, cx, cy, 62, 20)) {
                st.enabled = !st.enabled;
                config.save();
                return true;
            }
            cx += 66;
            if (inBounds(mouseX, mouseY, cx, cy, 66, 20)) {
                st.scale = Math.max(0.6f, Math.round((st.scale - 0.1f) * 10f) / 10f);
                clampModuleToScreen(selectedModule, config);
                config.save();
                return true;
            }
            cx += 70;
            if (inBounds(mouseX, mouseY, cx, cy, 66, 20)) {
                st.scale = Math.min(1.8f, Math.round((st.scale + 0.1f) * 10f) / 10f);
                clampModuleToScreen(selectedModule, config);
                config.save();
                return true;
            }
            cx += 70;
            if (inBounds(mouseX, mouseY, cx, cy, 74, 20)) {
                float cur = st.opacityOverride >= 0f ? st.opacityOverride : config.glassOpacity;
                float next = cur + 0.12f;
                st.opacityOverride = next > 0.72f ? 0.20f : Math.round(next * 100f) / 100f;
                config.save();
                return true;
            }
            cx += 78;
            if (inBounds(mouseX, mouseY, cx, cy, 58, 20)) {
                int idx = 0;
                for (int i = 0; i < COLOR_CYCLE.length; i++) {
                    if (COLOR_CYCLE[i] == st.textColorRgb) { idx = (i + 1) % COLOR_CYCLE.length; break; }
                }
                st.textColorRgb = COLOR_CYCLE[idx];
                config.save();
                return true;
            }
            cx += 62;
            if (inBounds(mouseX, mouseY, cx, cy, 62, 20)) {
                int idx = 0;
                for (int i = 0; i < BG_CYCLE.length; i++) {
                    if (BG_CYCLE[i].equals(st.displayStyle)) { idx = (i + 1) % BG_CYCLE.length; break; }
                }
                st.displayStyle = BG_CYCLE[idx];
                st.showGlassBackdrop = !"Minimal".equals(st.displayStyle);
                config.save();
                return true;
            }
            cx += 66;
            if (inBounds(mouseX, mouseY, cx, cy, 50, 20)) {
                selectedModule.resetPosition(config);
                st.displayStyle = "Glass";
                st.showGlassBackdrop = true;
                clampModuleToScreen(selectedModule, config);
                config.save();
                return true;
            }
        }

        // Bottom layout toolbar clicks
        int barW = 368;
        int barH = 34;
        int barX = (this.width - barW) / 2;
        int barY = this.height - barH - 12;

        if (button == 0) {
            if (inBounds(mouseX, mouseY, barX + 8, barY + 6, 84, 22)) {
                config.snapToGrid = !config.snapToGrid;
                config.save();
                return true;
            }
            if (inBounds(mouseX, mouseY, barX + 98, barY + 6, 84, 22) && selectedModule != null) {
                ClientConfig.ModuleState st = selectedModule.state(config);
                st.textShadow = !st.textShadow;
                config.save();
                return true;
            }
            if (inBounds(mouseX, mouseY, barX + 188, barY + 6, 90, 22)) {
                SevenXAirClient.hudManager.resetAllPositions(config);
                return true;
            }
            if (inBounds(mouseX, mouseY, barX + 284, barY + 6, 76, 22)) {
                close();
                return true;
            }
        }

        // Element selection, corner-handle resize, drag, or right-click toggle
        if (this.client != null) {
            for (HudModule module : SevenXAirClient.hudManager.getModules()) {
                ClientConfig.ModuleState st = module.state(config);
                if (!st.enabled && module != selectedModule) continue;

                int w = module.scaledWidth(this.client, config);
                int h = module.scaledHeight(this.client, config);
                int bx = Math.max(0, Math.min(Math.max(0, this.width - w), st.x));
                int by = Math.max(0, Math.min(Math.max(0, this.height - h), st.y));

                if (button == 0 && module == selectedModule && inBounds(mouseX, mouseY, bx + w - 5, by + h - 5, 10, 10)) {
                    resizingModule = module;
                    resizeStartX = mouseX;
                    resizeStartScale = st.scale;
                    return true;
                }

                if (module.hitTest(mouseX, mouseY, this.client, config)) {
                    selectedModule = module;
                    if (button == 1) {
                        st.enabled = !st.enabled;
                        config.save();
                        return true;
                    }
                    if (button == 0) {
                        draggingModule = module;
                        dragOffsetX = (int) mouseX - bx;
                        dragOffsetY = (int) mouseY - by;
                        return true;
                    }
                }
            }
        }
        return super.mouseClicked(mouseX, mouseY, button);
    }

    @Override
    public boolean mouseDragged(double mouseX, double mouseY, int button, double deltaX, double deltaY) {
        if (closing) return true;
        ClientConfig config = SevenXAirClient.config;
        if (resizingModule != null && this.client != null) {
            ClientConfig.ModuleState st = resizingModule.state(config);
            float deltaScale = (float) ((mouseX - resizeStartX) / 90.0);
            st.scale = Math.max(0.6f, Math.min(1.8f, Math.round((resizeStartScale + deltaScale) * 10f) / 10f));
            clampModuleToScreen(resizingModule, config);
            return true;
        }
        if (draggingModule != null && this.client != null) {
            ClientConfig.ModuleState st = draggingModule.state(config);
            int nextX = (int) mouseX - dragOffsetX;
            int nextY = (int) mouseY - dragOffsetY;

            if (config.snapToGrid) {
                nextX = Math.round(nextX / (float) GRID_STEP) * GRID_STEP;
                nextY = Math.round(nextY / (float) GRID_STEP) * GRID_STEP;
            }

            snapGuideX = null;
            snapGuideY = null;
            int w = draggingModule.scaledWidth(this.client, config);
            int h = draggingModule.scaledHeight(this.client, config);
            if (Math.abs((nextX + w / 2) - this.width / 2) <= SNAP_TOLERANCE) {
                nextX = this.width / 2 - w / 2;
                snapGuideX = this.width / 2;
            }
            if (Math.abs((nextY + h / 2) - this.height / 2) <= SNAP_TOLERANCE) {
                nextY = this.height / 2 - h / 2;
                snapGuideY = this.height / 2;
            }
            for (HudModule other : SevenXAirClient.hudManager.getModules()) {
                if (other == draggingModule || !other.state(config).enabled) continue;
                ClientConfig.ModuleState ost = other.state(config);
                if (Math.abs(nextX - ost.x) <= SNAP_TOLERANCE) {
                    nextX = ost.x;
                    snapGuideX = ost.x;
                }
                if (Math.abs(nextY - ost.y) <= SNAP_TOLERANCE) {
                    nextY = ost.y;
                    snapGuideY = ost.y;
                }
            }

            st.x = nextX;
            st.y = nextY;
            clampModuleToScreen(draggingModule, config);
            return true;
        }
        return super.mouseDragged(mouseX, mouseY, button, deltaX, deltaY);
    }

    @Override
    public boolean mouseReleased(double mouseX, double mouseY, int button) {
        if (draggingModule != null || resizingModule != null) {
            draggingModule = null;
            resizingModule = null;
            snapGuideX = null;
            snapGuideY = null;
            SevenXAirClient.config.save();
            return true;
        }
        return super.mouseReleased(mouseX, mouseY, button);
    }

    @Override
    public boolean mouseScrolled(double mouseX, double mouseY, double horizontalAmount, double verticalAmount) {
        if (closing) return true;
        if (this.client != null) {
            ClientConfig config = SevenXAirClient.config;
            for (HudModule module : SevenXAirClient.hudManager.getModules()) {
                if (module.hitTest(mouseX, mouseY, this.client, config)) {
                    selectedModule = module;
                    ClientConfig.ModuleState st = module.state(config);
                    float nextScale = st.scale + (verticalAmount > 0 ? 0.1f : -0.1f);
                    st.scale = Math.max(0.6f, Math.min(1.8f, Math.round(nextScale * 10f) / 10f));
                    clampModuleToScreen(module, config);
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
        if (!SevenXAirClient.config.smoothGuiAnimations || closing) {
            finalizeClose();
            return;
        }
        this.closing = true;
        this.draggingModule = null;
        this.resizingModule = null;
        this.snapGuideX = null;
        this.snapGuideY = null;
    }

    private void finalizeClose() {
        if (this.client != null) {
            this.client.setScreen(parent);
        } else {
            super.close();
        }
    }

    @Override
    public void removed() {
        draggingModule = null;
        resizingModule = null;
        snapGuideX = null;
        snapGuideY = null;
        super.removed();
    }

    private boolean inBounds(double mx, double my, int x, int y, int w, int h) {
        return mx >= x && mx <= x + w && my >= y && my <= y + h;
    }
}
