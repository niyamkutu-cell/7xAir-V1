package com.sevenxair.client.hud;

import java.util.ArrayDeque;
import java.util.Deque;

/**
 * Tracks rolling 1-second Left & Right mouse clicks per second (CPS).
 */
public final class CpsTracker {
    private static final long WINDOW_MS = 1000L;
    private static final Deque<Long> LEFT_CLICKS = new ArrayDeque<>();
    private static final Deque<Long> RIGHT_CLICKS = new ArrayDeque<>();

    private CpsTracker() {}

    public static synchronized void reset() {
        LEFT_CLICKS.clear();
        RIGHT_CLICKS.clear();
    }

    public static synchronized void recordLeftClick() {
        long now = System.currentTimeMillis();
        LEFT_CLICKS.addLast(now);
        prune(LEFT_CLICKS, now);
    }

    public static synchronized void recordRightClick() {
        long now = System.currentTimeMillis();
        RIGHT_CLICKS.addLast(now);
        prune(RIGHT_CLICKS, now);
    }

    public static synchronized int getLeftCps() {
        long now = System.currentTimeMillis();
        prune(LEFT_CLICKS, now);
        return LEFT_CLICKS.size();
    }

    public static synchronized int getRightCps() {
        long now = System.currentTimeMillis();
        prune(RIGHT_CLICKS, now);
        return RIGHT_CLICKS.size();
    }

    private static void prune(Deque<Long> deque, long now) {
        while (!deque.isEmpty() && now - deque.peekFirst() > WINDOW_MS) {
            deque.removeFirst();
        }
    }
}
