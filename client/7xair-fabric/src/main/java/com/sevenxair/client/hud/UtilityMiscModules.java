package com.sevenxair.client.hud;

import com.sevenxair.client.SevenXAirClient;
import com.sevenxair.client.config.ClientConfig;
import com.sevenxair.client.theme.AirTheme;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;

/**
 * Batch 4: Utility & Miscellaneous client modules.
 */
public final class UtilityMiscModules {
    private UtilityMiscModules() {}

    public static void registerAll(HudManager manager) {
        // Utility category
        manager.registerModule(new MovementWorldModules.SimpleInfoModule(
            "screenshot_manager", "Screenshot Manager", "Shows saved screenshot count in instance.",
            HudModule.Category.UTILITY, 450, 106, client -> {
                Path dir = FabricLoader.getInstance().getGameDir().resolve("screenshots");
                if (!Files.exists(dir)) return "Screenshots: 0";
                try (Stream<Path> s = Files.list(dir)) {
                    long cnt = s.filter(p -> p.toString().toLowerCase().endsWith(".png")).count();
                    return "Screenshots: " + cnt;
                } catch (Exception e) {
                    return "Screenshots: 0";
                }
            }
        ));

        manager.registerModule(new MovementWorldModules.SimpleInfoModule(
            "zoom", "Zoom", "Displays FOV zoom readiness state.",
            HudModule.Category.UTILITY, 450, 128, client ->
                "Zoom FOV: " + client.options.getFov().getValue()
        ));

        manager.registerModule(new MovementWorldModules.SimpleInfoModule(
            "perspective", "Perspective", "Shows current camera perspective mode.",
            HudModule.Category.UTILITY, 450, 150, client ->
                "View: " + client.options.getPerspective().name()
        ));

        manager.registerModule(new MovementWorldModules.SimpleInfoModule(
            "chat_customizer", "Chat Customizer", "Displays chat visibility setting.",
            HudModule.Category.UTILITY, 450, 172, client ->
                "Chat: " + client.options.getChatVisibility().getValue().name()
        ));

        manager.registerModule(new MovementWorldModules.SimpleInfoModule(
            "notifications", "Notifications", "Live 7xAir toast notification banner.",
            HudModule.Category.UTILITY, 450, 194, client -> CombatTracker.getLatestNotification()
        ));

        manager.registerModule(new ModuleListHud());

        manager.registerModule(new MovementWorldModules.SimpleInfoModule(
            "session_stats", "Session Statistics", "Live session uptime timer.",
            HudModule.Category.UTILITY, 450, 216, client -> {
                long secs = CombatTracker.getSessionElapsedSeconds();
                return String.format("Session: %02d:%02d", secs / 60, secs % 60);
            }
        ));

        // Miscellaneous category
        manager.registerModule(new MovementWorldModules.SimpleInfoModule(
            "custom_gui_theme", "Custom GUI Theme", "Displays active 7xAir synced theme.",
            HudModule.Category.MISCELLANEOUS, 450, 238, client ->
                "Theme: " + SevenXAirClient.config.getTheme().displayName
        ));

        manager.registerModule(new MovementWorldModules.SimpleInfoModule(
            "config_profiles", "Configuration Profiles", "Displays active configuration profile.",
            HudModule.Category.MISCELLANEOUS, 450, 260, client ->
                "Profile: " + SevenXAirClient.config.activeProfileName
        ));

        manager.registerModule(new MovementWorldModules.SimpleInfoModule(
            "client_info", "Client Information", "7xAir version and JVM memory usage.",
            HudModule.Category.MISCELLANEOUS, 450, 282, client -> {
                Runtime rt = Runtime.getRuntime();
                long usedMb = (rt.totalMemory() - rt.freeMemory()) / (1024L * 1024L);
                long maxMb = rt.maxMemory() / (1024L * 1024L);
                return "7xAir · " + usedMb + "/" + maxMb + " MB";
            }
        ));

        manager.registerModule(new NotificationCenterModule());
    }

    private static final class ModuleListHud extends HudModule {
        ModuleListHud() {
            super("module_list", "Module List", "Lists currently enabled 7xAir modules.", Category.UTILITY, 560, 10, false);
        }

        private List<String> enabledNames() {
            List<String> out = new ArrayList<>();
            for (HudModule m : SevenXAirClient.hudManager.getModules()) {
                if (!m.id.equals(this.id) && m.state(SevenXAirClient.config).enabled) {
                    out.add(m.displayName);
                }
            }
            return out;
        }

        @Override
        public int baseWidth(MinecraftClient client) {
            return 108;
        }

        @Override
        public int baseHeight(MinecraftClient client) {
            return Math.max(20, Math.min(8, enabledNames().size()) * 11 + 8);
        }

        @Override
        protected void renderContent(DrawContext ctx, MinecraftClient client, AirTheme theme, float opacity, boolean editorMode) {
            ClientConfig.ModuleState st = state(SevenXAirClient.config);
            int col = 0xFF000000 | (st.textColorRgb & 0x00FFFFFF);
            List<String> names = enabledNames();
            if (names.isEmpty()) {
                ctx.drawText(client.textRenderer, "No active mods", 6, 5, 0xFF9CA3AF, st.textShadow);
                return;
            }
            int y = 4;
            for (int i = 0; i < Math.min(8, names.size()); i++) {
                ctx.drawText(client.textRenderer, names.get(i), 6, y, col, st.textShadow);
                y += 11;
            }
        }
    }

    private static final class NotificationCenterModule extends HudModule {
        NotificationCenterModule() {
            super("notification_center", "Notification Center", "Displays recent client event history.", Category.MISCELLANEOUS, 450, 304, false);
        }

        @Override public int baseWidth(MinecraftClient c) { return 148; }
        @Override public int baseHeight(MinecraftClient c) { return 38; }

        @Override
        protected void renderContent(DrawContext ctx, MinecraftClient client, AirTheme theme, float opacity, boolean editorMode) {
            ClientConfig.ModuleState st = state(SevenXAirClient.config);
            int col = 0xFF000000 | (st.textColorRgb & 0x00FFFFFF);
            String[] items = CombatTracker.getRecentNotifications();
            if (items.length == 0) {
                ctx.drawText(client.textRenderer, "No notifications", 8, 6, 0xFF9CA3AF, st.textShadow);
                return;
            }
            int y = 5;
            for (int i = 0; i < Math.min(3, items.length); i++) {
                ctx.drawText(client.textRenderer, client.textRenderer.trimToWidth(items[i], 132), 8, y, col, st.textShadow);
                y += 11;
            }
        }
    }
}
