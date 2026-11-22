import { useEffect, useRef, useState } from "react";
import type { AudioCustomization } from "../lib/customization";
import { playLauncherSound, unlockLauncherAudio } from "../lib/launcherSound";

interface InteractionLayerProps {
  audio: AudioCustomization;
  reducedMotion: boolean;
  hoverAnimation: boolean;
}

export function InteractionLayer({
  audio,
  reducedMotion,
  hoverAnimation,
}: InteractionLayerProps) {
  const audioRef = useRef(audio);
  audioRef.current = audio;

  const ringRef = useRef<HTMLDivElement | null>(null);
  const [cursorVisible, setCursorVisible] = useState(false);
  const [cursorHovering, setCursorHovering] = useState(false);
  const [cursorPressed, setCursorPressed] = useState(false);

  useEffect(() => {
    const isCoarse =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: coarse)").matches;

    let rafId = 0;
    let mx = -100;
    let my = -100;

    const unlock = () => unlockLauncherAudio();

    const onPointerMove = (ev: PointerEvent) => {
      if (isCoarse || reducedMotion) return;
      mx = ev.clientX;
      my = ev.clientY;
      setCursorVisible(true);

      const target = ev.target instanceof Element ? ev.target : null;
      const interactive = target?.closest("button, a, select, input[type='range'], .glass-panel--interactive");
      setCursorHovering(Boolean(interactive));

      // Dynamic pointer lighting on interactive glass panels
      if (hoverAnimation && target) {
        const panel = target.closest(".glass-panel--interactive") as HTMLElement | null;
        if (panel) {
          const rect = panel.getBoundingClientRect();
          panel.style.setProperty("--card-mx", `${ev.clientX - rect.left}px`);
          panel.style.setProperty("--card-my", `${ev.clientY - rect.top}px`);
        }
      }

      if (!rafId) {
        rafId = window.requestAnimationFrame(() => {
          rafId = 0;
          if (ringRef.current) {
            ringRef.current.style.transform = `translate3d(${mx - 14}px, ${my - 14}px, 0)`;
          }
        });
      }
    };

    const onPointerEnter = (ev: PointerEvent) => {
      const target = ev.target instanceof Element ? ev.target : null;
      if (!target) return;
      if (target.matches(".nav-item")) {
        playLauncherSound("nav", audioRef.current);
      } else if (target.matches("button.glass-button, button.toggle-btn")) {
        playLauncherSound("hover", audioRef.current);
      } else if (target.matches(".glass-panel--interactive")) {
        playLauncherSound("card", audioRef.current);
      }
    };

    const onPointerDown = (ev: PointerEvent) => {
      unlock();
      setCursorPressed(true);
      const target = ev.target instanceof Element ? ev.target : null;
      if (!target) return;
      if (target.closest("select")) {
        playLauncherSound("dropdown", audioRef.current);
      } else if (target.closest(".toggle-btn")) {
        playLauncherSound("toggle", audioRef.current);
      } else if (target.closest(".glass-button--primary")) {
        playLauncherSound("important", audioRef.current);
      } else if (target.closest("button")) {
        playLauncherSound("button", audioRef.current);
      }
    };

    const onPointerUp = () => setCursorPressed(false);
    const onPointerLeave = () => setCursorVisible(false);

    window.addEventListener("keydown", unlock, { passive: true });
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("pointerenter", onPointerEnter, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointerup", onPointerUp, { passive: true });
    document.addEventListener("mouseleave", onPointerLeave);

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerenter", onPointerEnter, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("mouseleave", onPointerLeave);
    };
  }, [reducedMotion, hoverAnimation]);

  if (reducedMotion || !cursorVisible) return null;

  return (
    <div
      ref={ringRef}
      aria-hidden="true"
      className={`custom-cursor-ring ${cursorHovering ? "custom-cursor-ring--hover" : ""} ${
        cursorPressed ? "custom-cursor-ring--press" : ""
      }`}
    />
  );
}
