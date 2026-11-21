package com.sevenxair.client.input;

import com.sevenxair.client.SevenXAirClient;
import com.sevenxair.client.config.ClientConfig;
import com.sevenxair.client.gui.AirClickGuiScreen;
import com.sevenxair.client.gui.HudEditorScreen;
import com.sevenxair.client.hud.HudModule;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.minecraft.client.option.KeyBinding;
import net.minecraft.client.util.InputUtil;
import org.lwjgl.glfw.GLFW;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Registers and handles all 7xAir Fabric client keybinds with lightweight
 * zero-iterator tick polling and clean shutdown disposal.
 */
public final class AirKeybinds {
    public static final String CATEGORY = "category.7xair.client";

    public static KeyBinding openGuiKey;
    public static KeyBinding openHudEditorKey;
    public static KeyBinding toggleSprintKey;
    public static KeyBinding toggleHudKey;

    private static final Set<Integer> PRESSED_MODULE_KEYS = new HashSet<>();

    private AirKeybinds() {}

    public static void dispose() {
        PRESSED_MODULE_KEYS.clear();
    }

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
            ClientConfig cfg = SevenXAirClient.config;
            if (cfg == null) return;

            while (openGuiKey.wasPressed()) {
                client.setScreen(new AirClickGuiScreen());
            }

            while (openHudEditorKey.wasPressed()) {
                client.setScreen(new HudEditorScreen(client.currentScreen));
            }

            while (toggleSprintKey.wasPressed()) {
                cfg.toggleSprintActive = !cfg.toggleSprintActive;
                cfg.saveDebounced();
            }

            while (toggleHudKey.wasPressed()) {
                cfg.hudVisible = !cfg.hudVisible;
                cfg.saveDebounced();
            }

            // Handle per-module custom keybinds (indexed zero-iterator loop, only when in-game)
            if (client.currentScreen == null && client.getWindow() != null) {
                long winHandle = client.getWindow().getHandle();
                List<HudModule> mods = SevenXAirClient.hudManager.getModules();
                for (int i = 0, n = mods.size(); i < n; i++) {
                    ClientConfig.ModuleState st = mods.get(i).state(cfg);
                    int code = st.keybindCode;
                    if (code <= 0) continue;
                    boolean down = GLFW.glfwGetKey(winHandle, code) == GLFW.GLFW_PRESS;
                    if (down && PRESSED_MODULE_KEYS.add(code)) {
                        st.enabled = !st.enabled;
                        cfg.saveDebounced();
                    } else if (!down) {
                        PRESSED_MODULE_KEYS.remove(code);
                    }
                }
            }

            // Apply persistent toggle sprint when moving forward
            if (cfg.toggleSprintActive
                && client.options.forwardKey.isPressed()
                && !client.player.isSneaking()
                && !client.player.horizontalCollision) {
                client.player.setSprinting(true);
            }
        });
    }
}
