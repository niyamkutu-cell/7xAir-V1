package com.sevenxair.client.hud;

import com.sevenxair.client.SevenXAirClient;
import com.sevenxair.client.config.ClientConfig;
import com.sevenxair.client.theme.AirTheme;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.item.ItemStack;
import net.minecraft.util.hit.BlockHitResult;

import java.time.LocalTime;
import java.time.format.DateTimeFormatter;

/**
 * Batch 3: Render & Player HUD modules.
 */
public final class RenderPlayerModules {
    private static final DateTimeFormatter CLOCK_FMT = DateTimeFormatter.ofPattern("HH:mm:ss");

    private RenderPlayerModules() {}

    public static void registerAll(HudManager manager) {
        // Render category modules
        manager.registerModule(new MovementWorldModules.SimpleInfoModule(
            "motion_blur", "Motion Blur", "Lightweight camera-turn softness indicator.",
            HudModule.Category.RENDER, 300, 102, client -> "Motion Blur: Smooth"
        ));

        manager.registerModule(new MovementWorldModules.SimpleInfoModule(
            "custom_nametags", "Custom Nametags", "Shows nearby visible player count.",
            HudModule.Category.RENDER, 300, 124, client -> {
                int players = client.world != null ? client.world.getPlayers().size() : 0;
                return "Players Nearby: " + players;
            }
        ));

        manager.registerModule(new MovementWorldModules.SimpleInfoModule(
            "entity_indicators", "Entity Indicators", "Displays loaded entity count in world.",
            HudModule.Category.RENDER, 300, 146, client -> {
                int count = client.world != null ? client.world.getRegularEntityCount() : 0;
                return "Entities: " + count;
            }
        ));

        manager.registerModule(new MovementWorldModules.SimpleInfoModule(
            "block_overlay", "Block Overlay Customizer", "Shows targeted block name and state.",
            HudModule.Category.RENDER, 300, 168, client -> {
                if (client.world != null && client.crosshairTarget instanceof BlockHitResult bhr) {
                    return "Block: " + client.world.getBlockState(bhr.getBlockPos()).getBlock().getName().getString();
                }
                return "Block: None";
            }
        ));

        manager.registerModule(new MovementWorldModules.SimpleInfoModule(
            "custom_particles", "Custom Particles", "Displays current particle density setting.",
            HudModule.Category.RENDER, 300, 190, client ->
                "Particles: " + client.options.getParticles().getValue().name()
        ));

        manager.registerModule(new DamageTintModule());

        manager.registerModule(new MovementWorldModules.SimpleInfoModule(
            "item_physics", "Item Physics", "Compact dropped-item visual indicator.",
            HudModule.Category.RENDER, 300, 234, client -> "Item Physics: Active"
        ));

        manager.registerModule(new MovementWorldModules.SimpleInfoModule(
            "time_changer", "Time Changer", "Client sky-time display override.",
            HudModule.Category.RENDER, 300, 256, client -> "Sky Time: Noon"
        ));

        // Player category modules (alongside existing armor & potions)
        manager.registerModule(new InventoryDisplayModule());

        manager.registerModule(new MovementWorldModules.SimpleInfoModule(
            "clock", "Clock", "Real-world local system clock.",
            HudModule.Category.PLAYER, 450, 10, client -> LocalTime.now().format(CLOCK_FMT)
        ));

        manager.registerModule(new MovementWorldModules.SimpleInfoModule(
            "durability_display", "Durability Display", "Remaining main-hand item durability.",
            HudModule.Category.PLAYER, 450, 32, client -> {
                if (client.player == null) return "Durability: --";
                ItemStack stack = client.player.getMainHandStack();
                if (stack.isEmpty() || !stack.isDamageable()) return "Durability: --";
                int remaining = stack.getMaxDamage() - stack.getDamage();
                return "Durability: " + remaining + "/" + stack.getMaxDamage();
            }
        ));
    }

    private static final class DamageTintModule extends HudModule {
        DamageTintModule() {
            super("damage_tint", "Damage Tint", "Red warning tint on low health or damage.", Category.RENDER, 300, 212, false);
        }

        @Override public int baseWidth(MinecraftClient c) { return 96; }
        @Override public int baseHeight(MinecraftClient c) { return 18; }

        @Override
        protected void renderContent(DrawContext ctx, MinecraftClient client, AirTheme theme, float opacity, boolean editorMode) {
            ClientConfig.ModuleState st = state(SevenXAirClient.config);
            boolean lowHp = client.player != null && (client.player.getHealth() <= 6.0f || client.player.hurtTime > 0);
            if (lowHp) {
                ctx.fill(0, 0, baseWidth(client), baseHeight(client), 0x44EF4444);
            }
            int col = lowHp ? 0xFFFCA5A5 : (0xFF000000 | (st.textColorRgb & 0x00FFFFFF));
            ctx.drawText(client.textRenderer, lowHp ? "Low Health!" : "Damage Tint", 8, 5, col, st.textShadow);
        }
    }

    private static final class InventoryDisplayModule extends HudModule {
        InventoryDisplayModule() {
            super("inventory_display", "Inventory Display", "Compact 3x9 mini preview of main inventory.", Category.PLAYER, 450, 56, false);
        }

        @Override public int baseWidth(MinecraftClient c) { return 118; }
        @Override public int baseHeight(MinecraftClient c) { return 44; }

        @Override
        protected void renderContent(DrawContext ctx, MinecraftClient client, AirTheme theme, float opacity, boolean editorMode) {
            for (int row = 0; row < 3; row++) {
                for (int col = 0; col < 9; col++) {
                    int sx = 5 + col * 12;
                    int sy = 5 + row * 12;
                    int slotIdx = 9 + row * 9 + col;
                    boolean occupied = client.player != null && !client.player.getInventory().getStack(slotIdx).isEmpty();
                    ctx.fill(sx, sy, sx + 10, sy + 10, occupied ? theme.accentArgb(0.65f) : 0x33FFFFFF);
                }
            }
        }
    }
}
