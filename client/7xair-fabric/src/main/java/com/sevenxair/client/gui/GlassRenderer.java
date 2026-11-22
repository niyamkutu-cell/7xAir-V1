package com.sevenxair.client.gui;

import com.sevenxair.client.SevenXAirClient;
import com.sevenxair.client.compat.RendererCompat;
import com.sevenxair.client.theme.AirTheme;
import net.minecraft.client.font.TextRenderer;
import net.minecraft.client.gui.DrawContext;

/**
 * Renders genuinely translucent rounded glass panels (dominant black/charcoal glass core,
 * soft glowing perimeter halo, smooth specular gradient, and crisp 1px accent borders)
 * using native Minecraft DrawContext primitives with zero per-frame allocations
 * and zero framebuffer/blur overhead.
 */
public final class GlassRenderer {
    private GlassRenderer() {}

    public static void drawFloatingGlassPanel(
        DrawContext ctx,
        int x,
        int y,
        int width,
        int height,
        AirTheme theme,
        float glassOpacity,
        boolean highlighted
    ) {
        drawFloatingGlassPanel(ctx, x, y, width, height, theme, glassOpacity, highlighted, 1.0f);
    }

    public static void drawFloatingGlassPanel(
        DrawContext ctx,
        int x,
        int y,
        int width,
        int height,
        AirTheme theme,
        float glassOpacity,
        boolean highlighted,
        float alphaFactor
    ) {
        float af = GuiAnimator.clamp01(alphaFactor);
        if (af <= 0.01f) return;

        int x2 = x + width;
        int y2 = y + height;

        // 7xAir MAXIMUM PERFORMANCE fast path: 5 draw calls total (70%+ fewer HUD draw calls)
        if (SevenXAirClient.config != null && SevenXAirClient.config.performanceMode) {
            int bodyColor = GuiAnimator.scaleAlpha(theme.glassFillArgb(glassOpacity), af);
            int border = GuiAnimator.scaleAlpha(theme.borderArgb(highlighted), af);
            ctx.fill(x, y, x2, y2, bodyColor);
            ctx.fill(x, y, x2, y + 1, border);
            ctx.fill(x, y2 - 1, x2, y2, border);
            ctx.fill(x, y, x + 1, y2, border);
            ctx.fill(x2 - 1, y, x2, y2, border);
            return;
        }

        // 1. Soft outer ambient halo (gracefully skipped on renderers like VulkanMod to minimize overdraw)
        if (RendererCompat.supportsSoftOuterGlow()) {
            int outerGlow = GuiAnimator.scaleAlpha(highlighted ? theme.accentArgb(0.18f) : 0x26000000, af);
            int innerGlow = GuiAnimator.scaleAlpha(highlighted ? theme.accentArgb(0.28f) : 0x1C000000, af);
            ctx.fill(x - 2, y - 1, x2 + 2, y2 + 3, outerGlow);
            ctx.fill(x - 1, y, x2 + 1, y2 + 2, innerGlow);
        }

        // 2. Rounded translucent dark charcoal glass body (2px stepped corner radius, capped <= 0.72 alpha)
        int bodyColor = GuiAnimator.scaleAlpha(theme.glassFillArgb(glassOpacity), af);
        ctx.fill(x + 2, y, x2 - 2, y2, bodyColor);
        ctx.fill(x + 1, y + 1, x + 2, y2 - 1, bodyColor);
        ctx.fill(x2 - 2, y + 1, x2 - 1, y2 - 1, bodyColor);
        ctx.fill(x, y + 2, x + 1, y2 - 2, bodyColor);
        ctx.fill(x2 - 1, y + 2, x2, y2 - 2, bodyColor);

        // 3. Smooth vertical top-edge specular gradient
        int sheenHeight = Math.max(3, Math.min(14, height / 4));
        ctx.fillGradient(
            x + 2, y + 1, x2 - 2, y + 1 + sheenHeight,
            GuiAnimator.scaleAlpha(0x20FFFFFF, af),
            0x00FFFFFF
        );

        // 4. Crisp 1px glowing border
        int border = GuiAnimator.scaleAlpha(theme.borderArgb(highlighted), af);
        ctx.fill(x + 2, y, x2 - 2, y + 1, border);
        ctx.fill(x + 2, y2 - 1, x2 - 2, y2, border);
        ctx.fill(x, y + 2, x + 1, y2 - 2, border);
        ctx.fill(x2 - 1, y + 2, x2, y2 - 2, border);
        // Corner bevel pixels
        ctx.fill(x + 1, y + 1, x + 2, y + 2, border);
        ctx.fill(x2 - 2, y + 1, x2 - 1, y + 2, border);
        ctx.fill(x + 1, y2 - 2, x + 2, y2 - 1, border);
        ctx.fill(x2 - 2, y2 - 2, x2 - 1, y2 - 1, border);
    }

