package com.sevenxair.client;

import com.sevenxair.client.compat.RendererCompat;
import com.sevenxair.client.config.ClientConfig;
import com.sevenxair.client.gui.GuiAnimator;
import com.sevenxair.client.hud.CombatTracker;
import com.sevenxair.client.hud.CpsTracker;
import com.sevenxair.client.hud.HudManager;
import com.sevenxair.client.input.AirKeybinds;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientLifecycleEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents;
import net.fabricmc.fabric.api.resource.ResourceManagerHelper;
import net.fabricmc.fabric.api.resource.SimpleSynchronousResourceReloadListener;
import net.minecraft.resource.ResourceManager;
import net.minecraft.resource.ResourceType;
import net.minecraft.util.Identifier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class SevenXAirClient implements ClientModInitializer {
    public static final String MOD_ID = "sevenxair";
    public static final Logger LOGGER = LoggerFactory.getLogger("7xAirClient");

    public static ClientConfig config;
    public static HudManager hudManager;

    @Override
    public void onInitializeClient() {
        RendererCompat.detect();
        config = ClientConfig.load();
        hudManager = new HudManager();
        hudManager.registerRenderHook();
        AirKeybinds.register();

        // World join & leave lifecycle: reset transient session/combat/CPS state and flush saves
        ClientPlayConnectionEvents.JOIN.register((handler, sender, client) -> {
            CombatTracker.resetSession();
            CpsTracker.reset();
            AirKeybinds.dispose();
        });
        ClientPlayConnectionEvents.DISCONNECT.register((handler, client) -> {
            if (config != null) {
                config.flushPendingSave();
            }
            CombatTracker.resetSession();
            CpsTracker.reset();
            AirKeybinds.dispose();
        });

        // Resource pack reload (F3+T): clear cached texture identifiers cleanly
        ResourceManagerHelper.get(ResourceType.CLIENT_RESOURCES).registerReloadListener(
            new SimpleSynchronousResourceReloadListener() {
                private final Identifier id = Identifier.of(MOD_ID, "gui_cache_reload");

                @Override
                public Identifier getFabricId() {
                    return id;
                }

                @Override
                public void reload(ResourceManager manager) {
                    GuiAnimator.dispose();
                }
            }
        );

        // Clean Minecraft shutdown: flush pending saves and release all transient caches
        ClientLifecycleEvents.CLIENT_STOPPING.register(client -> {
            if (config != null) {
                config.flushPendingSave();
            }
            CombatTracker.resetSession();
            CpsTracker.reset();
            GuiAnimator.dispose();
            AirKeybinds.dispose();
            RendererCompat.dispose();
        });

        LOGGER.info(
            "7xAir Fabric Client initialized (theme={}, opacity={}, renderer={})",
            config.themeId,
            config.glassOpacity,
            RendererCompat.activeRendererName()
        );
    }
}
