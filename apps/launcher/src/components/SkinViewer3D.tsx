import { useEffect, useRef, useState } from "react";
import { IdleAnimation, SkinViewer } from "skinview3d";

interface SkinViewer3DProps {
  username: string;
  autoRotate?: boolean;
  reducedMotion?: boolean;
  paused?: boolean;
}

type SkinModel = "auto-detect" | "default" | "slim";

/**
 * Generates a clean 64x64 fallback Minecraft skin texture on an offscreen canvas
 * so the 3D character always renders cleanly even offline or if skin retrieval fails.
 */
function buildFallbackSkinDataUrl(): string {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  ctx.clearRect(0, 0, 64, 64);

  // Head
  ctx.fillStyle = "#e0b394";
  ctx.fillRect(0, 0, 32, 16);
  ctx.fillStyle = "#2b2430";
  ctx.fillRect(0, 0, 32, 8);
  ctx.fillRect(8, 8, 8, 2);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(9, 11, 2, 1);
  ctx.fillRect(13, 11, 2, 1);
  ctx.fillStyle = "#38bdf8";
  ctx.fillRect(10, 11, 1, 1);
  ctx.fillRect(13, 11, 1, 1);

  // Torso
  ctx.fillStyle = "#1e3a5f";
  ctx.fillRect(16, 16, 24, 16);
  ctx.fillStyle = "#56ccf2";
  ctx.fillRect(22, 20, 4, 10);

  // Arms
  ctx.fillStyle = "#244775";
  ctx.fillRect(40, 16, 16, 16);
  ctx.fillRect(32, 48, 16, 16);
  ctx.fillStyle = "#e0b394";
  ctx.fillRect(40, 28, 16, 4);
  ctx.fillRect(32, 60, 16, 4);

  // Legs
  ctx.fillStyle = "#1a2234";
  ctx.fillRect(0, 16, 16, 16);
  ctx.fillRect(16, 48, 16, 16);

  return canvas.toDataURL("image/png");
}

export function SkinViewer3D({
  username,
  autoRotate = true,
  reducedMotion = false,
  paused = false,
}: SkinViewer3DProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewerRef = useRef<SkinViewer | null>(null);
  const [model, setModel] = useState<SkinModel>("auto-detect");
  const [skinSource, setSkinSource] = useState<"live" | "default">("default");
  const [loadingSkin, setLoadingSkin] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const viewer = new SkinViewer({
      canvas,
      width: 240,
      height: 310,
    });
    viewer.fov = 42;
    viewer.zoom = 0.86;
    viewer.controls.enableZoom = false;
    viewer.controls.enablePan = false;
    viewer.autoRotateSpeed = 0.55;
    viewerRef.current = viewer;

    return () => {
      viewer.dispose();
      viewerRef.current = null;
    };
  }, []);

  // Pause WebGL render loop completely when window is minimized or Minecraft is running
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const shouldAnimate = autoRotate && !reducedMotion && !paused;
    viewer.renderPaused = paused;
    viewer.autoRotate = shouldAnimate;
    viewer.animation = shouldAnimate ? new IdleAnimation() : null;
  }, [autoRotate, reducedMotion, paused]);

  useEffect(() => {
    let cancelled = false;
    const viewer = viewerRef.current;
    if (!viewer) return;

    const cleanName = username.trim();
    const fallbackUrl = buildFallbackSkinDataUrl();

    const loadSkin = async () => {
      setLoadingSkin(true);
      try {
        if (!cleanName || cleanName.length < 3) {
          await viewer.loadSkin(fallbackUrl, { model });
          if (!cancelled) setSkinSource("default");
          return;
        }

        const candidates = [
          `https://minotar.net/skin/${encodeURIComponent(cleanName)}`,
          `https://mc-heads.net/skin/${encodeURIComponent(cleanName)}`,
        ];

        for (const url of candidates) {
          try {
            await viewer.loadSkin(url, { model });
            if (!cancelled) setSkinSource("live");
            return;
          } catch {
            // Try next provider or fall back to built-in default skin
          }
        }

        try {
          await viewer.loadSkin(fallbackUrl, { model });
        } catch {
          // Ignore if disposed during unmount
        }
        if (!cancelled) setSkinSource("default");
      } finally {
        if (!cancelled) setLoadingSkin(false);
      }
    };

    void loadSkin();
    return () => {
      cancelled = true;
    };
  }, [username, model]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
      }}
    >
      <div
        style={{
          position: "relative",
          width: 240,
          height: 310,
          display: "grid",
          placeItems: "center",
          cursor: "grab",
        }}
        title="Drag to rotate 3D character"
      >
        <canvas ref={canvasRef} style={{ width: 240, height: 310, display: "block" }} />
        {loadingSkin && (
          <div
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 8px",
              borderRadius: 999,
              background: "rgba(5, 9, 18, 0.65)",
              fontSize: 10.5,
              color: "var(--text-secondary)",
            }}
          >
            <span className="spinner-ring" />
            Skin
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
        <span className="nav-badge">
          {skinSource === "live" ? `Skin: ${username}` : "Default Skin"}
        </span>
        {(["auto-detect", "default", "slim"] as const).map((m) => (
          <button
            key={m}
            type="button"
            className={`toggle-btn ${model === m ? "toggle-btn--on" : ""}`}
            style={{ minWidth: 0, padding: "4px 9px", fontSize: 11 }}
            onClick={() => setModel(m)}
          >
            {m === "auto-detect" ? "Auto" : m === "default" ? "Classic" : "Slim"}
          </button>
        ))}
      </div>
    </div>
  );
}
