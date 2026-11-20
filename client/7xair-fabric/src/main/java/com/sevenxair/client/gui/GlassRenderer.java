package com.sevenxair.client.gui;

import com.sevenxair.client.theme.AirTheme;
import net.minecraft.client.font.TextRenderer;
import net.minecraft.client.gui.DrawContext;

/**
 * Renders genuinely translucent floating glass surfaces (low-alpha tinted glass body,
 * soft perimeter elevation shadow, subtle specular top highlight, and 1px luminous border)
 * instead of chunky opaque cards.
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
        int x2 = x + width;
        int y2 = y + height;

        // 1. Soft translucent elevation halo (gives floating depth without heavy black boxes)
        ctx.fill(x - 2, y + 2, x2 + 2, y2 + 3, 0x22000000);
        ctx.fill(x - 1, y + 1, x2 + 1, y2 + 2, 0x1A000000);

        // 2. Translucent glass core with chamfered 1px corners
        int bodyColor = theme.glassFillArgb(glassOpacity);
        ctx.fill(x + 1, y, x2 - 1, y2, bodyColor);
        ctx.fill(x, y + 1, x + 1, y2 - 1, bodyColor);
        ctx.fill(x2 - 1, y + 1, x2, y2 - 1, bodyColor);

        // 3. Subtle specular top-edge sheen (frosted glass light catch)
        int sheenHeight = Math.max(2, Math.min(10, height / 4));
        ctx.fillGradient(x + 1, y + 1, x2 - 1, y + 1 + sheenHeight, 0x22FFFFFF, 0x00FFFFFF);

        // 4. Delicate 1px luminous perimeter border
        int border = theme.borderArgb(highlighted);
        ctx.fill(x + 1, y, x2 - 1, y + 1, border);
        ctx.fill(x + 1, y2 - 1, x2 - 1, y2, border);
        ctx.fill(x, y + 1, x + 1, y2 - 1, border);
        ctx.fill(x2 - 1, y + 1, x2, y2 - 1, border);
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
        int fill = active
            ? theme.accentArgb(hovered ? 0.34f : 0.24f)
            : theme.glassFillArgb(hovered ? glassOpacity + 0.12f : glassOpacity);
        int border = active ? theme.accentArgb(0.85f) : (hovered ? 0x60FFFFFF : 0x2EFFFFFF);

        ctx.fill(x + 1, y, x + width - 1, y + height, fill);
        ctx.fill(x, y + 1, x + 1, y + height - 1, fill);
        ctx.fill(x + width - 1, y + 1, x + width, y + height - 1, fill);

        ctx.fill(x + 1, y, x + width - 1, y + 1, border);
        ctx.fill(x + 1, y + height - 1, x + width - 1, y + height, border);
        ctx.fill(x, y + 1, x + 1, y + height - 1, border);
        ctx.fill(x + width - 1, y + 1, x + width, y + height - 1, border);

        int textColor = active ? (0xFF000000 | theme.accentRgb) : 0xFFF1F6FC;
        int textX = x + (width - font.getWidth(label)) / 2;
        int textY = y + (height - font.fontHeight) / 2 + 1;
        ctx.drawTextWithShadow(font, label, textX, textY, textColor);
    }
}
