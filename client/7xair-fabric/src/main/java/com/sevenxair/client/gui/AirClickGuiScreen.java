package com.sevenxair.client.gui;

import com.sevenxair.client.SevenXAirClient;
import com.sevenxair.client.compat.RendererCompat;
import com.sevenxair.client.config.ClientConfig;
import com.sevenxair.client.hud.CombatTracker;
import com.sevenxair.client.hud.HudModule;
import com.sevenxair.client.input.AirKeybinds;
import com.sevenxair.client.theme.AirTheme;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.text.Text;
import org.lwjgl.glfw.GLFW;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 7xAir centered ClickGUI with smooth frame-rate-independent animations:
 * opening/closing scale & fade, gliding sidebar category indicator, card hover glows,
 * smooth toggle switches, clipped animated dropdowns, settings panel slide-in,
 * search focus & filter pulse, scissor-clipped module grid, accurate scaled mouse
 * coordinate conversion, and full resource cleanup on close.
 */
public final class AirClickGuiScreen extends Screen {
    private enum ViewMode { MODULES, PROFILES, SETTINGS }
    private enum FocusField { NONE, SEARCH, MODULE_PREFIX, MODULE_PADDING }
    private enum ActiveSlider { NONE, GLOBAL_OPACITY, MODULE_SCALE, MODULE_OPACITY }

    private static final String[] STYLE_OPTIONS = { "Glass", "Outline", "Minimal" };
    private static final int[] COLOR_PRESETS = {
        0xF1F6FC, 0xEF4444, 0x38BDF8, 0xA78BFA, 0x4ADE80, 0xFB923C, 0xF9A8D4
    };

    private ViewMode viewMode = ViewMode.MODULES;
    private HudModule.Category activeCategory = HudModule.Category.ALL;
    private HudModule configuringModule = null;
    private FocusField focusField = FocusField.NONE;
    private ActiveSlider activeSlider = ActiveSlider.NONE;
    private boolean styleDropdownOpen = false;
    private boolean listeningForKeybind = false;
    private String searchQuery = "";
    private String paddingDraft = "";
    private int scrollRowOffset = 0;

    // Frame-rate-independent animation states
    private long lastFrameNanos = 0L;
    private float openCloseAnim = 0.0f;
    private boolean closing = false;
    private Screen pendingNextScreen = null;
    private float categoryAnim = 1.0f;
    private float settingsPanelAnim = 1.0f;
    private float styleDropdownAnim = 0.0f;
    private float searchFocusAnim = 0.0f;
    private float searchPulseAnim = 1.0f;
    private float sidebarIndicatorY = -1.0f;

    private final Map<String, Float> toggleAnim = new HashMap<>();
    private final Map<String, Float> cardHoverAnim = new HashMap<>();

    public AirClickGuiScreen() {
        super(Text.literal("7xAir Client"));
    }

    @Override
    protected void init() {
        super.init();
        this.lastFrameNanos = System.nanoTime();
        this.closing = false;
        this.pendingNextScreen = null;
        this.openCloseAnim = SevenXAirClient.config.smoothGuiAnimations ? 0.0f : 1.0f;
        this.categoryAnim = 1.0f;
        this.settingsPanelAnim = 1.0f;
        this.styleDropdownAnim = 0.0f;
        this.searchFocusAnim = 0.0f;
        this.searchPulseAnim = 1.0f;
        this.sidebarIndicatorY = -1.0f;
    }

    @Override
    public boolean shouldPause() {
        return false;
    }

    @Override
    public void renderBackground(DrawContext context, int mouseX, int mouseY, float delta) {
        int dim = GuiAnimator.scaleAlpha(0x6A040408, GuiAnimator.easeOutCubic(openCloseAnim));
        context.fill(0, 0, this.width, this.height, dim);
    }

    @Override
    public void close() {
        commitPaddingDraft();
        SevenXAirClient.config.save();
        if (!SevenXAirClient.config.smoothGuiAnimations || closing) {
            finalizeClose();
            return;
        }
        this.closing = true;
        this.pendingNextScreen = null;
        this.focusField = FocusField.NONE;
        this.activeSlider = ActiveSlider.NONE;
        this.styleDropdownOpen = false;
        this.listeningForKeybind = false;
    }

    private void closeToScreen(Screen next) {
        commitPaddingDraft();
        SevenXAirClient.config.save();
        if (!SevenXAirClient.config.smoothGuiAnimations) {
            if (this.client != null) {
                this.client.setScreen(next);
            }
            return;
        }
        this.closing = true;
        this.pendingNextScreen = next;
        this.focusField = FocusField.NONE;
        this.activeSlider = ActiveSlider.NONE;
        this.styleDropdownOpen = false;
    }

    private void finalizeClose() {
        if (this.client != null) {
            this.client.setScreen(pendingNextScreen);
        } else {
            super.close();
        }
    }

    @Override
    public void removed() {
        commitPaddingDraft();
        toggleAnim.clear();
        cardHoverAnim.clear();
        focusField = FocusField.NONE;
        activeSlider = ActiveSlider.NONE;
        listeningForKeybind = false;
        styleDropdownOpen = false;
        super.removed();
    }

    private float nextDeltaSeconds() {
        long now = System.nanoTime();
        float dt = lastFrameNanos == 0L ? 0.016f : (now - lastFrameNanos) / 1_000_000_000.0f;
        lastFrameNanos = now;
        return Math.max(0.001f, Math.min(0.05f, dt));
    }

    private float stepToggleAnim(String key, boolean target, boolean smooth, float dt) {
        float goal = target ? 1.0f : 0.0f;
        if (!smooth) {
            toggleAnim.put(key, goal);
            return goal;
        }
        float cur = toggleAnim.getOrDefault(key, goal);
        float next = GuiAnimator.smoothStep(cur, goal, dt, 18.0f);
        toggleAnim.put(key, next);
        return next;
    }

    private float stepHoverAnim(String key, boolean hovered, boolean smooth, float dt) {
        float goal = hovered ? 1.0f : 0.0f;
        if (!smooth) {
            cardHoverAnim.put(key, goal);
            return goal;
        }
        float cur = cardHoverAnim.getOrDefault(key, 0.0f);
        float next = GuiAnimator.smoothStep(cur, goal, dt, 16.0f);
        cardHoverAnim.put(key, next);
        return next;
    }

    private float currentPanelScale() {
        float eased = GuiAnimator.easeOutCubic(openCloseAnim);
        return 0.94f + 0.06f * eased;
    }

    private double mapMouseX(double rawMouseX, int panelX, int panelW) {
        return GuiAnimator.toScaledSpace(rawMouseX, panelX + panelW / 2.0f, currentPanelScale());
    }

