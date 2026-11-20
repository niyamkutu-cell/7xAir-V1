package com.sevenxair.client.hud;

import com.sevenxair.client.SevenXAirClient;
import com.sevenxair.client.config.ClientConfig;
import com.sevenxair.client.gui.GlassRenderer;
import com.sevenxair.client.gui.HudEditorScreen;
import com.sevenxair.client.theme.AirTheme;
import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.network.PlayerListEntry;
import net.minecraft.entity.effect.StatusEffectInstance;
import net.minecraft.item.ItemStack;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.List;

/**
 * Registers and renders all 8 built-in 7xAir translucent floating glass HUD modules.
 */
public final class HudManager {
    private final List<HudModule> modules = new ArrayList<>();

    public HudManager() {
        modules.add(new TextChipModule("fps", "FPS Counter", 10, 10, true, client ->
            client.getCurrentFps() + " FPS"
        ));

        modules.add(new TextChipModule("cps", "CPS Counter", 10, 32, true, client ->
            CpsTracker.getLeftCps() + " | " + CpsTracker.getRightCps() + " CPS"
        ));

        modules.add(new TextChipModule("ping", "Ping", 10, 54, true, client -> {
            if (client.player == null || client.getNetworkHandler() == null) return "0 ms";
            PlayerListEntry entry = client.getNetworkHandler().getPlayerListEntry(client.player.getUuid());
            return (entry != null ? entry.getLatency() : 0) + " ms";
        }));

        modules.add(new TextChipModule("coords", "Coordinates", 10, 76, true, client -> {
            if (client.player == null) return "XYZ 0 / 64 / 0";
            return String.format(
                "XYZ %d / %d / %d",
                (int) Math.floor(client.player.getX()),
                (int) Math.floor(client.player.getY()),
                (int) Math.floor(client.player.getZ())
            );
        }));

        modules.add(new TextChipModule("toggle_sprint", "Toggle Sprint", 10, 98, true, client ->
            SevenXAirClient.config.toggleSprintActive ? "Sprint: ON" : "Sprint: OFF"
        ));

        modules.add(new KeystrokesModule("keystrokes", "Keystrokes", 10, 124, true));
        modules.add(new ArmorStatusModule("armor", "Armor Status", 10, 206, false));
        modules.add(new PotionEffectsModule("potions", "Potion Effects", 10, 240, false));
    }

    public void registerRenderHook() {
        HudRenderCallback.EVENT.register((drawContext, tickCounter) -> {
            MinecraftClient client = MinecraftClient.getInstance();
            if (client == null || client.options.hudHidden) return;
            if (!SevenXAirClient.config.hudVisible) return;
            if (client.currentScreen instanceof HudEditorScreen) return;

            for (HudModule module : modules) {
                module.render(drawContext, client, SevenXAirClient.config, false, false);
            }
        });
    }

    public List<HudModule> getModules() {
        return Collections.unmodifiableList(modules);
    }

    public void resetAllPositions(ClientConfig config) {
        for (HudModule module : modules) {
            module.resetPosition(config);
        }
        config.save();
    }

    @FunctionalInterface
    private interface TextSupplier {
        String get(MinecraftClient client);
    }

    private static final class TextChipModule extends HudModule {
        private final TextSupplier supplier;

        TextChipModule(String id, String name, int x, int y, boolean enabled, TextSupplier supplier) {
            super(id, name, x, y, enabled);
            this.supplier = supplier;
        }

        @Override
        public int baseWidth(MinecraftClient client) {
            return Math.max(66, client.textRenderer.getWidth(supplier.get(client)) + 16);
        }

        @Override
        public int baseHeight(MinecraftClient client) {
            return 18;
        }

        @Override
        protected void renderContent(
            DrawContext ctx,
            MinecraftClient client,
            AirTheme theme,
            float glassOpacity,
            boolean editorMode
        ) {
            String text = supplier.get(client);
            ctx.drawTextWithShadow(client.textRenderer, text, 8, 5, 0xFFF1F6FC);
        }
    }

    private static final class KeystrokesModule extends HudModule {
        KeystrokesModule(String id, String name, int x, int y, boolean enabled) {
            super(id, name, x, y, enabled);
        }

