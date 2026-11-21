package com.sevenxair.client.compat;

import com.sevenxair.client.SevenXAirClient;
import net.fabricmc.loader.api.FabricLoader;

import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Runtime renderer detection and graceful degradation layer for 7xAir.
 * Checks loaded rendering mods (Sodium, Iris, VulkanMod, ImmediatelyFast) at startup
 * without adding hard dependencies or conflicting OpenGL/Vulkan mixins.
 * If a renderer cannot safely support an optional visual feature, it disables that
 * feature gracefully rather than crashing Minecraft.
 */
public final class RendererCompat {
    private static final int MAX_MODULE_FAULTS = 3;

    private static volatile boolean initialized = false;
    private static volatile boolean sodiumLoaded = false;
    private static volatile boolean irisLoaded = false;
    private static volatile boolean vulkanModLoaded = false;
    private static volatile boolean immediatelyFastLoaded = false;

    private static volatile boolean scissorEnabled = true;
    private static volatile boolean zLayerOffsetEnabled = true;
    private static volatile boolean softOuterGlowEnabled = true;
    private static volatile boolean postProcessEffectsEnabled = false;

    private static final Map<String, Integer> MODULE_FAULTS = new ConcurrentHashMap<>();
    private static final Set<String> QUARANTINED_MODULES = ConcurrentHashMap.newKeySet();

    private RendererCompat() {}

    public static void detect() {
        if (initialized) return;
        FabricLoader loader = FabricLoader.getInstance();
        sodiumLoaded = loader.isModLoaded("sodium");
        irisLoaded = loader.isModLoaded("iris");
        vulkanModLoaded = loader.isModLoaded("vulkanmod");
        immediatelyFastLoaded = loader.isModLoaded("immediatelyfast");

        // VulkanMod uses a [0, 1] Vulkan depth range and non-GL pipelines:
        // disable large Z-layer offsets, multi-pass outer glow overdraw, and GL post effects.
        if (vulkanModLoaded) {
            zLayerOffsetEnabled = false;
            softOuterGlowEnabled = false;
            postProcessEffectsEnabled = false;
        } else {
            zLayerOffsetEnabled = true;
            softOuterGlowEnabled = true;
            // Keep custom framebuffer/post-shader effects off by default to stay lightweight
            postProcessEffectsEnabled = false;
        }

        initialized = true;
        SevenXAirClient.LOGGER.info(
            "7xAir RendererCompat initialized (backend={}, sodium={}, iris={}, vulkanmod={}, immediatelyfast={}, zOffset={}, glow={})",
            activeRendererName(),
            sodiumLoaded,
            irisLoaded,
            vulkanModLoaded,
            immediatelyFastLoaded,
            zLayerOffsetEnabled,
            softOuterGlowEnabled
        );
    }

    public static String activeRendererName() {
        if (vulkanModLoaded) return "VulkanMod";
        if (sodiumLoaded && irisLoaded) return "Sodium + Iris";
        if (sodiumLoaded) return "Sodium";
        if (irisLoaded) return "Iris";
        return "Vanilla OpenGL";
    }

    public static boolean isSodiumLoaded() { return sodiumLoaded; }
    public static boolean isIrisLoaded() { return irisLoaded; }
    public static boolean isVulkanModLoaded() { return vulkanModLoaded; }
    public static boolean isImmediatelyFastLoaded() { return immediatelyFastLoaded; }

    public static boolean supportsScissorClip() { return scissorEnabled; }
    public static boolean supportsZLayerOffset() { return zLayerOffsetEnabled; }
    public static boolean supportsSoftOuterGlow() { return softOuterGlowEnabled; }
    public static boolean supportsPostProcessEffects() { return postProcessEffectsEnabled; }

    /** Disables scissor clipping gracefully if an exotic renderer throws during enableScissor. */
    public static void reportScissorFault(Throwable error) {
        if (scissorEnabled) {
            scissorEnabled = false;
            SevenXAirClient.LOGGER.warn(
                "7xAir disabled GUI scissor clipping for renderer '{}' after runtime fault: {}",
                activeRendererName(),
                error.getClass().getSimpleName()
            );
        }
    }

    public static boolean isModuleQuarantined(String moduleId) {
        return QUARANTINED_MODULES.contains(moduleId);
    }

    /**
     * Isolates repeated rendering exceptions in a single HUD module so a renderer conflict
     * disables only that module for the session instead of crashing Minecraft.
     */
    public static void reportModuleFault(String moduleId, Throwable error) {
        int count = MODULE_FAULTS.merge(moduleId, 1, Integer::sum);
        if (count >= MAX_MODULE_FAULTS && QUARANTINED_MODULES.add(moduleId)) {
            SevenXAirClient.LOGGER.warn(
                "7xAir gracefully disabled HUD module '{}' for this session under '{}' after {} faults: {}",
                moduleId,
                activeRendererName(),
                count,
                error.getClass().getSimpleName()
            );
        }
    }

    public static void dispose() {
        MODULE_FAULTS.clear();
        QUARANTINED_MODULES.clear();
    }
}