    private double mapMouseY(double rawMouseY, int panelY, int panelH) {
        return GuiAnimator.toScaledSpace(rawMouseY, panelY + panelH / 2.0f, currentPanelScale());
    }

    private List<HudModule> visibleModules() {
        List<HudModule> list = new ArrayList<>();
        String q = searchQuery.trim().toLowerCase();
        for (HudModule m : SevenXAirClient.hudManager.getModules()) {
            if (activeCategory != HudModule.Category.ALL && m.category != activeCategory) {
                continue;
            }
            if (!q.isEmpty()
                && !m.displayName.toLowerCase().contains(q)
                && !m.description.toLowerCase().contains(q)
                && !m.category.label.toLowerCase().contains(q)) {
                continue;
            }
            list.add(m);
        }
        return list;
    }

    private String formatKeyName(int keyCode) {
        if (keyCode <= 0) return "None";
        String name = GLFW.glfwGetKeyName(keyCode, 0);
        if (name != null && !name.isBlank()) {
            return name.toUpperCase();
        }
        return "KEY_" + keyCode;
    }

    private void commitPaddingDraft() {
        if (configuringModule == null || paddingDraft.isEmpty()) return;
        try {
            int val = Integer.parseInt(paddingDraft);
            ClientConfig.ModuleState st = configuringModule.state(SevenXAirClient.config);
            st.paddingPx = Math.max(2, Math.min(14, val));
            SevenXAirClient.config.save();
        } catch (NumberFormatException ignored) {
            // Ignore invalid numeric draft
        }
        paddingDraft = "";
    }