        @Override
        public int baseWidth(MinecraftClient client) {
            return 74;
        }

        @Override
        public int baseHeight(MinecraftClient client) {
            return 74;
        }

        @Override
        protected void renderContent(
            DrawContext ctx,
            MinecraftClient client,
            AirTheme theme,
            float glassOpacity,
            boolean editorMode
        ) {
            drawKey(ctx, client, 26, 4, 22, 20, "W", client.options.forwardKey.isPressed(), theme, glassOpacity);
            drawKey(ctx, client, 2, 26, 22, 20, "A", client.options.leftKey.isPressed(), theme, glassOpacity);
            drawKey(ctx, client, 26, 26, 22, 20, "S", client.options.backKey.isPressed(), theme, glassOpacity);
            drawKey(ctx, client, 50, 26, 22, 20, "D", client.options.rightKey.isPressed(), theme, glassOpacity);
            drawKey(ctx, client, 2, 48, 34, 20, "LMB", client.options.attackKey.isPressed(), theme, glassOpacity);
            drawKey(ctx, client, 38, 48, 34, 20, "RMB", client.options.useKey.isPressed(), theme, glassOpacity);
        }

        private void drawKey(
            DrawContext ctx,
            MinecraftClient client,
            int x,
            int y,
            int w,
            int h,
            String label,
            boolean pressed,
            AirTheme theme,
            float opacity
        ) {
            GlassRenderer.drawGlassPillButton(
                ctx,
                client.textRenderer,
                x,
                y,
                w,
                h,
                label,
                theme,
                opacity * 0.85f,
                pressed,
                false
            );
        }
    }

    private static final class ArmorStatusModule extends HudModule {
        ArmorStatusModule(String id, String name, int x, int y, boolean enabled) {
            super(id, name, x, y, enabled);
        }

        @Override
        public int baseWidth(MinecraftClient client) {
            return 92;
        }

        @Override
        public int baseHeight(MinecraftClient client) {
            return 24;
        }

        @Override
        protected void renderContent(
            DrawContext ctx,
            MinecraftClient client,
            AirTheme theme,
            float glassOpacity,
            boolean editorMode
        ) {
            if (client.player == null) {
                ctx.drawTextWithShadow(client.textRenderer, "Armor", 8, 8, 0xFFD0DCE8);
                return;
            }
            int x = 6;
            boolean drewAny = false;
            for (ItemStack stack : client.player.getArmorItems()) {
                if (!stack.isEmpty()) {
                    ctx.drawItem(stack, x, 4);
                    x += 20;
                    drewAny = true;
                }
            }
            if (!drewAny && editorMode) {
                ctx.drawTextWithShadow(client.textRenderer, "Armor HUD", 8, 8, 0xFFD0DCE8);
            }
        }
    }

    private static final class PotionEffectsModule extends HudModule {
        PotionEffectsModule(String id, String name, int x, int y, boolean enabled) {
            super(id, name, x, y, enabled);
        }

        @Override
        public int baseWidth(MinecraftClient client) {
            return 116;
        }

        @Override
        public int baseHeight(MinecraftClient client) {
            if (client.player == null) return 22;
            int count = Math.max(1, client.player.getStatusEffects().size());
            return 8 + count * 12;
        }

        @Override
        protected void renderContent(
            DrawContext ctx,
            MinecraftClient client,
            AirTheme theme,
            float glassOpacity,
            boolean editorMode
        ) {
            if (client.player == null || client.player.getStatusEffects().isEmpty()) {
                if (editorMode) {
                    ctx.drawTextWithShadow(client.textRenderer, "Potion Effects", 8, 6, 0xFFD0DCE8);
                }
                return;
            }
            Collection<StatusEffectInstance> effects = client.player.getStatusEffects();
            int y = 5;
            for (StatusEffectInstance effect : effects) {
                int seconds = Math.max(0, effect.getDuration() / 20);
                String name = effect.getEffectType().value().getName().getString();
                String line = String.format("%s %d:%02d", name, seconds / 60, seconds % 60);
                ctx.drawTextWithShadow(client.textRenderer, line, 8, y, 0xFFF1F6FC);
                y += 12;
            }
        }
    }
}
