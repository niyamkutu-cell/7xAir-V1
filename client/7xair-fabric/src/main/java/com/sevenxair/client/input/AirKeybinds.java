package com.sevenxair.client.input;

import com.sevenxair.client.SevenXAirClient;
import com.sevenxair.client.gui.AirClickGuiScreen;
import com.sevenxair.client.gui.HudEditorScreen;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.minecraft.client.option.KeyBinding;
import net.minecraft.client.util.InputUtil;
import org.lwjgl.glfw.GLFW;

/**
 * Registers and handles all 7xAir Fabric client keybinds.
 */
public final class AirKeybinds {
    public static final String CATEGORY = "category.7xair.client";

    public static KeyBinding openGuiKey;
    public static KeyBinding openHudEditorKey;
    public static KeyBinding toggleSprintKey;
    public static KeyBinding toggleHudKey;

    private AirKeybinds() {}

    public static void register() {
        openGuiKey = KeyBindingHelper.registerKeyBinding(new KeyBinding(
            "key.7xair.open_gui",
            InputUtil.Type.KEYSYM,
            GLFW.GLFW_KEY_RIGHT_SHIFT,
            CATEGORY
        ));

        openHudEditorKey = KeyBindingHelper.registerKeyBinding(new KeyBinding(
            "key.7xair.open_hud_editor",
            InputUtil.Type.KEYSYM,
            GLFW.GLFW_KEY_H,
            CATEGORY
        ));

        toggleSprintKey = KeyBindingHelper.registerKeyBinding(new KeyBinding(
            "key.7xair.toggle_sprint",
            InputUtil.Type.KEYSYM,
            GLFW.GLFW_KEY_V,
            CATEGORY
        ));

        toggleHudKey = KeyBindingHelper.registerKeyBinding(new KeyBinding(
            "key.7xair.toggle_hud",
            InputUtil.Type.KEYSYM,
            GLFW.GLFW_KEY_F8,
            CATEGORY
        ));

        ClientTickEvents.END_CLIENT_TICK.register(client -> {
            if (client.player == null) return;

            while (openGuiKey.wasPressed()) {
                client.setScreen(new AirClickGuiScreen());
            }

            while (openHudEditorKey.wasPressed()) {
                client.setScreen(new HudEditorScreen(client.currentScreen));
            }

            while (toggleSprintKey.wasPressed()) {
                SevenXAirClient.config.toggleSprintActive = !SevenXAirClient.config.toggleSprintActive;
                SevenXAirClient.config.save();
            }

            while (toggleHudKey.wasPressed()) {
                SevenXAirClient.config.hudVisible = !SevenXAirClient.config.hudVisible;
                SevenXAirClient.config.save();
            }

            // Apply persistent toggle sprint when moving forward
            if (SevenXAirClient.config.toggleSprintActive
                && client.options.forwardKey.isPressed()
                && !client.player.isSneaking()
                && !client.player.horizontalCollision) {
                client.player.setSprinting(true);
            }
        });
    }
}
