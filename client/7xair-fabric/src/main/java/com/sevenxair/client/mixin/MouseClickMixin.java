package com.sevenxair.client.mixin;

import com.sevenxair.client.hud.CpsTracker;
import net.minecraft.client.Mouse;
import org.lwjgl.glfw.GLFW;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(Mouse.class)
public abstract class MouseClickMixin {
    @Inject(method = "onMouseButton", at = @At("HEAD"))
    private void sevenxair$onMouseButton(long window, int button, int action, int mods, CallbackInfo ci) {
        if (action != GLFW.GLFW_PRESS) {
            return;
        }
        if (button == GLFW.GLFW_MOUSE_BUTTON_LEFT) {
            CpsTracker.recordLeftClick();
        } else if (button == GLFW.GLFW_MOUSE_BUTTON_RIGHT) {
            CpsTracker.recordRightClick();
        }
    }
}