    public static void drawCharcoalCard(
        DrawContext ctx,
        int x,
        int y,
        int width,
        int height,
        AirTheme theme,
        boolean active,
        boolean hovered
    ) {
        drawCharcoalCard(ctx, x, y, width, height, theme, active, hovered ? 1.0f : 0.0f, 1.0f);
    }

    /**
     * Smooth hover-interpolated charcoal glass card for fluid card hover effects.
     */
    public static void drawCharcoalCard(
        DrawContext ctx,
        int x,
        int y,
        int width,
        int height,
        AirTheme theme,
        boolean active,
        float hoverProgress,
        float alphaFactor
    ) {
        float hp = GuiAnimator.clamp01(hoverProgress);
        float af = GuiAnimator.clamp01(alphaFactor);
        if (af <= 0.01f) return;

        int x2 = x + width;
        int y2 = y + height;

        // Subtle red/accent glow behind active or smoothly hovered card
        float glowAlpha = active ? (0.16f + 0.06f * hp) : (0.12f * hp);
        if (RendererCompat.supportsSoftOuterGlow() && glowAlpha > 0.008f) {
            ctx.fill(x - 1, y - 1, x2 + 1, y2 + 1, GuiAnimator.scaleAlpha(theme.accentArgb(glowAlpha), af));
        }

        // Dark charcoal glass fill (capped <= 0.72 alpha for genuine translucency)
        int baseFill = active ? 0xB0161016 : (hp > 0.5f ? 0xA8181820 : 0x98111116);
        int fill = GuiAnimator.scaleAlpha(baseFill, af);
        ctx.fill(x + 2, y, x2 - 2, y2, fill);
        ctx.fill(x + 1, y + 1, x + 2, y2 - 1, fill);
        ctx.fill(x2 - 2, y + 1, x2 - 1, y2 - 1, fill);
        ctx.fill(x, y + 2, x + 1, y2 - 2, fill);
        ctx.fill(x2 - 1, y + 2, x2, y2 - 2, fill);

        // Subtle top gradient sheen
        ctx.fillGradient(
            x + 2, y + 1, x2 - 2, y + 8,
            GuiAnimator.scaleAlpha(0x16FFFFFF, af),
            0x00FFFFFF
        );

        int borderColor;
        if (active) {
            borderColor = theme.accentArgb(0.74f + 0.14f * hp);
        } else if (hp > 0.05f) {
            borderColor = theme.accentArgb(0.16f + 0.34f * hp);
        } else {
            borderColor = 0x26FFFFFF;
        }
        int border = GuiAnimator.scaleAlpha(borderColor, af);
        ctx.fill(x + 2, y, x2 - 2, y + 1, border);
        ctx.fill(x + 2, y2 - 1, x2 - 2, y2, border);
        ctx.fill(x, y + 2, x + 1, y2 - 2, border);
        ctx.fill(x2 - 1, y + 2, x2, y2 - 2, border);
    }

    public static void drawAnimatedToggleSwitch(
        DrawContext ctx,
        int x,
        int y,
        int width,
        int height,
        AirTheme theme,
        float progress
    ) {
        drawAnimatedToggleSwitch(ctx, x, y, width, height, theme, progress, 1.0f);
    }

    public static void drawAnimatedToggleSwitch(
        DrawContext ctx,
        int x,
        int y,
        int width,
        int height,
        AirTheme theme,
        float progress,
        float alphaFactor
    ) {
        float clamped = GuiAnimator.clamp01(progress);
        float af = GuiAnimator.clamp01(alphaFactor);
        int track = clamped > 0.5f ? theme.accentArgb(0.45f + 0.45f * clamped) : 0x5530303C;
        track = GuiAnimator.scaleAlpha(track, af);
        ctx.fill(x + 2, y, x + width - 2, y + height, track);
        ctx.fill(x + 1, y + 1, x + width - 1, y + height - 1, track);
        int knobSize = height - 4;
        int travel = Math.max(0, width - knobSize - 4);
        int knobX = x + 2 + Math.round(clamped * travel);
        ctx.fill(knobX, y + 2, knobX + knobSize, y + 2 + knobSize, GuiAnimator.scaleAlpha(0xFFF8FAFC, af));
    }

    public static void drawToggleSwitch(
        DrawContext ctx,
        int x,
        int y,
        int width,
        int height,
        AirTheme theme,
        boolean enabled
    ) {
        drawAnimatedToggleSwitch(ctx, x, y, width, height, theme, enabled ? 1.0f : 0.0f, 1.0f);
    }

