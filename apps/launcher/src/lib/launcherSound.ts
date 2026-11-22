import type { AudioCustomization, SoundPackId } from "./customization";

export type LauncherSoundKind =
  | "hover"
  | "button"
  | "nav"
  | "card"
  | "click"
  | "toggle"
  | "dropdown"
  | "notification"
  | "important";

let ctx: AudioContext | null = null;
let unlockedByGesture = false;
let activeVoices = 0;
const MAX_VOICES = 3;
const lastAt: Record<string, number> = {};

export function unlockLauncherAudio(): void {
  unlockedByGesture = true;
}

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!ctx) ctx = new Ctx();
  if (ctx.state === "suspended") {
    void ctx.resume().catch(() => {});
  }
  return ctx;
}

interface MetallicToneSpec {
  f1: number;
  f2: number;
  harmonic: number;
  dur: number;
  type: OscillatorType;
  gain: number;
  cooldownMs: number;
}

const METALLIC_SPECS: Record<LauncherSoundKind, MetallicToneSpec> = {
  hover: { f1: 1180, f2: 1420, harmonic: 2.02, dur: 0.032, type: "sine", gain: 0.075, cooldownMs: 95 },
  button: { f1: 920, f2: 640, harmonic: 2.41, dur: 0.044, type: "triangle", gain: 0.11, cooldownMs: 60 },
  nav: { f1: 740, f2: 1080, harmonic: 1.98, dur: 0.068, type: "sine", gain: 0.11, cooldownMs: 75 },
  card: { f1: 680, f2: 790, harmonic: 2.5, dur: 0.028, type: "sine", gain: 0.055, cooldownMs: 130 },
  click: { f1: 860, f2: 520, harmonic: 2.25, dur: 0.042, type: "triangle", gain: 0.11, cooldownMs: 55 },
  toggle: { f1: 580, f2: 960, harmonic: 2.1, dur: 0.056, type: "sine", gain: 0.11, cooldownMs: 65 },
  dropdown: { f1: 1040, f2: 820, harmonic: 2.35, dur: 0.036, type: "triangle", gain: 0.09, cooldownMs: 70 },
  notification: { f1: 660, f2: 990, harmonic: 1.5, dur: 0.11, type: "sine", gain: 0.12, cooldownMs: 110 },
  important: { f1: 440, f2: 880, harmonic: 1.5, dur: 0.14, type: "triangle", gain: 0.14, cooldownMs: 140 },
};

const PACK_PITCH_SHIFT: Record<SoundPackId, number> = {
  "metallic-pro": 1.0,
  "glass-chime": 1.16,
  "cyber-pulse": 0.84,
  "soft-nature": 0.72,
};

export function playLauncherSound(
  kind: LauncherSoundKind,
  audio: AudioCustomization,
  forcePreview = false
): void {
  if (!forcePreview) {
    if (!unlockedByGesture) return;
    if (audio.muted || audio.volume <= 0.001) return;
    if ((kind === "hover" || kind === "card") && !audio.hoverSound) return;
    if ((kind === "click" || kind === "button" || kind === "nav" || kind === "dropdown") && !audio.clickSound) return;
    if (kind === "toggle" && !audio.toggleSound) return;
    if ((kind === "notification" || kind === "important") && !audio.notificationSound) return;
  }

  const spec = METALLIC_SPECS[kind] ?? METALLIC_SPECS.button;
  const nowMs = performance.now();
  if (!forcePreview) {
    if (activeVoices >= MAX_VOICES) return;
    if (lastAt[kind] && nowMs - lastAt[kind] < spec.cooldownMs) return;
  }
  lastAt[kind] = nowMs;

  const ac = getAudioContext();
  if (!ac) return;

  const pitch = PACK_PITCH_SHIFT[audio.soundPack] ?? 1.0;
  const now = ac.currentTime;
  const vol = Math.max(0.01, Math.min(1, audio.volume)) * spec.gain;

  // Fundamental + crisp metallic overtone pair
  for (const [mult, ampScale] of [
    [1.0, 1.0],
    [spec.harmonic, 0.34],
  ] as const) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = spec.type;
    osc.frequency.setValueAtTime(spec.f1 * pitch * mult, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, spec.f2 * pitch * mult), now + spec.dur);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(vol * ampScale, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + spec.dur);

    osc.connect(gain);
    gain.connect(ac.destination);
    activeVoices += 1;
    osc.onended = () => {
      activeVoices = Math.max(0, activeVoices - 1);
      osc.disconnect();
      gain.disconnect();
    };
    osc.start(now);
    osc.stop(now + spec.dur + 0.015);
  }
}
