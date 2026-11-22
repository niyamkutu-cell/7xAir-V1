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
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Registers and renders all 7xAir translucent floating glass HUD modules.
 * Uses indexed zero-iterator rendering loops and 20 Hz text/width caching
 * to keep normal gameplay HUD overhead minimal.
 */
public final class HudManager {
    private final List<HudModule> modules = new ArrayList<>();
    private final Set<String> registeredIds = new HashSet<>();

    public boolean registerModule(HudModule module) {
        if (module == null || !registeredIds.add(module.id)) {
            return false;
        }
        modules.add(module);
        return true;
    }

    public HudManager() {
        registerModule(new TextChipModule("fps", "FPS Counter", "Real-time frame rate counter.", HudModule.Category.HUD, 10, 10, true, client ->
            client.getCurrentFps() + " FPS"
        ));

        registerModule(new TextChipModule("cps", "CPS Counter", "Tracks rolling 1s LMB & RMB clicks.", HudModule.Category.COMBAT, 10, 32, true, client ->
            CpsTracker.getLeftCps() + " | " + CpsTracker.getRightCps() + " CPS"
        ));

        registerModule(new TextChipModule("ping", "Ping", "Displays current server latency.", HudModule.Category.UTILITY, 10, 54, true, client -> {
            if (client.player == null || client.getNetworkHandler() == null) return "0 ms";
            PlayerListEntry entry = client.getNetworkHandler().getPlayerListEntry(client.player.getUuid());
            return (entry != null ? entry.getLatency() : 0) + " ms";
        }));

        registerModule(new TextChipModule("coords", "Coordinates", "Live player X / Y / Z coordinates.", HudModule.Category.WORLD, 10, 76, true, client -> {
            if (client.player == null) return "XYZ 0 / 64 / 0";
            return "XYZ " + (int) Math.floor(client.player.getX())
                + " / " + (int) Math.floor(client.player.getY())
                + " / " + (int) Math.floor(client.player.getZ());
        }));

        registerModule(new TextChipModule("toggle_sprint", "Toggle Sprint", "Automatically holds sprint while moving.", HudModule.Category.MOVEMENT, 10, 98, true, client ->
            SevenXAirClient.config.toggleSprintActive ? "Sprint: ON" : "Sprint: OFF"
        ));

        registerModule(new KeystrokesModule("keystrokes", "Keystrokes", 10, 124, true));
        registerModule(new ArmorStatusModule("armor", "Armor Status", 10, 206, false));
        registerModule(new PotionEffectsModule("potions", "Potion Effects", 10, 240, false));

        // Register Part 4 expanded module batches (duplicate-protected via registerModule)
        CombatModules.registerAll(this);
        MovementWorldModules.registerAll(this);
        RenderPlayerModules.registerAll(this);
        UtilityMiscModules.registerAll(this);
        registerModule(new TextChipModule(
            "perf_monitor",
            "Performance Monitor",
            "Live FPS, frame time (ms), 1% low FPS, RAM, and Java version.",
            HudModule.Category.HUD,
            10,
            274,
            false,
            client -> client.getCurrentFps() + " FPS · "
                + String.format("%.1fms", PerformanceMonitor.getLastFrameMs())
                + " · 1% " + PerformanceMonitor.getOnePercentLowFps()
                + " · " + PerformanceMonitor.getUsedMemoryMb() + "/" + PerformanceMonitor.getMaxMemoryMb() + "MB"
                + " · J" + Runtime.version().feature()
        ));
    }

    public void registerRenderHook() {
        HudRenderCallback.EVENT.register((drawContext, tickCounter) -> {
            PerformanceMonitor.recordFrame();
            MinecraftClient client = MinecraftClient.getInstance();
            if (client == null || client.options.hudHidden) return;
            ClientConfig cfg = SevenXAirClient.config;
            if (cfg == null || !cfg.hudVisible) return;
            if (client.currentScreen instanceof HudEditorScreen) return;

            // Indexed loop avoids Iterator allocations on every rendered frame
            for (int i = 0, n = modules.size(); i < n; i++) {
                HudModule module = modules.get(i);
                ClientConfig.ModuleState st = module.state(cfg);
                if (!st.enabled) continue;
                module.render(drawContext, client, cfg, false, false);
            }
        });
    }

    public List<HudModule> getModules() {
        return Collections.unmodifiableList(modules);
    }

    public void resetAllPositions(ClientConfig config) {
        for (int i = 0, n = modules.size(); i < n; i++) {
            modules.get(i).resetPosition(config);
        }
        config.save();
    }

    @FunctionalInterface
    private interface TextSupplier {
        String get(MinecraftClient client);
    }

    /**
     * Caches formatted HUD text and measured pixel width at a 50ms (20 Hz) cadence
     * to avoid redundant string formatting and text-width scans on 240+ FPS gameplay.
     */
    private static final class TextChipModule extends HudModule {
        private static final long CACHE_TTL_MS = 50L;
        private final TextSupplier supplier;
        private String cachedText = "";
        private int cachedWidth = 66;
        private long lastSampleMs = 0L;

        TextChipModule(String id, String name, String desc, HudModule.Category category, int x, int y, boolean enabled, TextSupplier supplier) {
            super(id, name, desc, category, x, y, enabled);
            this.supplier = supplier;
        }

        private void refreshCacheIfNeeded(MinecraftClient client) {
            long now = System.currentTimeMillis();
            if (now - lastSampleMs >= CACHE_TTL_MS || cachedText.isEmpty()) {
                lastSampleMs = now;
                String next = supplier.get(client);
                if (!next.equals(cachedText)) {
                    cachedText = next;
                    cachedWidth = Math.max(66, client.textRenderer.getWidth(next) + 16);
                }
            }
        }

        @Override
        public int baseWidth(MinecraftClient client) {
            refreshCacheIfNeeded(client);
            return cachedWidth;
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
            refreshCacheIfNeeded(client);
            ClientConfig.ModuleState st = state(SevenXAirClient.config);
            int color = 0xFF000000 | (st.textColorRgb & 0x00FFFFFF);
            ctx.drawText(client.textRenderer, cachedText, 8, 5, color, st.textShadow);
        }
    }

    private static final class KeystrokesModule extends HudModule {
        KeystrokesModule(String id, String name, int x, int y, boolean enabled) {
            super(id, name, "Live WASD, click, and jump press overlay.", HudModule.Category.COMBAT, x, y, enabled);
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
            super(id, name, "Displays equipped armor pieces on HUD.", HudModule.Category.PLAYER, x, y, enabled);
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
            super(id, name, "Displays active potion effects and timers.", HudModule.Category.PLAYER, x, y, enabled);
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
                int mins = seconds / 60;
                int secs = seconds % 60;
                String line = name + " " + mins + (secs < 10 ? ":0" : ":") + secs;
                ctx.drawTextWithShadow(client.textRenderer, line, 8, y, 0xFFF1F6FC);
                y += 12;
            }
        }
    }
}
