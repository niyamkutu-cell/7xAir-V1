package com.sevenxair.client.hud;

/**
 * Lightweight zero-allocation ring-buffer frame-time sampler for the 7xAir
 * Performance Monitor HUD. Computes live FPS, frame time (ms), and rolling
 * 1% low FPS without per-frame heap allocations.
 */
public final class PerformanceMonitor {
    private static final int SAMPLE_CAPACITY = 240;
    private static final float[] FRAME_MS_RING = new float[SAMPLE_CAPACITY];
    private static final float[] SORT_SCRATCH = new float[SAMPLE_CAPACITY];

    private static long lastFrameNanos = 0L;
    private static int writeIndex = 0;
    private static int sampleCount = 0;
    private static float lastFrameMs = 0.0f;
    private static float cachedAvgFps = 0.0f;
    private static float cachedOnePercentLow = 0.0f;
    private static long lastStatsUpdateMs = 0L;

    private PerformanceMonitor() {}

    public static void recordFrame() {
        long now = System.nanoTime();
        if (lastFrameNanos != 0L) {
            float dtMs = (now - lastFrameNanos) / 1_000_000.0f;
            if (dtMs > 0.05f && dtMs < 500.0f) {
                lastFrameMs = dtMs;
                FRAME_MS_RING[writeIndex] = dtMs;
                writeIndex = (writeIndex + 1) % SAMPLE_CAPACITY;
                if (sampleCount < SAMPLE_CAPACITY) {
                    sampleCount++;
                }
            }
        }
        lastFrameNanos = now;

        long wallMs = System.currentTimeMillis();
        if (wallMs - lastStatsUpdateMs >= 250L && sampleCount >= 10) {
            lastStatsUpdateMs = wallMs;
            recomputeStats();
        }
    }

    private static void recomputeStats() {
        int n = sampleCount;
        float sum = 0.0f;
        for (int i = 0; i < n; i++) {
            float v = FRAME_MS_RING[i];
            SORT_SCRATCH[i] = v;
            sum += v;
        }
        java.util.Arrays.sort(SORT_SCRATCH, 0, n);
        float avgMs = sum / n;
        cachedAvgFps = avgMs > 0.01f ? (1000.0f / avgMs) : 0.0f;

        // 1% low = 99th percentile worst frame time
        int p99Index = Math.min(n - 1, Math.max(0, (int) Math.floor(n * 0.99f)));
        float p99Ms = SORT_SCRATCH[p99Index];
        cachedOnePercentLow = p99Ms > 0.01f ? (1000.0f / p99Ms) : 0.0f;
    }

    public static float getLastFrameMs() {
        return lastFrameMs;
    }

    public static int getAvgFps() {
        return Math.round(cachedAvgFps);
    }

    public static int getOnePercentLowFps() {
        return Math.round(cachedOnePercentLow);
    }

    public static long getUsedMemoryMb() {
        Runtime rt = Runtime.getRuntime();
        return (rt.totalMemory() - rt.freeMemory()) / (1024L * 1024L);
    }

    public static long getMaxMemoryMb() {
        return Runtime.getRuntime().maxMemory() / (1024L * 1024L);
    }

    public static void reset() {
        lastFrameNanos = 0L;
        writeIndex = 0;
        sampleCount = 0;
        lastFrameMs = 0.0f;
        cachedAvgFps = 0.0f;
        cachedOnePercentLow = 0.0f;
    }
}
