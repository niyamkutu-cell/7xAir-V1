package com.sevenxair.client.hud;

import com.sevenxair.client.SevenXAirClient;
import com.sevenxair.client.config.ClientConfig;
import com.sevenxair.client.theme.AirTheme;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.util.math.Vec3d;

/**
 * Batch 2: Movement & World information modules.
 */
public final class MovementWorldModules {
    private MovementWorldModules() {}

    public static void registerAll(HudManager manager) {
        manager.registerModule(new SimpleInfoModule(
            "movement_stats", "Movement Statistics", "Displays sprint, sneak, and air state.",
            HudModule.Category.MOVEMENT, 160, 172, client -> {
                if (client.player == null) return "Move: Idle";
                if (client.player.isSprinting()) return "Move: Sprinting";
                if (client.player.isSneaking()) return "Move: Sneaking";
                if (!client.player.isOnGround()) return "Move: Airborne";
                return "Move: Walking";
            }
        ));

        manager.registerModule(new SimpleInfoModule(
            "speed_display", "Speed Display", "Real-time horizontal speed in blocks/sec.",
            HudModule.Category.MOVEMENT, 160, 194, client -> {
                if (client.player == null) return "0.00 b/s";
                Vec3d v = client.player.getVelocity();
                double bps = Math.hypot(v.x, v.z) * 20.0;
                return String.format("%.2f b/s", bps);
            }
        ));

        manager.registerModule(new SimpleInfoModule(
            "direction_indicator", "Direction Indicator", "Compass heading and yaw angle.",
            HudModule.Category.MOVEMENT, 160, 216, client -> {
                if (client.player == null) return "Facing: S (0)";
                float yaw = ((client.player.getYaw() % 360f) + 360f) % 360f;
                String[] dirs = { "S", "SW", "W", "NW", "N", "NE", "E", "SE" };
                String dir = dirs[Math.round(yaw / 45f) % 8];
                return String.format("Dir: %s (%d\u00B0)", dir, Math.round(yaw));
            }
        ));

        manager.registerModule(new SimpleInfoModule(
            "biome_display", "Biome Display", "Shows the current Minecraft biome.",
            HudModule.Category.WORLD, 300, 10, client -> {
                if (client.world == null || client.player == null) return "Biome: Unknown";
                return client.world.getBiome(client.player.getBlockPos())
                    .getKey()
                    .map(k -> "Biome: " + formatId(k.getValue().getPath()))
                    .orElse("Biome: Unknown");
            }
        ));

        manager.registerModule(new SimpleInfoModule(
            "weather_display", "Weather Display", "Current world weather condition.",
            HudModule.Category.WORLD, 300, 32, client -> {
                if (client.world == null) return "Weather: Clear";
                if (client.world.isThundering()) return "Weather: Thunder";
                if (client.world.isRaining()) return "Weather: Rain";
                return "Weather: Clear";
            }
        ));

        manager.registerModule(new SimpleInfoModule(
            "time_display", "Time Display", "In-game Minecraft clock and day count.",
            HudModule.Category.WORLD, 300, 54, client -> {
                if (client.world == null) return "Day 0 · 06:00";
                long time = client.world.getTimeOfDay();
                long day = time / 24000L;
                long ticks = time % 24000L;
                int hours = (int) ((ticks / 1000L + 6L) % 24L);
                int mins = (int) ((ticks % 1000L) * 60L / 1000L);
                return String.format("Day %d · %02d:%02d", day, hours, mins);
            }
        ));

        manager.registerModule(new SimpleInfoModule(
            "world_info", "World Information", "Dimension and difficulty overview.",
            HudModule.Category.WORLD, 300, 76, client -> {
                if (client.world == null) return "World: Menu";
                String dim = formatId(client.world.getRegistryKey().getValue().getPath());
                String diff = client.world.getDifficulty().getName();
                return dim + " (" + diff + ")";
            }
        ));
    }

    private static String formatId(String raw) {
        if (raw == null || raw.isEmpty()) return "Unknown";
        String spaced = raw.replace('_', ' ');
        return Character.toUpperCase(spaced.charAt(0)) + spaced.substring(1);
    }

    @FunctionalInterface
    interface InfoSupplier {
        String get(MinecraftClient client);
    }

    static final class SimpleInfoModule extends HudModule {
        private final InfoSupplier supplier;

        SimpleInfoModule(String id, String name, String desc, Category cat, int x, int y, InfoSupplier supplier) {
            super(id, name, desc, cat, x, y, false);
            this.supplier = supplier;
        }

        @Override
        public int baseWidth(MinecraftClient client) {
            return Math.max(76, client.textRenderer.getWidth(supplier.get(client)) + 16);
        }

        @Override
        public int baseHeight(MinecraftClient client) {
            return 18;
        }

        @Override
        protected void renderContent(DrawContext ctx, MinecraftClient client, AirTheme theme, float opacity, boolean editorMode) {
            ClientConfig.ModuleState st = state(SevenXAirClient.config);
            int col = 0xFF000000 | (st.textColorRgb & 0x00FFFFFF);
            String prefix = (st.customPrefix != null && !st.customPrefix.isEmpty()) ? (st.customPrefix + " ") : "";
            ctx.drawText(client.textRenderer, prefix + supplier.get(client), 8, 5, col, st.textShadow);
        }
    }
}