    public static void drawSidebarItem(
        DrawContext ctx,
        TextRenderer font,
        int x,
        int y,
        int width,
        int height,
        String iconGlyph,
        String label,
        AirTheme theme,
        boolean active,
        boolean hovered
    ) {
        drawSidebarItem(ctx, font, x, y, width, height, iconGlyph, label, theme, active, hovered, true, 1.0f);
    }

    public static void drawSidebarItem(
        DrawContext ctx,
        TextRenderer font,
        int x,
        int y,
        int width,
        int height,
        String iconGlyph,
        String label,
        AirTheme theme,
        boolean active,
        boolean hovered,
        boolean drawStaticIndicator,
        float alphaFactor
    ) {
        float af = GuiAnimator.clamp01(alphaFactor);
        if (active || hovered) {
            int bg = GuiAnimator.scaleAlpha(active ? theme.accentArgb(0.20f) : 0x1CFFFFFF, af);
            ctx.fill(x + 2, y, x + width - 2, y + height, bg);
            ctx.fill(x + 1, y + 1, x + width - 1, y + height - 1, bg);
        }
        if (active && drawStaticIndicator) {
            // Glowing deep-red / theme accent vertical bar
            ctx.fill(x, y + 3, x + 3, y + height - 3, GuiAnimator.scaleAlpha(theme.accentArgb(0.95f), af));
            ctx.fill(x + 3, y + 3, x + 5, y + height - 3, GuiAnimator.scaleAlpha(theme.accentArgb(0.26f), af));
        }

        int iconColor = GuiAnimator.scaleAlpha(active ? (0xFF000000 | theme.accentRgb) : 0xFF9CA3AF, af);
        int textColor = GuiAnimator.scaleAlpha(active ? 0xFFF8FAFC : (hovered ? 0xFFE5E7EB : 0xFF9CA3AF), af);
        int textY = y + (height - font.fontHeight) / 2 + 1;
        ctx.drawTextWithShadow(font, iconGlyph, x + 10, textY, iconColor);
        ctx.drawTextWithShadow(font, label, x + 24, textY, textColor);
    }

    /** Renders the gliding crimson/theme sidebar active indicator bar. */
    public static void drawGlidingIndicator(
        DrawContext ctx,
        int x,
        int y,
        int height,
        AirTheme theme,
        float alphaFactor
    ) {
        float af = GuiAnimator.clamp01(alphaFactor);
        ctx.fill(x, y + 3, x + 3, y + height - 3, GuiAnimator.scaleAlpha(theme.accentArgb(0.96f), af));
        ctx.fill(x + 3, y + 3, x + 6, y + height - 3, GuiAnimator.scaleAlpha(theme.accentArgb(0.28f), af));
    }

    public static void drawGlassPillButton(
        DrawContext ctx,
        TextRenderer font,
        int x,
        int y,
        int width,
        int height,
        String label,
        AirTheme theme,
        float glassOpacity,
        boolean active,
        boolean hovered
    ) {
        drawGlassPillButton(ctx, font, x, y, width, height, label, theme, glassOpacity, active, hovered, 1.0f);
    }

    public static void drawGlassPillButton(
        DrawContext ctx,
        TextRenderer font,
        int x,
        int y,
        int width,
        int height,
        String label,
        AirTheme theme,
        float glassOpacity,
        boolean active,
        boolean hovered,
        float alphaFactor
    ) {
        float af = GuiAnimator.clamp01(alphaFactor);
        if (af <= 0.01f) return;

        int fill = GuiAnimator.scaleAlpha(
            active
                ? theme.accentArgb(hovered ? 0.36f : 0.25f)
                : theme.glassFillArgb(hovered ? glassOpacity + 0.12f : glassOpacity),
            af
        );
        int border = GuiAnimator.scaleAlpha(
            active ? theme.accentArgb(0.85f) : (hovered ? 0x60FFFFFF : 0x2EFFFFFF),
            af
        );

        ctx.fill(x + 2, y, x + width - 2, y + height, fill);
        ctx.fill(x + 1, y + 1, x + width - 1, y + height - 1, fill);
        ctx.fill(x, y + 2, x + width, y + height - 2, fill);

        ctx.fill(x + 2, y, x + width - 2, y + 1, border);
        ctx.fill(x + 2, y + height - 1, x + width - 2, y + height, border);
        ctx.fill(x, y + 2, x + 1, y + height - 2, border);
        ctx.fill(x + width - 1, y + 2, x + width, y + height - 2, border);

        int textColor = GuiAnimator.scaleAlpha(active ? (0xFF000000 | theme.accentRgb) : 0xFFF1F6FC, af);
        int textX = x + (width - font.getWidth(label)) / 2;
        int textY = y + (height - font.fontHeight) / 2 + 1;
        ctx.drawTextWithShadow(font, label, textX, textY, textColor);
    }
}
