package com.sevenxair.client;

import com.sevenxair.client.config.ClientConfig;
import com.sevenxair.client.hud.HudManager;
import com.sevenxair.client.input.AirKeybinds;
import net.fabricmc.api.ClientModInitializer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class SevenXAirClient implements ClientModInitializer {
    public static final String MOD_ID = "sevenxair";
    public static final Logger LOGGER = LoggerFactory.getLogger("7xAirClient");

    public static ClientConfig config;
    public static HudManager hudManager;

    @Override
    public void onInitializeClient() {
        config = ClientConfig.load();
        hudManager = new HudManager();
        hudManager.registerRenderHook();
        AirKeybinds.register();
        LOGGER.info("7xAir Fabric Client initialized (theme={}, opacity={})", config.themeId, config.glassOpacity);
    }
}
