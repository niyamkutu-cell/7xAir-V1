package com.sevenxair.client.hud;

import com.sevenxair.client.SevenXAirClient;
import com.sevenxair.client.config.ClientConfig;
import com.sevenxair.client.theme.AirTheme;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.entity.Entity;
import net.minecraft.entity.LivingEntity;
import net.minecraft.util.hit.EntityHitResult;

/**
 * Batch 1: Combat & PvP Information modules (legitimate game-provided data only).
 */
public final class CombatModules {
    private CombatModules() {}

    public static void registerAll(HudManager manager) {
        manager.registerModule(new HitColorModule());
        manager.registerModule(new HitAnimationModule());
        manager.registerModule(new TargetHudModule());
        manager.registerModule(new ComboDisplayModule());
        manager.registerModule(new AttackIndicatorModule());
        manager.registerModule(new CrosshairCustomizerModule());
    }

    private static final class HitColorModule extends HudModule {
        HitColorModule() {
            super("hit_color", "Hit Color", "Custom translucent tint on incoming damage.", Category.COMBAT, 160, 10, false);
        }

        @Override public int baseWidth(MinecraftClient c) { return 86; }
        @Override public int baseHeight(MinecraftClient c) { return 18; }

        @Override
        protected void renderContent(DrawContext ctx, MinecraftClient client, AirTheme theme, float opacity, boolean editorMode) {
            ClientConfig.ModuleState st = state(SevenXAirClient.config);
            boolean activeHit = client.player != null && client.player.hurtTime > 0;
            if (activeHit) {
                int tint = (0x38 << 24) | (st.textColorRgb & 0x00FFFFFF);
                ctx.fill(0, 0, baseWidth(client), baseHeight(client), tint);
            }
            int col = 0xFF000000 | (st.textColorRgb & 0x00FFFFFF);
            ctx.drawText(client.textRenderer, activeHit ? "Hit: ACTIVE" : "Hit Color", 8, 5, col, st.textShadow);
        }
    }

    private static final class HitAnimationModule extends HudModule {
        HitAnimationModule() {
            super("hit_animation", "Hit Animation", "Visual attack swing cadence pulse.", Category.COMBAT, 160, 32, false);
        }

        @Override public int baseWidth(MinecraftClient c) { return 94; }
        @Override public int baseHeight(MinecraftClient c) { return 18; }

        @Override
        protected void renderContent(DrawContext ctx, MinecraftClient client, AirTheme theme, float opacity, boolean editorMode) {
            ClientConfig.ModuleState st = state(SevenXAirClient.config);
            float swing = client.player != null ? client.player.handSwingProgress : 0f;
            int barW = Math.round(swing * (baseWidth(client) - 12));
            if (barW > 0) {
                ctx.fill(6, 13, 6 + barW, 15, theme.accentArgb(0.9f));
            }
            int col = 0xFF000000 | (st.textColorRgb & 0x00FFFFFF);
            ctx.drawText(client.textRenderer, "Swing " + Math.round(swing * 100) + "%", 8, 4, col, st.textShadow);
        }
    }

    private static final class TargetHudModule extends HudModule {
        TargetHudModule() {
            super("target_hud", "Target HUD", "Displays crosshair target name and health.", Category.COMBAT, 160, 56, false);
        }

        @Override public int baseWidth(MinecraftClient c) { return 132; }
        @Override public int baseHeight(MinecraftClient c) { return 34; }

