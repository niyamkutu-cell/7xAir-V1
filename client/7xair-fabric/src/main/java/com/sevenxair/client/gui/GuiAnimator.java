package com.sevenxair.client.gui;

import com.sevenxair.client.compat.RendererCompat;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.util.Identifier;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Lightweight, frame-rate-independent animation, clipping, texture-caching,
 * coordinate-conversion, and alpha-blending utilities for the 7xAir in-game GUI and HUD Editor.
 * Allocates zero per-frame objects and creates no framebuffers.
 */
public final class GuiAnimator {
    /** Cached mod icon identifier (resolved once; never reloaded per frame). */
    public static final Identifier BRAND_ICON_TEXTURE = Identifier.of("sevenxair", "icon.png");

    private static final Map<String, Identifier> TEXTURE_CACHE = new ConcurrentHashMap<>();

    private GuiAnimator() {}

    /** Resolves and caches a mod texture identifier once so textures are never repeatedly constructed. */
    public static Identifier cachedTexture(String path) {
        return TEXTURE_CACHE.computeIfAbsent(path, p -> Identifier.of("sevenxair", p));
    }

    /** Clears cached texture references during clean client shutdown. */
    public static void dispose() {
        TEXTURE_CACHE.clear();
    }

    /** Cubic ease-out curve for crisp, responsive UI transitions. */
    public static float easeOutCubic(float t) {
        float c = clamp01(t);
        float inv = 1.0f - c;
        return 1.0f - inv * inv * inv;
    }

    /** Cubic ease-in-out curve for smooth panel and indicator glides. */
    public static float easeInOutCubic(float t) {
        float c = clamp01(t);
        return c < 0.5f
            ? 4.0f * c * c * c
            : 1.0f - (float) Math.pow(-2.0f * c + 2.0f, 3) / 2.0f;
    }

    /**
     * Frame-rate-independent exponential smoothing toward {@code target}.
     * Delta time is clamped to 50ms so frame hitches never cause overshoot.
     */
    public static float smoothStep(float current, float target, float deltaSeconds, float speed) {
        float dt = Math.max(0.001f, Math.min(0.05f, deltaSeconds));
        float factor = 1.0f - (float) Math.exp(-speed * dt);
        float next = current + (target - current) * factor;
        return Math.abs(target - next) < 0.004f ? target : next;
    }

    /** Scales the alpha channel of an ARGB color by {@code factor} in [0, 1]. */
    public static int scaleAlpha(int argb, float factor) {
        float f = clamp01(factor);
        int origA = (argb >>> 24) & 0xFF;
        int newA = Math.max(0, Math.min(255, Math.round(origA * f)));
        return (newA << 24) | (argb & 0x00FFFFFF);
    }

    /**
     * Converts raw screen-space mouse coordinates into the panel's scaled coordinate space
     * so hover and click hit-testing stays accurate during opening/closing scale transitions.
     */
    public static double toScaledSpace(double mouseCoord, float pivot, float scale) {
        if (Math.abs(scale - 1.0f) < 0.001f || scale <= 0.01f) {
            return mouseCoord;
        }
        return pivot + (mouseCoord - pivot) / scale;
    }

    /**
     * Executes {@code body} inside a guaranteed-paired native DrawContext scissor clip.
     * Gracefully degrades without clipping if the active renderer faults on enableScissor.
     */
    public static void withScissor(DrawContext ctx, int x1, int y1, int x2, int y2, Runnable body) {
        if (x2 <= x1 || y2 <= y1) {
            return;
        }
        if (!RendererCompat.supportsScissorClip()) {
            body.run();
            return;
        }
        boolean clipped = false;
        try {
            ctx.enableScissor(x1, y1, x2, y2);
            clipped = true;
            body.run();
        } catch (Throwable error) {
            RendererCompat.reportScissorFault(error);
            if (!clipped) {
                body.run();
            }
        } finally {
            if (clipped) {
                try {
                    ctx.disableScissor();
                } catch (Throwable ignored) {
                    // Ignore secondary disableScissor error
                }
            }
        }
    }

    public static float clamp01(float v) {
        return Math.max(0.0f, Math.min(1.0f, v));
    }
}