    @Override
    public void render(DrawContext ctx, int mouseX, int mouseY, float delta) {
        float dt = nextDeltaSeconds();
        ClientConfig config = SevenXAirClient.config;
        AirTheme theme = config.getTheme();
        boolean smooth = config.smoothGuiAnimations;

        // Step opening / closing animation without blocking Minecraft's main thread
        float openGoal = closing ? 0.0f : 1.0f;
        openCloseAnim = smooth ? GuiAnimator.smoothStep(openCloseAnim, openGoal, dt, closing ? 22.0f : 17.0f) : openGoal;
        if (closing && openCloseAnim <= 0.03f) {
            finalizeClose();
            return;
        }

        // Step category, settings panel, dropdown, and search animations
        categoryAnim = smooth ? GuiAnimator.smoothStep(categoryAnim, 1.0f, dt, 18.0f) : 1.0f;
        settingsPanelAnim = smooth ? GuiAnimator.smoothStep(settingsPanelAnim, 1.0f, dt, 18.0f) : 1.0f;
        styleDropdownAnim = smooth
            ? GuiAnimator.smoothStep(styleDropdownAnim, styleDropdownOpen ? 1.0f : 0.0f, dt, 22.0f)
            : (styleDropdownOpen ? 1.0f : 0.0f);
        boolean searchActive = focusField == FocusField.SEARCH || !searchQuery.isEmpty();
        searchFocusAnim = smooth
            ? GuiAnimator.smoothStep(searchFocusAnim, searchActive ? 1.0f : 0.0f, dt, 16.0f)
            : (searchActive ? 1.0f : 0.0f);
        searchPulseAnim = smooth ? GuiAnimator.smoothStep(searchPulseAnim, 1.0f, dt, 18.0f) : 1.0f;

        renderBackground(ctx, mouseX, mouseY, delta);

        int panelW = Math.min(588, this.width - 20);
        int panelH = Math.min(378, this.height - 20);
        int panelX = (this.width - panelW) / 2;
        int panelY = (this.height - panelH) / 2;
        int sidebarW = 132;
        int headerH = 38;

        // Accurate mouse coordinates mapped into the scaled panel coordinate space
        int mX = (int) Math.round(mapMouseX(mouseX, panelX, panelW));
        int mY = (int) Math.round(mapMouseY(mouseY, panelY, panelH));

        float panelAlpha = GuiAnimator.easeOutCubic(openCloseAnim);
        float scale = currentPanelScale();

        ctx.getMatrices().push();
        try {
            if (Math.abs(scale - 1.0f) > 0.001f) {
                float cx = panelX + panelW / 2.0f;
                float cy = panelY + panelH / 2.0f;
                ctx.getMatrices().translate(cx, cy, 0.0f);
                ctx.getMatrices().scale(scale, scale, 1.0f);
                ctx.getMatrices().translate(-cx, -cy, 0.0f);
            }

            GlassRenderer.drawFloatingGlassPanel(ctx, panelX, panelY, panelW, panelH, theme, config.glassOpacity, true, panelAlpha);

            int divider = GuiAnimator.scaleAlpha(0x24FFFFFF, panelAlpha);
            ctx.fill(panelX + 2, panelY + headerH, panelX + panelW - 2, panelY + headerH + 1, divider);
            ctx.fill(panelX + sidebarW, panelY + headerH + 1, panelX + sidebarW + 1, panelY + panelH - 2, divider);

            // Brand emblem (7X) + title
            GlassRenderer.drawCharcoalCard(ctx, panelX + 10, panelY + 8, 24, 22, theme, true, 0.4f, panelAlpha);
            ctx.drawTextWithShadow(this.textRenderer, "7X", panelX + 16, panelY + 15, GuiAnimator.scaleAlpha(0xFF000000 | theme.accentRgb, panelAlpha));
            ctx.drawTextWithShadow(this.textRenderer, "7xAir", panelX + 40, panelY + 10, GuiAnimator.scaleAlpha(0xFFF8FAFC, panelAlpha));
            ctx.drawTextWithShadow(this.textRenderer, config.activeProfileName, panelX + 40, panelY + 21, GuiAnimator.scaleAlpha(0xFF9CA3AF, panelAlpha));

            // Search bar with smooth focus glow and animated caret
            int searchX = panelX + sidebarW + 14;
            int searchW = Math.max(120, panelW - sidebarW - 146);
            int searchY = panelY + 9;
            boolean searchFocused = focusField == FocusField.SEARCH;
            float searchHover = stepHoverAnim("hdr:search", inBounds(mX, mY, searchX, searchY, searchW, 20), smooth, dt);
            GlassRenderer.drawCharcoalCard(ctx, searchX, searchY, searchW, 20, theme, searchActive, Math.max(searchHover, searchFocusAnim), panelAlpha);
            if (searchFocusAnim > 0.02f) {
                int barW = Math.round((searchW - 6) * GuiAnimator.easeOutCubic(searchFocusAnim));
                ctx.fill(searchX + 3, searchY + 19, searchX + 3 + barW, searchY + 20, GuiAnimator.scaleAlpha(theme.accentArgb(0.88f), panelAlpha));
            }
            boolean caretVisible = searchFocused && ((System.currentTimeMillis() / 480L) % 2L == 0L);
            String searchDisplay = searchQuery.isEmpty()
                ? (caretVisible ? "|" : (searchFocused ? "" : "Search modules..."))
                : (searchQuery + (caretVisible ? "|" : ""));
            ctx.drawTextWithShadow(
                this.textRenderer,
                searchDisplay,
                searchX + 8,
                searchY + 6,
                GuiAnimator.scaleAlpha(searchQuery.isEmpty() && !searchFocused ? 0xFF71717A : 0xFFF8FAFC, panelAlpha)
            );

            // Close & HUD Editor buttons
            int closeX = panelX + panelW - 28;
            int closeY = panelY + 9;
            boolean closeHover = inBounds(mX, mY, closeX, closeY, 20, 20);
            float closeHovAnim = stepHoverAnim("hdr:close", closeHover, smooth, dt);
            GlassRenderer.drawCharcoalCard(ctx, closeX, closeY, 20, 20, theme, closeHover, closeHovAnim, panelAlpha);
            ctx.drawTextWithShadow(this.textRenderer, "X", closeX + 7, closeY + 6, GuiAnimator.scaleAlpha(closeHover ? 0xFFFCA5A5 : 0xFFE5E7EB, panelAlpha));

            int hudBtnW = 84;
            int hudBtnX = closeX - hudBtnW - 8;
            GlassRenderer.drawGlassPillButton(
                ctx, this.textRenderer, hudBtnX, closeY, hudBtnW, 20, "HUD Editor",
                theme, config.glassOpacity, true, inBounds(mX, mY, hudBtnX, closeY, hudBtnW, 20), panelAlpha
            );

            // Left Category Sidebar with gliding red active indicator
            int navY = panelY + headerH + 8;
            int targetIndicatorY = navY;
            for (HudModule.Category cat : HudModule.Category.values()) {
                boolean isActive = viewMode == ViewMode.MODULES && configuringModule == null && cat == activeCategory;
                if (isActive) {
                    targetIndicatorY = navY;
                }
                boolean hovered = inBounds(mX, mY, panelX + 8, navY, sidebarW - 16, 22);
                GlassRenderer.drawSidebarItem(
                    ctx, this.textRenderer, panelX + 8, navY, sidebarW - 16, 22,
                    cat.icon, cat.label, theme, isActive, hovered, false, panelAlpha
                );
                navY += 24;
            }

            int footY = panelY + panelH - 54;
            ctx.fill(panelX + 10, footY - 4, panelX + sidebarW - 10, footY - 3, GuiAnimator.scaleAlpha(0x22FFFFFF, panelAlpha));
            if (viewMode == ViewMode.PROFILES) targetIndicatorY = footY;
            if (viewMode == ViewMode.SETTINGS) targetIndicatorY = footY + 24;

            GlassRenderer.drawSidebarItem(
                ctx, this.textRenderer, panelX + 8, footY, sidebarW - 16, 22,
                "\u2605", "Profiles", theme, viewMode == ViewMode.PROFILES,
                inBounds(mX, mY, panelX + 8, footY, sidebarW - 16, 22), false, panelAlpha
            );
            GlassRenderer.drawSidebarItem(
                ctx, this.textRenderer, panelX + 8, footY + 24, sidebarW - 16, 22,
                "\u2699", "Settings", theme, viewMode == ViewMode.SETTINGS,
                inBounds(mX, mY, panelX + 8, footY + 24, sidebarW - 16, 22), false, panelAlpha
            );

            if (sidebarIndicatorY < 0.0f || !smooth) {
                sidebarIndicatorY = targetIndicatorY;
            } else {
                sidebarIndicatorY = GuiAnimator.smoothStep(sidebarIndicatorY, targetIndicatorY, dt, 20.0f);
            }
            if (configuringModule == null) {
                GlassRenderer.drawGlidingIndicator(ctx, panelX + 8, Math.round(sidebarIndicatorY), 22, theme, panelAlpha);
            }

            // Content area with smooth category/settings/search slide transitions
            float contentProgress = configuringModule != null
                ? GuiAnimator.easeOutCubic(settingsPanelAnim)
                : GuiAnimator.easeOutCubic(Math.min(categoryAnim, searchPulseAnim));
            int slideOffset = Math.round((1.0f - contentProgress) * 8.0f);
            float contentAlpha = panelAlpha * (0.35f + 0.65f * contentProgress);

            int contentX = panelX + sidebarW + 14;
            int contentY = panelY + headerH + 10 + slideOffset;
            int contentW = panelW - sidebarW - 26;
            int contentH = panelH - headerH - 18;

            if (configuringModule != null) {
                renderModuleSettingsPanel(ctx, mX, mY, contentX, contentY, contentW, config, theme, dt, contentAlpha);
            } else if (viewMode == ViewMode.SETTINGS) {
                renderGlobalSettingsPanel(ctx, mX, mY, contentX, contentY, contentW, config, theme, dt, contentAlpha);
            } else if (viewMode == ViewMode.PROFILES) {
                renderProfilesPanel(ctx, mX, mY, contentX, contentY, contentW, config, theme, contentAlpha);
            } else {
                renderModulesGrid(ctx, mX, mY, contentX, contentY, contentW, contentH, config, theme, dt, contentAlpha);
            }
        } finally {
            ctx.getMatrices().pop();
        }

        super.render(ctx, mouseX, mouseY, delta);
    }