        @Override
        protected void renderContent(DrawContext ctx, MinecraftClient client, AirTheme theme, float opacity, boolean editorMode) {
            ClientConfig.ModuleState st = state(SevenXAirClient.config);
            LivingEntity target = null;
            if (client.crosshairTarget instanceof EntityHitResult ehr) {
                Entity ent = ehr.getEntity();
                if (ent instanceof LivingEntity living) {
                    target = living;
                }
            }
            String name = target != null ? target.getName().getString() : (editorMode ? "Target Preview" : "No Target");
            float hp = target != null ? target.getHealth() : (editorMode ? 16.0f : 0.0f);
            float maxHp = target != null ? Math.max(1.0f, target.getMaxHealth()) : 20.0f;
            float ratio = Math.max(0f, Math.min(1f, hp / maxHp));

            int col = 0xFF000000 | (st.textColorRgb & 0x00FFFFFF);
            ctx.drawText(client.textRenderer, client.textRenderer.trimToWidth(name, 116), 8, 6, col, st.textShadow);
            ctx.fill(8, 20, 124, 26, 0x44FFFFFF);
            ctx.fill(8, 20, 8 + Math.round(ratio * 116), 26, theme.accentArgb(0.9f));
        }
    }

    private static final class ComboDisplayModule extends HudModule {
        ComboDisplayModule() {
            super("combo_display", "Combo Display", "Shows consecutive attack combo count.", Category.COMBAT, 160, 96, false);
        }

        @Override public int baseWidth(MinecraftClient c) { return 84; }
        @Override public int baseHeight(MinecraftClient c) { return 18; }

        @Override
        protected void renderContent(DrawContext ctx, MinecraftClient client, AirTheme theme, float opacity, boolean editorMode) {
            if (client.player != null) {
                CombatTracker.updatePlayerHurtTime(client.player.hurtTime);
            }
            ClientConfig.ModuleState st = state(SevenXAirClient.config);
            int combo = CombatTracker.getComboCount();
            int col = 0xFF000000 | (st.textColorRgb & 0x00FFFFFF);
            ctx.drawText(client.textRenderer, combo + " Combo", 8, 5, col, st.textShadow);
        }
    }

    private static final class AttackIndicatorModule extends HudModule {
        AttackIndicatorModule() {
            super("attack_indicator", "Attack Indicator", "Live attack cooldown readiness bar.", Category.COMBAT, 160, 118, false);
        }

        @Override public int baseWidth(MinecraftClient c) { return 96; }
        @Override public int baseHeight(MinecraftClient c) { return 20; }

        @Override
        protected void renderContent(DrawContext ctx, MinecraftClient client, AirTheme theme, float opacity, boolean editorMode) {
            ClientConfig.ModuleState st = state(SevenXAirClient.config);
            float progress = client.player != null ? client.player.getAttackCooldownProgress(0.0f) : 1.0f;
            int col = 0xFF000000 | (st.textColorRgb & 0x00FFFFFF);
            ctx.drawText(client.textRenderer, "Atk " + Math.round(progress * 100) + "%", 8, 3, col, st.textShadow);
            ctx.fill(8, 14, 88, 17, 0x44FFFFFF);
            ctx.fill(8, 14, 8 + Math.round(progress * 80), 17, theme.accentArgb(0.92f));
        }
    }

    private static final class CrosshairCustomizerModule extends HudModule {
        CrosshairCustomizerModule() {
            super("crosshair_customizer", "Crosshair Customizer", "Custom color crosshair indicator.", Category.COMBAT, 160, 142, false);
        }

        @Override public int baseWidth(MinecraftClient c) { return 24; }
        @Override public int baseHeight(MinecraftClient c) { return 24; }

        @Override
        protected void renderContent(DrawContext ctx, MinecraftClient client, AirTheme theme, float opacity, boolean editorMode) {
            ClientConfig.ModuleState st = state(SevenXAirClient.config);
            int col = 0xFF000000 | (st.textColorRgb & 0x00FFFFFF);
            int cx = 12;
            int cy = 12;
            ctx.fill(cx - 5, cy - 1, cx - 2, cy + 1, col);
            ctx.fill(cx + 2, cy - 1, cx + 5, cy + 1, col);
            ctx.fill(cx - 1, cy - 5, cx + 1, cy - 2, col);
            ctx.fill(cx - 1, cy + 2, cx + 1, cy + 5, col);
        }
    }
}
