package com.sevenxair.client.hud;

import java.util.ArrayDeque;
import java.util.Deque;

/**
 * Tracks legitimate client-side session events: combo count, hit timestamps,
 * session start time, and recent client notifications.
 */
public final class CombatTracker {
    private static volatile long sessionStartMs = System.currentTimeMillis();
    private static final Deque<String> RECENT_NOTIFICATIONS = new ArrayDeque<>();
    private static int comboCount = 0;
    private static long lastHitMs = 0L;
    private static int lastHurtTime = 0;
    private static long lastNotificationMs = 0L;

    private CombatTracker() {}

    /** Resets transient combat and session state cleanly on world join/leave or shutdown. */
    public static synchronized void resetSession() {
        sessionStartMs = System.currentTimeMillis();
        comboCount = 0;
        lastHitMs = 0L;
        lastHurtTime = 0;
        lastNotificationMs = 0L;
        RECENT_NOTIFICATIONS.clear();
    }

    public static synchronized void recordAttackHit() {
        long now = System.currentTimeMillis();
        if (now - lastHitMs > 3000L) {
            comboCount = 1;
        } else {
            comboCount++;
        }
        lastHitMs = now;
    }

    public static synchronized void updatePlayerHurtTime(int hurtTime) {
        if (hurtTime > lastHurtTime && hurtTime > 0) {
            comboCount = 0;
        }
        lastHurtTime = hurtTime;
    }

    public static synchronized int getComboCount() {
        if (System.currentTimeMillis() - lastHitMs > 3500L) {
            comboCount = 0;
        }
        return comboCount;
    }

    public static synchronized long getLastHitMs() {
        return lastHitMs;
    }

    public static long getSessionElapsedSeconds() {
        return Math.max(0L, (System.currentTimeMillis() - sessionStartMs) / 1000L);
    }

    public static synchronized void pushNotification(String message) {
        if (message == null || message.isBlank()) return;
        RECENT_NOTIFICATIONS.addFirst(message);
        while (RECENT_NOTIFICATIONS.size() > 4) {
            RECENT_NOTIFICATIONS.removeLast();
        }
        lastNotificationMs = System.currentTimeMillis();
    }

    public static synchronized String getLatestNotification() {
        if (RECENT_NOTIFICATIONS.isEmpty()) return "7xAir Ready";
        if (System.currentTimeMillis() - lastNotificationMs > 8000L) {
            return "No recent alerts";
        }
        return RECENT_NOTIFICATIONS.peekFirst();
    }

    public static synchronized String[] getRecentNotifications() {
        return RECENT_NOTIFICATIONS.toArray(new String[0]);
    }
}