    private void renderModulesGrid(
        DrawContext ctx,
        int mouseX,
        int mouseY,
        int x,
        int y,
        int w,
        int h,
        ClientConfig config,
        AirTheme theme,
        float dt,
        float alpha
    ) {
        List<HudModule> list = visibleModules();
        String keyLabel = AirKeybinds.openGuiKey != null
            ? AirKeybinds.openGuiKey.getBoundKeyLocalizedText().getString()
            : "Right Shift";
        ctx.drawTextWithShadow(this.textRenderer, activeCategory.label + " (" + list.size() + ")", x, y, GuiAnimator.scaleAlpha(0xFFF8FAFC, alpha));
        String hint = "GUI Key: " + keyLabel;
        ctx.drawTextWithShadow(this.textRenderer, hint, x + w - this.textRenderer.getWidth(hint), y, GuiAnimator.scaleAlpha(0xFF71717A, alpha));

        int colW = (w - 10) / 2;
        int cardH = 54;
        int startY = y + 16;
        int startIdx = Math.max(0, scrollRowOffset * 2);

        // Clip scrollable card grid cleanly inside panel bounds
        GuiAnimator.withScissor(ctx, x - 2, startY - 2, x + w + 2, y + h, () -> {
            for (int i = startIdx; i < list.size(); i++) {
                int visIdx = i - startIdx;
                int col = visIdx % 2;
                int row = visIdx / 2;
                int cx = x + col * (colW + 10);
                int cy = startY + row * (cardH + 8);
                if (cy > y + h) break;

                HudModule m = list.get(i);
                ClientConfig.ModuleState st = m.state(config);
                boolean hovered = inBounds(mouseX, mouseY, cx, cy, colW, cardH);
                float hovP = stepHoverAnim("card:" + m.id, hovered, config.smoothGuiAnimations, dt);
                GlassRenderer.drawCharcoalCard(ctx, cx, cy, colW, cardH, theme, st.enabled, hovP, alpha);

                ctx.drawTextWithShadow(this.textRenderer, m.displayName, cx + 10, cy + 8, GuiAnimator.scaleAlpha(0xFFF8FAFC, alpha));
                String desc = this.textRenderer.getWidth(m.description) > colW - 20
                    ? this.textRenderer.trimToWidth(m.description, colW - 26) + "..."
                    : m.description;
                ctx.drawTextWithShadow(this.textRenderer, desc, cx + 10, cy + 21, GuiAnimator.scaleAlpha(0xFF9CA3AF, alpha));

                String meta = m.category.label + " \u00B7 Key: " + formatKeyName(st.keybindCode);
                ctx.drawTextWithShadow(this.textRenderer, meta, cx + 10, cy + 36, GuiAnimator.scaleAlpha(0xFF71717A, alpha));

                int gearX = cx + colW - 60;
                int gearY = cy + 8;
                float gearHov = stepHoverAnim("gear:" + m.id, inBounds(mouseX, mouseY, gearX, gearY, 18, 18), config.smoothGuiAnimations, dt);
                GlassRenderer.drawCharcoalCard(ctx, gearX, gearY, 18, 18, theme, false, gearHov, alpha);
                ctx.drawTextWithShadow(this.textRenderer, "\u2699", gearX + 6, gearY + 5, GuiAnimator.scaleAlpha(0xFFD4D4D8, alpha));

                float animP = stepToggleAnim("mod:" + m.id, st.enabled, config.smoothGuiAnimations, dt);
                GlassRenderer.drawAnimatedToggleSwitch(ctx, cx + colW - 36, cy + 10, 26, 14, theme, animP, alpha);
            }
        });
    }

    private void renderModuleSettingsPanel(
        DrawContext ctx,
        int mouseX,
        int mouseY,
        int x,
        int y,
        int w,
        ClientConfig config,
        AirTheme theme,
        float dt,
        float alpha
    ) {
        HudModule mod = configuringModule;
        ClientConfig.ModuleState st = mod.state(config);

        GlassRenderer.drawGlassPillButton(
            ctx, this.textRenderer, x, y, 64, 19, "< Back",
            theme, config.glassOpacity, false, inBounds(mouseX, mouseY, x, y, 64, 19), alpha
        );
        ctx.drawTextWithShadow(this.textRenderer, mod.displayName + " (" + mod.category.label + ")", x + 72, y + 5, GuiAnimator.scaleAlpha(0xFFF8FAFC, alpha));

        int halfW = (w - 8) / 2;
        int r1 = y + 25;
        drawAnimatedToggleRow(ctx, mouseX, mouseY, x, r1, halfW, "Enabled", "cfg:en:" + mod.id, st.enabled, theme, config, dt, alpha);
        drawAnimatedToggleRow(ctx, mouseX, mouseY, x + halfW + 8, r1, halfW, "Text Shadow", "cfg:sh:" + mod.id, st.textShadow, theme, config, dt, alpha);

        int r2 = r1 + 28;
        drawAnimatedToggleRow(ctx, mouseX, mouseY, x, r2, halfW, "Glass Panel", "cfg:bg:" + mod.id, st.showGlassBackdrop, theme, config, dt, alpha);
        drawSettingRowButton(
            ctx, mouseX, mouseY, x + halfW + 8, r2, halfW,
            "Keybind", listeningForKeybind ? "Press..." : formatKeyName(st.keybindCode),
            listeningForKeybind || st.keybindCode > 0, theme, config, alpha
        );

        int r3 = r2 + 28;
        drawSettingRowButton(ctx, mouseX, mouseY, x, r3, halfW, "Style", st.displayStyle + " \u25BE", styleDropdownOpen, theme, config, alpha);

        boolean padFocused = focusField == FocusField.MODULE_PADDING;
        float padHov = stepHoverAnim("cfg:pad", inBounds(mouseX, mouseY, x + halfW + 8, r3, halfW, 24), config.smoothGuiAnimations, dt);
        GlassRenderer.drawCharcoalCard(ctx, x + halfW + 8, r3, halfW, 24, theme, padFocused, padHov, alpha);
        String padText = padFocused ? (paddingDraft + "|") : (st.paddingPx + " px");
        ctx.drawTextWithShadow(this.textRenderer, "Padding (2-14):", x + halfW + 16, r3 + 8, GuiAnimator.scaleAlpha(0xFFD4D4D8, alpha));
        ctx.drawTextWithShadow(this.textRenderer, padText, x + w - 42, r3 + 8, GuiAnimator.scaleAlpha(0xFFF8FAFC, alpha));

        int r4 = r3 + 28;
        boolean prefFocused = focusField == FocusField.MODULE_PREFIX;
        float prefHov = stepHoverAnim("cfg:pref", inBounds(mouseX, mouseY, x, r4, w, 24), config.smoothGuiAnimations, dt);
        GlassRenderer.drawCharcoalCard(ctx, x, r4, w, 24, theme, prefFocused, prefHov, alpha);
        String prefShow = st.customPrefix.isEmpty()
            ? (prefFocused ? "|" : "Click to set prefix text...")
            : (st.customPrefix + (prefFocused ? "|" : ""));
        ctx.drawTextWithShadow(this.textRenderer, "Prefix Text:", x + 10, r4 + 8, GuiAnimator.scaleAlpha(0xFFD4D4D8, alpha));
        ctx.drawTextWithShadow(this.textRenderer, prefShow, x + 84, r4 + 8, GuiAnimator.scaleAlpha(st.customPrefix.isEmpty() && !prefFocused ? 0xFF71717A : 0xFFF8FAFC, alpha));

        int r5 = r4 + 30;
        drawDragSlider(ctx, x, r5, halfW, "HUD Scale: " + String.format("%.1fx", st.scale), (st.scale - 0.6f) / (1.8f - 0.6f), theme, alpha);
        float effOp = st.opacityOverride >= 0f ? st.opacityOverride : config.glassOpacity;
        drawDragSlider(ctx, x + halfW + 8, r5, halfW, "Opacity: " + Math.round(effOp * 100) + "%", (effOp - 0.16f) / (0.72f - 0.16f), theme, alpha);

        int r6 = r5 + 32;
        ctx.drawTextWithShadow(this.textRenderer, "Color Picker", x, r6, GuiAnimator.scaleAlpha(0xFFD4D4D8, alpha));
        int swY = r6 + 12;
        for (int i = 0; i < COLOR_PRESETS.length; i++) {
            int sx = x + i * 24;
            if (st.textColorRgb == COLOR_PRESETS[i]) {
                ctx.fill(sx - 2, swY - 2, sx + 18, swY + 18, GuiAnimator.scaleAlpha(0xFFFFFFFF, alpha));
            }
            ctx.fill(sx, swY, sx + 16, swY + 16, GuiAnimator.scaleAlpha(0xFF000000 | COLOR_PRESETS[i], alpha));
        }
        GlassRenderer.drawGlassPillButton(
            ctx, this.textRenderer, x + w - 120, swY - 2, 120, 20, "Reset Module",
            theme, config.glassOpacity, false, inBounds(mouseX, mouseY, x + w - 120, swY - 2, 120, 20), alpha
        );

        // Smoothly animated, scissor-clipped Style Dropdown on an elevated GUI Z-layer
        if (styleDropdownAnim > 0.02f) {
            int ddY = r3 + 25;
            int fullH = STYLE_OPTIONS.length * 20 + 6;
            int visH = Math.max(4, Math.round(fullH * GuiAnimator.easeOutCubic(styleDropdownAnim)));
            float ddAlpha = alpha * GuiAnimator.easeOutCubic(styleDropdownAnim);

            ctx.getMatrices().push();
            try {
                if (RendererCompat.supportsZLayerOffset()) {
                    ctx.getMatrices().translate(0.0f, 0.0f, 120.0f);
                }
                GuiAnimator.withScissor(ctx, x - 3, ddY - 2, x + halfW + 3, ddY + visH + 3, () -> {
                    GlassRenderer.drawFloatingGlassPanel(ctx, x, ddY, halfW, visH, theme, 0.72f, true, ddAlpha);
                    for (int i = 0; i < STYLE_OPTIONS.length; i++) {
                        String opt = STYLE_OPTIONS[i];
                        int oy = ddY + 3 + i * 20;
                        boolean hov = styleDropdownOpen && inBounds(mouseX, mouseY, x + 3, oy, halfW - 6, 18);
                        if (hov || opt.equals(st.displayStyle)) {
                            ctx.fill(x + 3, oy, x + halfW - 3, oy + 18, GuiAnimator.scaleAlpha(theme.accentArgb(hov ? 0.35f : 0.2f), ddAlpha));
                        }
                        ctx.drawTextWithShadow(this.textRenderer, opt, x + 10, oy + 5, GuiAnimator.scaleAlpha(0xFFF8FAFC, ddAlpha));
                    }
                });
            } finally {
                ctx.getMatrices().pop();
            }
        }
    }

    private void drawAnimatedToggleRow(
        DrawContext ctx,
        int mouseX,
        int mouseY,
        int x,
        int y,
        int w,
        String label,
        String animKey,
        boolean enabled,
        AirTheme theme,
        ClientConfig config,
        float dt,
        float alpha
    ) {
        float hov = stepHoverAnim("row:" + animKey, inBounds(mouseX, mouseY, x, y, w, 24), config.smoothGuiAnimations, dt);
        GlassRenderer.drawCharcoalCard(ctx, x, y, w, 24, theme, false, hov, alpha);
        ctx.drawTextWithShadow(this.textRenderer, label, x + 8, y + 8, GuiAnimator.scaleAlpha(0xFFE5E7EB, alpha));
        float p = stepToggleAnim(animKey, enabled, config.smoothGuiAnimations, dt);
        GlassRenderer.drawAnimatedToggleSwitch(ctx, x + w - 34, y + 5, 26, 14, theme, p, alpha);
    }

    private void drawDragSlider(DrawContext ctx, int x, int y, int w, String label, float norm, AirTheme theme, float alpha) {
        ctx.drawTextWithShadow(this.textRenderer, label, x, y, GuiAnimator.scaleAlpha(0xFFD4D4D8, alpha));
        int trackY = y + 13;
        ctx.fill(x, trackY, x + w, trackY + 5, GuiAnimator.scaleAlpha(0x3AFFFFFF, alpha));
        int fillW = Math.round(GuiAnimator.clamp01(norm) * w);
        ctx.fill(x, trackY, x + fillW, trackY + 5, GuiAnimator.scaleAlpha(theme.accentArgb(0.92f), alpha));
        ctx.fill(x + fillW - 3, trackY - 3, x + fillW + 3, trackY + 8, GuiAnimator.scaleAlpha(0xFFFFFFFF, alpha));
    }

    private void renderGlobalSettingsPanel(
        DrawContext ctx,
        int mouseX,
        int mouseY,
        int x,
        int y,
        int w,
        ClientConfig config,
        AirTheme theme,
        float dt,
        float alpha
    ) {
        ctx.drawTextWithShadow(this.textRenderer, "Client Settings", x, y, GuiAnimator.scaleAlpha(0xFFF8FAFC, alpha));
        int rowY = y + 18;
        drawAnimatedToggleRow(ctx, mouseX, mouseY, x, rowY, w, "HUD Visible", "g:hud", config.hudVisible, theme, config, dt, alpha);
        rowY += 28;
        drawAnimatedToggleRow(ctx, mouseX, mouseY, x, rowY, w, "Toggle Sprint", "g:sprint", config.toggleSprintActive, theme, config, dt, alpha);
        rowY += 28;
        drawAnimatedToggleRow(ctx, mouseX, mouseY, x, rowY, w, "Snap HUD to Grid", "g:grid", config.snapToGrid, theme, config, dt, alpha);
        rowY += 28;
        drawAnimatedToggleRow(ctx, mouseX, mouseY, x, rowY, w, "Smooth GUI Animations", "g:anim", config.smoothGuiAnimations, theme, config, dt, alpha);
        rowY += 30;
        drawSettingRowButton(ctx, mouseX, mouseY, x, rowY, w, "Theme: " + theme.displayName, "Next", true, theme, config, alpha);
        rowY += 34;
        drawDragSlider(ctx, x, rowY, w, "Global Glass Transparency (" + Math.round(config.glassOpacity * 100) + "%)", (config.glassOpacity - 0.20f) / (0.72f - 0.20f), theme, alpha);
    }

    private void renderProfilesPanel(
        DrawContext ctx,
        int mouseX,
        int mouseY,
        int x,
        int y,
        int w,
        ClientConfig config,
        AirTheme theme,
        float alpha
    ) {
        ctx.drawTextWithShadow(this.textRenderer, "Profiles & Configuration", x, y, GuiAnimator.scaleAlpha(0xFFF8FAFC, alpha));
        ctx.drawTextWithShadow(this.textRenderer, "Saved atomically to config/7xair-client.json", x, y + 13, GuiAnimator.scaleAlpha(0xFF9CA3AF, alpha));

        String[] profiles = { "Default", "PvP", "Minimal" };
        int py = y + 32;
        for (String name : profiles) {
            boolean active = name.equalsIgnoreCase(config.activeProfileName);
            drawSettingRowButton(ctx, mouseX, mouseY, x, py, w, "Profile: " + name, active ? "Active" : "Apply", active, theme, config, alpha);
            py += 30;
        }

        int actY = py + 10;
        GlassRenderer.drawGlassPillButton(ctx, this.textRenderer, x, actY, 118, 22, "Save Config", theme, config.glassOpacity, true, inBounds(mouseX, mouseY, x, actY, 118, 22), alpha);
        GlassRenderer.drawGlassPillButton(ctx, this.textRenderer, x + 126, actY, 118, 22, "Reload Disk", theme, config.glassOpacity, false, inBounds(mouseX, mouseY, x + 126, actY, 118, 22), alpha);
        GlassRenderer.drawGlassPillButton(ctx, this.textRenderer, x + 252, actY, 130, 22, "Reset All HUD", theme, config.glassOpacity, false, inBounds(mouseX, mouseY, x + 252, actY, 130, 22), alpha);
    }

    private void drawSettingRowButton(
        DrawContext ctx,
        int mouseX,
        int mouseY,
        int x,
        int y,
        int w,
        String label,
        String btnText,
        boolean active,
        AirTheme theme,
        ClientConfig config,
        float alpha
    ) {
        GlassRenderer.drawCharcoalCard(ctx, x, y, w, 24, theme, false, inBounds(mouseX, mouseY, x, y, w, 24) ? 1.0f : 0.0f, alpha);
        ctx.drawTextWithShadow(this.textRenderer, label, x + 8, y + 8, GuiAnimator.scaleAlpha(0xFFE5E7EB, alpha));
        GlassRenderer.drawGlassPillButton(
            ctx, this.textRenderer, x + w - 72, y + 3, 66, 18, btnText,
            theme, config.glassOpacity, active, inBounds(mouseX, mouseY, x + w - 72, y + 3, 66, 18), alpha
        );
    }

    private void applyProfilePreset(String profileName, ClientConfig config) {
        config.activeProfileName = profileName;
        for (HudModule m : SevenXAirClient.hudManager.getModules()) {
            ClientConfig.ModuleState st = m.state(config);
            if ("PvP".equals(profileName)) {
                st.enabled = m.id.equals("fps") || m.id.equals("cps") || m.id.equals("ping")
                    || m.id.equals("toggle_sprint") || m.id.equals("keystrokes") || m.id.equals("armor") || m.id.equals("potions");
            } else if ("Minimal".equals(profileName)) {
                st.enabled = m.id.equals("fps") || m.id.equals("ping");
            } else {
                st.enabled = m.defaultEnabled;
            }
        }
        CombatTracker.pushNotification("Profile: " + profileName);
        config.save();
    }

    @Override
    public boolean charTyped(char chr, int modifiers) {
        if (closing || listeningForKeybind) return true;
        if (focusField == FocusField.MODULE_PADDING && configuringModule != null) {
            if (chr >= '0' && chr <= '9' && paddingDraft.length() < 2) {
                paddingDraft += chr;
                return true;
            }
            return true;
        }
        if (focusField == FocusField.MODULE_PREFIX && configuringModule != null) {
            ClientConfig.ModuleState st = configuringModule.state(SevenXAirClient.config);
            if (chr >= 32 && chr != 127 && st.customPrefix.length() < 16) {
                st.customPrefix += chr;
                SevenXAirClient.config.save();
            }
            return true;
        }
        if (chr >= 32 && chr != 127 && searchQuery.length() < 24) {
            focusField = FocusField.SEARCH;
            searchQuery += chr;
            configuringModule = null;
            viewMode = ViewMode.MODULES;
            scrollRowOffset = 0;
            searchPulseAnim = 0.25f;
            return true;
        }
        return super.charTyped(chr, modifiers);
    }

    @Override
    public boolean keyPressed(int keyCode, int scanCode, int modifiers) {
        if (closing && keyCode == GLFW.GLFW_KEY_ESCAPE) {
            finalizeClose();
            return true;
        }
        if (listeningForKeybind && configuringModule != null) {
            ClientConfig.ModuleState st = configuringModule.state(SevenXAirClient.config);
            if (keyCode == GLFW.GLFW_KEY_ESCAPE || keyCode == GLFW.GLFW_KEY_DELETE || keyCode == GLFW.GLFW_KEY_BACKSPACE) {
                st.keybindCode = -1;
            } else {
                st.keybindCode = keyCode;
            }
            listeningForKeybind = false;
            SevenXAirClient.config.save();
            return true;
        }
        if (focusField == FocusField.MODULE_PADDING) {
            if (keyCode == GLFW.GLFW_KEY_BACKSPACE && !paddingDraft.isEmpty()) {
                paddingDraft = paddingDraft.substring(0, paddingDraft.length() - 1);
                return true;
            }
            if (keyCode == GLFW.GLFW_KEY_ENTER || keyCode == GLFW.GLFW_KEY_KP_ENTER) {
                commitPaddingDraft();
                focusField = FocusField.NONE;
                return true;
            }
        }
        if (focusField == FocusField.MODULE_PREFIX && configuringModule != null) {
            ClientConfig.ModuleState st = configuringModule.state(SevenXAirClient.config);
            if (keyCode == GLFW.GLFW_KEY_BACKSPACE && !st.customPrefix.isEmpty()) {
                st.customPrefix = st.customPrefix.substring(0, st.customPrefix.length() - 1);
                SevenXAirClient.config.save();
                return true;
            }
            if (keyCode == GLFW.GLFW_KEY_ENTER || keyCode == GLFW.GLFW_KEY_KP_ENTER) {
                focusField = FocusField.NONE;
                return true;
            }
        }
        if (keyCode == GLFW.GLFW_KEY_BACKSPACE && !searchQuery.isEmpty()) {
            searchQuery = searchQuery.substring(0, searchQuery.length() - 1);
            scrollRowOffset = 0;
            searchPulseAnim = 0.25f;
            return true;
        }
        return super.keyPressed(keyCode, scanCode, modifiers);
    }

    @Override
    public boolean mouseScrolled(double mouseX, double mouseY, double horizontalAmount, double verticalAmount) {
        if (closing) return true;
        if (viewMode == ViewMode.MODULES && configuringModule == null) {
            int totalRows = (visibleModules().size() + 1) / 2;
            int maxOffset = Math.max(0, totalRows - 4);
            scrollRowOffset = Math.max(0, Math.min(maxOffset, scrollRowOffset + (verticalAmount < 0 ? 1 : -1)));
            return true;
        }
        return super.mouseScrolled(mouseX, mouseY, horizontalAmount, verticalAmount);
    }

    @Override
    public boolean mouseClicked(double rawMouseX, double rawMouseY, int button) {
        if (closing || button != 0) return true;
        ClientConfig config = SevenXAirClient.config;
        int panelW = Math.min(588, this.width - 20);
        int panelH = Math.min(378, this.height - 20);
        int panelX = (this.width - panelW) / 2;
        int panelY = (this.height - panelH) / 2;
        int sidebarW = 132;
        int headerH = 38;

        double mouseX = mapMouseX(rawMouseX, panelX, panelW);
        double mouseY = mapMouseY(rawMouseY, panelY, panelH);

        commitPaddingDraft();
        focusField = FocusField.NONE;

        int contentX = panelX + sidebarW + 14;
        int contentY = panelY + headerH + 10;
        int contentW = panelW - sidebarW - 26;
        int halfW = (contentW - 8) / 2;

        // Handle open Style Dropdown overlay FIRST so clicks never bleed through
        if (configuringModule != null && styleDropdownOpen) {
            int ddY = contentY + 25 + 28 + 28 + 25;
            for (int i = 0; i < STYLE_OPTIONS.length; i++) {
                int oy = ddY + 3 + i * 20;
                if (inBounds(mouseX, mouseY, contentX + 3, oy, halfW - 6, 18)) {
                    configuringModule.state(config).displayStyle = STYLE_OPTIONS[i];
                    config.save();
                    styleDropdownOpen = false;
                    return true;
                }
            }
            styleDropdownOpen = false;
            return true;
        }

        // Search box focus
        int searchX = panelX + sidebarW + 14;
        int searchW = Math.max(120, panelW - sidebarW - 146);
        if (inBounds(mouseX, mouseY, searchX, panelY + 9, searchW, 20)) {
            focusField = FocusField.SEARCH;
            return true;
        }

        // Close & HUD Editor
        int closeX = panelX + panelW - 28;
        int closeY = panelY + 9;
        if (inBounds(mouseX, mouseY, closeX, closeY, 20, 20)) {
            close();
            return true;
        }
        int hudBtnW = 84;
        int hudBtnX = closeX - hudBtnW - 8;
        if (inBounds(mouseX, mouseY, hudBtnX, closeY, hudBtnW, 20)) {
            closeToScreen(new HudEditorScreen(this));
            return true;
        }

        // Left Category Sidebar
        int navY = panelY + headerH + 8;
        for (HudModule.Category cat : HudModule.Category.values()) {
            if (inBounds(mouseX, mouseY, panelX + 8, navY, sidebarW - 16, 22)) {
                viewMode = ViewMode.MODULES;
                activeCategory = cat;
                configuringModule = null;
                listeningForKeybind = false;
                styleDropdownOpen = false;
                scrollRowOffset = 0;
                categoryAnim = 0.0f;
                return true;
            }
            navY += 24;
        }

        int footY = panelY + panelH - 54;
        if (inBounds(mouseX, mouseY, panelX + 8, footY, sidebarW - 16, 22)) {
            viewMode = ViewMode.PROFILES;
            configuringModule = null;
            listeningForKeybind = false;
            styleDropdownOpen = false;
            categoryAnim = 0.0f;
            return true;
        }
        if (inBounds(mouseX, mouseY, panelX + 8, footY + 24, sidebarW - 16, 22)) {
            viewMode = ViewMode.SETTINGS;
            configuringModule = null;
            listeningForKeybind = false;
            styleDropdownOpen = false;
            categoryAnim = 0.0f;
            return true;
        }

        // Module Settings interactions
        if (configuringModule != null) {
            ClientConfig.ModuleState st = configuringModule.state(config);
            if (inBounds(mouseX, mouseY, contentX, contentY, 64, 19)) {
                configuringModule = null;
                listeningForKeybind = false;
                styleDropdownOpen = false;
                categoryAnim = 0.0f;
                return true;
            }
            int r1 = contentY + 25;
            if (inBounds(mouseX, mouseY, contentX, r1, halfW, 24)) {
                st.enabled = !st.enabled;
                config.save();
                return true;
            }
            if (inBounds(mouseX, mouseY, contentX + halfW + 8, r1, halfW, 24)) {
                st.textShadow = !st.textShadow;
                config.save();
                return true;
            }
            int r2 = r1 + 28;
            if (inBounds(mouseX, mouseY, contentX, r2, halfW, 24)) {
                st.showGlassBackdrop = !st.showGlassBackdrop;
                config.save();
                return true;
            }
            if (inBounds(mouseX, mouseY, contentX + halfW + 8, r2, halfW, 24)) {
                listeningForKeybind = !listeningForKeybind;
                return true;
            }
            int r3 = r2 + 28;
            if (inBounds(mouseX, mouseY, contentX, r3, halfW, 24)) {
                styleDropdownOpen = !styleDropdownOpen;
                return true;
            }
            if (inBounds(mouseX, mouseY, contentX + halfW + 8, r3, halfW, 24)) {
                focusField = FocusField.MODULE_PADDING;
                paddingDraft = String.valueOf(st.paddingPx);
                return true;
            }
            int r4 = r3 + 28;
            if (inBounds(mouseX, mouseY, contentX, r4, contentW, 24)) {
                focusField = FocusField.MODULE_PREFIX;
                return true;
            }
            int r5 = r4 + 30;
            if (inBounds(mouseX, mouseY, contentX, r5 + 8, halfW, 18)) {
                activeSlider = ActiveSlider.MODULE_SCALE;
                updateSliderFromMouse(mouseX, contentX, halfW);
                return true;
            }
            if (inBounds(mouseX, mouseY, contentX + halfW + 8, r5 + 8, halfW, 18)) {
                activeSlider = ActiveSlider.MODULE_OPACITY;
                updateSliderFromMouse(mouseX, contentX + halfW + 8, halfW);
                return true;
            }
            int swY = r5 + 32 + 12;
            for (int i = 0; i < COLOR_PRESETS.length; i++) {
                int sx = contentX + i * 24;
                if (inBounds(mouseX, mouseY, sx, swY, 16, 16)) {
                    st.textColorRgb = COLOR_PRESETS[i];
                    config.save();
                    return true;
                }
            }
            if (inBounds(mouseX, mouseY, contentX + contentW - 120, swY - 2, 120, 20)) {
                configuringModule.resetPosition(config);
                st.displayStyle = "Glass";
                st.paddingPx = 6;
                st.customPrefix = "";
                config.save();
                return true;
            }
            return true;
        }

        // Global Settings interactions
        if (viewMode == ViewMode.SETTINGS) {
            int rowY = contentY + 18;
            if (inBounds(mouseX, mouseY, contentX, rowY, contentW, 24)) {
                config.hudVisible = !config.hudVisible;
                config.save();
                return true;
            }
            rowY += 28;
            if (inBounds(mouseX, mouseY, contentX, rowY, contentW, 24)) {
                config.toggleSprintActive = !config.toggleSprintActive;
                config.save();
                return true;
            }
            rowY += 28;
            if (inBounds(mouseX, mouseY, contentX, rowY, contentW, 24)) {
                config.snapToGrid = !config.snapToGrid;
                config.save();
                return true;
            }
            rowY += 28;
            if (inBounds(mouseX, mouseY, contentX, rowY, contentW, 24)) {
                config.smoothGuiAnimations = !config.smoothGuiAnimations;
                config.save();
                return true;
            }
            rowY += 30;
            if (inBounds(mouseX, mouseY, contentX, rowY, contentW, 24)) {
                AirTheme[] all = AirTheme.values();
                config.setTheme(all[(config.getTheme().ordinal() + 1) % all.length]);
                config.save();
                return true;
            }
            rowY += 34;
            if (inBounds(mouseX, mouseY, contentX, rowY + 8, contentW, 18)) {
                activeSlider = ActiveSlider.GLOBAL_OPACITY;
                updateSliderFromMouse(mouseX, contentX, contentW);
                return true;
            }
            return true;
        }

        // Profiles interactions
        if (viewMode == ViewMode.PROFILES) {
            String[] profiles = { "Default", "PvP", "Minimal" };
            int py = contentY + 32;
            for (String name : profiles) {
                if (inBounds(mouseX, mouseY, contentX, py, contentW, 24)) {
                    applyProfilePreset(name, config);
                    return true;
                }
                py += 30;
            }
            int actY = py + 10;
            if (inBounds(mouseX, mouseY, contentX, actY, 118, 22)) {
                config.save();
                return true;
            }
            if (inBounds(mouseX, mouseY, contentX + 126, actY, 118, 22)) {
                SevenXAirClient.config = ClientConfig.load();
                return true;
            }
            if (inBounds(mouseX, mouseY, contentX + 252, actY, 130, 22)) {
                SevenXAirClient.hudManager.resetAllPositions(config);
                return true;
            }
            return true;
        }

        // Modules grid interactions
        List<HudModule> list = visibleModules();
        int colW = (contentW - 10) / 2;
        int cardH = 54;
        int startY = contentY + 16;
        int startIdx = Math.max(0, scrollRowOffset * 2);
        int contentH = panelH - headerH - 18;
        for (int i = startIdx; i < list.size(); i++) {
            int visIdx = i - startIdx;
            int col = visIdx % 2;
            int row = visIdx / 2;
            int cx = contentX + col * (colW + 10);
            int cy = startY + row * (cardH + 8);
            if (cy + cardH > contentY + contentH) break;
            int gearX = cx + colW - 60;
            int gearY = cy + 8;
            if (inBounds(mouseX, mouseY, gearX, gearY, 18, 18)) {
                configuringModule = list.get(i);
                listeningForKeybind = false;
                styleDropdownOpen = false;
                settingsPanelAnim = 0.0f;
                return true;
            }
            if (inBounds(mouseX, mouseY, cx, cy, colW, cardH)) {
                ClientConfig.ModuleState st = list.get(i).state(config);
                st.enabled = !st.enabled;
                CombatTracker.pushNotification(list.get(i).displayName + (st.enabled ? " ON" : " OFF"));
                config.save();
                return true;
            }
        }

        return inBounds(mouseX, mouseY, panelX, panelY, panelW, panelH) || super.mouseClicked(rawMouseX, rawMouseY, button);
    }

    @Override
    public boolean mouseDragged(double rawMouseX, double rawMouseY, int button, double deltaX, double deltaY) {
        if (closing) return true;
        if (activeSlider != ActiveSlider.NONE) {
            int panelW = Math.min(588, this.width - 20);
            int panelX = (this.width - panelW) / 2;
            double mouseX = mapMouseX(rawMouseX, panelX, panelW);
            int contentX = panelX + 132 + 14;
            int contentW = panelW - 132 - 26;
            int halfW = (contentW - 8) / 2;
            if (activeSlider == ActiveSlider.GLOBAL_OPACITY) {
                updateSliderFromMouse(mouseX, contentX, contentW);
            } else if (activeSlider == ActiveSlider.MODULE_SCALE) {
                updateSliderFromMouse(mouseX, contentX, halfW);
            } else if (activeSlider == ActiveSlider.MODULE_OPACITY) {
                updateSliderFromMouse(mouseX, contentX + halfW + 8, halfW);
            }
            return true;
        }
        return super.mouseDragged(rawMouseX, rawMouseY, button, deltaX, deltaY);
    }

    @Override
    public boolean mouseReleased(double mouseX, double mouseY, int button) {
        if (activeSlider != ActiveSlider.NONE) {
            activeSlider = ActiveSlider.NONE;
            SevenXAirClient.config.save();
            return true;
        }
        return super.mouseReleased(mouseX, mouseY, button);
    }

    private void updateSliderFromMouse(double mouseX, int sliderX, int sliderW) {
        float norm = (float) Math.max(0.0, Math.min(1.0, (mouseX - sliderX) / (double) sliderW));
        if (activeSlider == ActiveSlider.GLOBAL_OPACITY) {
            SevenXAirClient.config.glassOpacity = 0.20f + norm * (0.72f - 0.20f);
        } else if (activeSlider == ActiveSlider.MODULE_SCALE && configuringModule != null) {
            float raw = 0.6f + norm * (1.8f - 0.6f);
            configuringModule.state(SevenXAirClient.config).scale = Math.round(raw * 10f) / 10f;
        } else if (activeSlider == ActiveSlider.MODULE_OPACITY && configuringModule != null) {
            configuringModule.state(SevenXAirClient.config).opacityOverride = 0.16f + norm * (0.72f - 0.16f);
        }
    }

    private boolean inBounds(double mx, double my, int x, int y, int w, int h) {
        return mx >= x && mx <= x + w && my >= y && my <= y + h;
    }
}
