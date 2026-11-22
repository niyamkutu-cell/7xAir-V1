import {
  Check,
  Clock,
  Download,
  Image as ImageIcon,
  Palette,
  RotateCcw,
  Sparkles,
  Trash2,
  Type,
  Upload,
} from "lucide-react";
import { useRef, useState } from "react";
import { REACTION_ICON_CATALOG } from "../components/AtmosphereOverlay";
import { CustomizationCenter } from "../components/CustomizationCenter";
import { GlassPanel } from "../components/GlassPanel";
import { DEFAULT_CUSTOMIZATION, type CustomizationState } from "../lib/customization";
import { deleteCustomWallpaper, uploadCustomWallpaper } from "../lib/tauriBridge";
import { ANIME_WALLPAPERS, SEVEN_THEMES } from "../theme/themes";
import type {
  CustomWallpaperItem,
  LauncherSettings,
  ThemeId,
  FxQualityPreset,
  ThemeSwitchMode,
  UiFontSize,
  WallpaperFitMode,
  WallpaperPosition,
} from "../types/launcher";

interface ThemesPageProps {
  settings: LauncherSettings;
  effectiveTheme?: ThemeId;
  customWallpapers?: CustomWallpaperItem[];
  customization?: CustomizationState;
  onSaveCustomization?: (next: CustomizationState) => Promise<void>;
  onRefreshWallpapers?: () => Promise<void>;
  onUpdateSettings: (patch: Partial<LauncherSettings>) => Promise<void>;
}

const FONT_SIZE_OPTIONS: readonly { id: UiFontSize; label: string; sample: string }[] = [
  { id: "sm", label: "Small", sample: "A" },
  { id: "md", label: "Normal", sample: "A" },
  { id: "lg", label: "Large", sample: "A" },
  { id: "xl", label: "Extra Large", sample: "A" },
];

export function ThemesPage({
  settings,
  effectiveTheme,
  customWallpapers = [],
  customization = DEFAULT_CUSTOMIZATION,
  onSaveCustomization,
  onRefreshWallpapers,
  onUpdateSettings,
}: ThemesPageProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const wallpaperInputRef = useRef<HTMLInputElement | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const activeThemeId = effectiveTheme ?? settings.theme;
  const currentFontSize: UiFontSize = settings.fontSize ?? "md";
  const currentWallpaper = settings.wallpaperId ?? "auto";
  const currentDim = settings.wallpaperDim ?? 0.56;
  const currentFit: WallpaperFitMode = settings.wallpaperFit ?? "cover";
  const currentPos: WallpaperPosition = settings.wallpaperPosition ?? "center";
  const currentBrightness = settings.wallpaperBrightness ?? 1.0;
  const currentBlur = settings.wallpaperBlur ?? 0;
  const currentSat = settings.wallpaperSaturation ?? 1.08;
  const currentContrast = settings.wallpaperContrast ?? 1.04;
  const switchMode: ThemeSwitchMode = settings.themeSwitchMode ?? "manual";

  const selectTheme = (theme: ThemeId) => {
    setError(null);
    void onUpdateSettings({ theme, themeSwitchMode: "manual" });
  };

  const handleUploadWallpaper = async (file: File) => {
    setError(null);
    setNotice(null);
    if (!/\.(jpe?g|png|webp)$/i.test(file.name)) {
      setError("Only JPG, JPEG, PNG, and WebP wallpaper files are supported.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Wallpaper image must be 10 MB or smaller.");
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Unable to read image file."));
        reader.readAsDataURL(file);
      });
      const saved = await uploadCustomWallpaper(file.name, dataUrl);
      await onRefreshWallpapers?.();
      await onUpdateSettings({ wallpaperId: saved.id });
      setNotice(`Uploaded & applied custom wallpaper "${saved.name}".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteWallpaper = async (wp: CustomWallpaperItem) => {
    setError(null);
    setNotice(null);
    try {
      await deleteCustomWallpaper(wp.id);
      if (currentWallpaper === wp.id) {
        await onUpdateSettings({ wallpaperId: "auto" });
      }
      await onRefreshWallpapers?.();
      setNotice(`Removed custom wallpaper "${wp.name}".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleRestoreDefaultWallpaper = () => {
    setError(null);
    void onUpdateSettings({
      wallpaperId: "auto",
      wallpaperFit: "cover",
      wallpaperPosition: "center",
      wallpaperBrightness: 1.0,
      wallpaperBlur: 0,
      wallpaperSaturation: 1.08,
      wallpaperContrast: 1.04,
      wallpaperDim: 0.56,
    });
    setNotice("Restored default 7xAir wallpaper settings.");
  };

  const handleExportAppearance = () => {
    const payload = {
      app: "7xAir",
      schema: "7xair-appearance-v2",
      theme: settings.theme,
      glassOpacity: settings.glassOpacity,
      wallpaperId: currentWallpaper,
      wallpaperDim: currentDim,
      wallpaperFit: currentFit,
      wallpaperPosition: currentPos,
      wallpaperBrightness: currentBrightness,
      wallpaperBlur: currentBlur,
      wallpaperSaturation: currentSat,
      wallpaperContrast: currentContrast,
      fontSize: currentFontSize,
      themeSwitchMode: switchMode,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `7xair-appearance-${settings.theme}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setNotice("Exported 7xAir appearance preset.");
  };

  const handleImportAppearance = async (file: File) => {
    setError(null);
    setNotice(null);
    try {
      const parsed = JSON.parse(await file.text()) as Partial<LauncherSettings>;
      const patch: Partial<LauncherSettings> = {};
      if (parsed.theme && SEVEN_THEMES.some((t) => t.id === parsed.theme)) patch.theme = parsed.theme;
      if (typeof parsed.glassOpacity === "number" && parsed.glassOpacity >= 0.35 && parsed.glassOpacity <= 0.95) {
        patch.glassOpacity = parsed.glassOpacity;
      }
      if (typeof parsed.wallpaperDim === "number" && parsed.wallpaperDim >= 0.2 && parsed.wallpaperDim <= 0.88) {
        patch.wallpaperDim = parsed.wallpaperDim;
      }
      if (parsed.fontSize && ["sm", "md", "lg", "xl"].includes(parsed.fontSize)) {
        patch.fontSize = parsed.fontSize;
      }
      if (Object.keys(patch).length === 0) {
        throw new Error("File did not contain valid 7xAir theme settings.");
      }
      await onUpdateSettings(patch);
      setNotice("Imported 7xAir appearance preset.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import preset JSON.");
    }
  };

  return (
    <div className="page-enter" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Palette size={22} />
            7xAir Themes &amp; Wallpaper Engine
          </h1>
          <p className="page-subtitle">
            12 built-in themes, custom JPG/PNG/WebP wallpaper uploads, fine-grained visual filters, and automatic day/night or Windows theme switching.
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            className="glass-button glass-button--primary"
            onClick={handleExportAppearance}
          >
            <Download size={14} /> Export
          </button>
          <button
            type="button"
            className="glass-button"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={14} /> Import
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleImportAppearance(file);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {notice && <div className="toast-banner">{notice}</div>}
      {error && (
        <div className="toast-banner" style={{ borderColor: "rgba(239, 68, 68, 0.55)" }}>
          {error}
        </div>
      )}

      {/* Full Advanced Customization Center */}
      {onSaveCustomization && (
        <CustomizationCenter savedState={customization} onSave={onSaveCustomization} />
      )}

      {/* Typography & Automatic Theme Switching */}
      <GlassPanel className="panel-pad">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div className="setting-label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Type size={15} />
              Font Size
            </div>
            <div className="setting-desc">
              Adjust global launcher text scale while preserving spacing and contrast.
            </div>
          </div>
          <div className="font-size-segmented" role="group" aria-label="UI Font Size">
            {FONT_SIZE_OPTIONS.map((opt) => {
              const active = currentFontSize === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  className={`font-size-pill ${active ? "font-size-pill--active" : ""}`}
                  aria-pressed={active}
                  onClick={() => void onUpdateSettings({ fontSize: opt.id })}
                >
                  <span style={{ opacity: 0.75, fontWeight: 800 }}>{opt.sample}</span>
                  <span>{opt.label}</span>
                  {active && <Check size={12} />}
                </button>
              );
            })}
          </div>
        </div>

        <div className="setting-row" style={{ marginTop: 12 }}>
          <div>
            <div className="setting-label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Clock size={15} />
              Automatic Theme Switching
            </div>
            <div className="setting-desc">
              Switch automatically by time of day or Windows Light/Dark mode, or keep Manual to disable automatic switching.
            </div>
          </div>
          <select
            aria-label="Automatic theme switching mode"
            className="glass-select"
            style={{ width: 220 }}
            value={switchMode}
            onChange={(e) =>
              void onUpdateSettings({ themeSwitchMode: e.target.value as ThemeSwitchMode })
            }
          >
            <option value="manual">Manual (Auto-Switch OFF)</option>
            <option value="schedule">Time-Based Schedule</option>
            <option value="system">Windows System Light / Dark</option>
          </select>
        </div>

        {switchMode !== "manual" && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 10,
              marginTop: 10,
            }}
          >
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
              <span style={{ color: "var(--text-secondary)" }}>Day / Light Theme</span>
              <select
                className="glass-select"
                value={settings.dayTheme ?? "serenity-nature"}
                onChange={(e) => void onUpdateSettings({ dayTheme: e.target.value as ThemeId })}
              >
                {SEVEN_THEMES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
              <span style={{ color: "var(--text-secondary)" }}>Night / Dark Theme</span>
              <select
                className="glass-select"
                value={settings.nightTheme ?? "midnight-anime"}
                onChange={(e) => void onUpdateSettings({ nightTheme: e.target.value as ThemeId })}
              >
                {SEVEN_THEMES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            {switchMode === "schedule" && (
              <>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                  <span style={{ color: "var(--text-secondary)" }}>Day Start Hour (0–23)</span>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    className="glass-input"
                    value={settings.dayStartHour ?? 7}
                    onChange={(e) =>
                      void onUpdateSettings({
                        dayStartHour: Math.max(0, Math.min(23, Number(e.target.value) || 0)),
                      })
                    }
                  />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                  <span style={{ color: "var(--text-secondary)" }}>Night Start Hour (0–23)</span>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    className="glass-input"
                    value={settings.nightStartHour ?? 19}
                    onChange={(e) =>
                      void onUpdateSettings({
                        nightStartHour: Math.max(0, Math.min(23, Number(e.target.value) || 0)),
                      })
                    }
                  />
                </label>
              </>
            )}
          </div>
        )}
      </GlassPanel>

      {/* Complete Wallpaper Engine */}
      <GlassPanel className="panel-pad">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 14,
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h2 className="section-title" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
              <ImageIcon size={16} />
              Wallpaper Engine
            </h2>
            <div className="setting-desc">
              Upload your own JPG, JPEG, PNG, or WebP wallpapers (persisted across restarts) or choose from 9 built-in anime backdrops.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="glass-button glass-button--primary"
              disabled={uploading}
              onClick={() => wallpaperInputRef.current?.click()}
            >
              <Upload size={14} /> {uploading ? "Uploading..." : "Upload Wallpaper"}
            </button>
            <button
              type="button"
              className="glass-button"
              onClick={handleRestoreDefaultWallpaper}
            >
              <RotateCcw size={14} /> Restore Default
            </button>
            <input
              ref={wallpaperInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleUploadWallpaper(file);
                e.target.value = "";
              }}
            />
          </div>
        </div>

        {/* Positioning, Fit & Visual Filter Controls */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12 }}>
            <span style={{ color: "var(--text-secondary)" }}>Fit Mode</span>
            <select
              aria-label="Wallpaper fit mode"
              className="glass-select"
              value={currentFit}
              onChange={(e) =>
                void onUpdateSettings({ wallpaperFit: e.target.value as WallpaperFitMode })
              }
            >
              <option value="cover">Cover (Fill Screen)</option>
              <option value="contain">Contain (Full Artwork)</option>
              <option value="center">Center (Native)</option>
            </select>
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12 }}>
            <span style={{ color: "var(--text-secondary)" }}>Focal Positioning</span>
            <select
              aria-label="Wallpaper focal position"
              className="glass-select"
              value={currentPos}
              onChange={(e) =>
                void onUpdateSettings({ wallpaperPosition: e.target.value as WallpaperPosition })
              }
            >
              <option value="center">Center</option>
              <option value="top">Top (Preserve Upper Character)</option>
              <option value="bottom">Bottom</option>
              <option value="left">Left</option>
              <option value="right">Right</option>
            </select>
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12 }}>
            <span>Glass Opacity ({Math.round(settings.glassOpacity * 100)}%)</span>
            <input
              type="range"
              aria-label="Floating Glass Opacity"
              min={0.35}
              max={0.95}
              step={0.01}
              value={settings.glassOpacity}
              onChange={(e) => void onUpdateSettings({ glassOpacity: Number(e.target.value) })}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12 }}>
            <span>Overlay Opacity ({Math.round(currentDim * 100)}%)</span>
            <input
              type="range"
              aria-label="Overlay Opacity"
              min={0.2}
              max={0.88}
              step={0.02}
              value={currentDim}
              onChange={(e) => void onUpdateSettings({ wallpaperDim: Number(e.target.value) })}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12 }}>
            <span>Brightness ({Math.round(currentBrightness * 100)}%)</span>
            <input
              type="range"
              aria-label="Wallpaper brightness"
              min={0.4}
              max={1.5}
              step={0.02}
              value={currentBrightness}
              onChange={(e) =>
                void onUpdateSettings({ wallpaperBrightness: Number(e.target.value) })
              }
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12 }}>
            <span>Blur ({currentBlur.toFixed(0)}px)</span>
            <input
              type="range"
              aria-label="Wallpaper blur"
              min={0}
              max={24}
              step={1}
              value={currentBlur}
              onChange={(e) => void onUpdateSettings({ wallpaperBlur: Number(e.target.value) })}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12 }}>
            <span>Saturation ({Math.round(currentSat * 100)}%)</span>
            <input
              type="range"
              aria-label="Wallpaper saturation"
              min={0.4}
              max={1.8}
              step={0.02}
              value={currentSat}
              onChange={(e) =>
                void onUpdateSettings({ wallpaperSaturation: Number(e.target.value) })
              }
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12 }}>
            <span>Contrast ({Math.round(currentContrast * 100)}%)</span>
            <input
              type="range"
              aria-label="Wallpaper contrast"
              min={0.6}
              max={1.5}
              step={0.02}
              value={currentContrast}
              onChange={(e) =>
                void onUpdateSettings({ wallpaperContrast: Number(e.target.value) })
              }
            />
          </label>
        </div>

        {/* User Uploaded Wallpapers */}
        {customWallpapers.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>
              Your Uploaded Wallpapers ({customWallpapers.length})
            </div>
            <div className="wallpaper-grid">
              {customWallpapers.map((wp) => {
                const active = currentWallpaper === wp.id;
                return (
                  <div
                    key={wp.id}
                    className={`wallpaper-card ${active ? "wallpaper-card--active" : ""}`}
                  >
                    <button
                      type="button"
                      style={{ all: "unset", cursor: "pointer", display: "block" }}
                      onClick={() => void onUpdateSettings({ wallpaperId: wp.id })}
                    >
                      <div
                        className="wallpaper-thumb"
                        style={{ backgroundImage: `url("${wp.dataUrl}")` }}
                      >
                        {active && (
                          <span className="wallpaper-active-badge">
                            <Check size={11} /> Active
                          </span>
                        )}
                      </div>
                    </button>
                    <div
                      className="wallpaper-meta"
                      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}
                    >
                      <span className="wallpaper-name" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {wp.name}
                      </span>
                      <button
                        type="button"
                        className="glass-button"
                        style={{ padding: "4px 7px" }}
                        aria-label={`Remove ${wp.name}`}
                        onClick={() => void handleDeleteWallpaper(wp)}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Built-In Anime Wallpaper Gallery */}
        <div className="wallpaper-grid">
          {ANIME_WALLPAPERS.map((wp) => {
            const active = currentWallpaper === wp.id;
            return (
              <button
                key={wp.id}
                type="button"
                className={`wallpaper-card ${active ? "wallpaper-card--active" : ""}`}
                onClick={() => void onUpdateSettings({ wallpaperId: wp.id })}
              >
                <div
                  className="wallpaper-thumb"
                  style={
                    wp.imageUrl
                      ? { backgroundImage: `url("${wp.imageUrl}")` }
                      : {
                          background: `linear-gradient(135deg, rgba(14, 18, 32, 0.95), ${wp.accentHex}44)`,
                        }
                  }
                >
                  {active && (
                    <span className="wallpaper-active-badge">
                      <Check size={11} /> Active
                    </span>
                  )}
                </div>
                <div className="wallpaper-meta">
                  <div className="wallpaper-name">{wp.name}</div>
                  <div className="wallpaper-sub">{wp.subtitle}</div>
                </div>
              </button>
            );
          })}
        </div>
      </GlassPanel>

      {/* Atmosphere & Animation FX Performance Controls */}
      <GlassPanel className="panel-pad">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h2 className="section-title" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
              <Sparkles size={16} />
              Atmosphere &amp; Animation Engine Controls
            </h2>
            <div className="setting-desc">
              Renders raindrops, petals, rockets with flames &amp; smoke, aircraft, birds, visualizer bars, and glossy reaction icons over the main UI — auto-pauses when Minecraft launches.
            </div>
          </div>
          <select
            aria-label="Atmosphere FX quality preset"
            className="glass-select"
            style={{ width: 175 }}
            value={settings.fxQuality ?? "balanced"}
            onChange={(e) =>
              void onUpdateSettings({ fxQuality: e.target.value as FxQualityPreset })
            }
          >
            <option value="low">Low Effects</option>
            <option value="balanced">Balanced Effects</option>
            <option value="high">High Effects</option>
            <option value="maximum">Maximum Effects</option>
          </select>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 12,
            marginBottom: 14,
          }}
        >
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
            <span>Particle Density ({Math.round((settings.fxDensity ?? 1) * 100)}%)</span>
            <input
              type="range"
              aria-label="Particle density"
              min={0.25}
              max={2.0}
              step={0.05}
              value={settings.fxDensity ?? 1.0}
              onChange={(e) => void onUpdateSettings({ fxDensity: Number(e.target.value) })}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
            <span>Animation Speed ({Math.round((settings.fxSpeed ?? 1) * 100)}%)</span>
            <input
              type="range"
              aria-label="Animation speed"
              min={0.4}
              max={2.0}
              step={0.05}
              value={settings.fxSpeed ?? 1.0}
              onChange={(e) => void onUpdateSettings({ fxSpeed: Number(e.target.value) })}
            />
          </label>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          {(
            [
              ["reducedMotion", "Reduced Motion", settings.reducedMotion],
              ["fxRainParticles", "Rain / Petals / Particles", settings.fxRainParticles ?? true],
              ["fxFlyingObjects", "Rockets / Aircraft / Birds", settings.fxFlyingObjects ?? true],
              ["fxMusicVisualizer", "Music Visualizer Bars", settings.fxMusicVisualizer ?? true],
              ["fxAmbientLights", "Sunlight & Ambient Lights", settings.fxAmbientLights ?? true],
              ["fxReactionIcons", "Glossy Reaction Icons", settings.fxReactionIcons ?? true],
            ] as const
          ).map(([key, label, val]) => (
            <button
              key={key}
              type="button"
              className={`toggle-btn ${val ? "toggle-btn--on" : ""}`}
              onClick={() => void onUpdateSettings({ [key]: !val })}
            >
              {label}: {val ? "ON" : "OFF"}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Trigger Reaction Icon:</span>
          {REACTION_ICON_CATALOG.map((rx) => (
            <button
              key={rx.id}
              type="button"
              className="glass-button"
              style={{ padding: "5px 10px", fontSize: 11.5, borderColor: `${rx.accent}66` }}
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent("7xair:spawn-reaction", { detail: { kind: rx.id } })
                )
              }
            >
              {rx.label}
            </button>
          ))}
        </div>
      </GlassPanel>

      {/* Theme Selection Grid (Theme 1 .. Theme 12) */}
      <GlassPanel className="panel-pad">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 14,
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h2 className="section-title" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
              <Sparkles size={16} />
              Theme Selection
            </h2>
            <div className="setting-desc">
              All {SEVEN_THEMES.length} 7xAir palettes synced across launcher and in-game HUD.
            </div>
          </div>
          <span className="glass-pill">{SEVEN_THEMES.length} Themes</span>
        </div>

        <div className="themes-grid">
          {SEVEN_THEMES.map((theme) => {
            const active = activeThemeId === theme.id;
            const isLight = theme.id === "serenity-nature";
            return (
              <button
                key={theme.id}
                type="button"
                className={`glass-panel glass-panel--interactive theme-card ${
                  active ? "theme-card--active" : ""
                }`}
                onClick={() => selectTheme(theme.id)}
              >
                <div className="theme-swatch-tri">
                  <span style={{ background: isLight ? "#f8fafc" : "#0b0e18" }} />
                  <span style={{ background: theme.secondaryHex }} />
                  <span style={{ background: theme.accentHex }} />
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span className="theme-name">{theme.name}</span>
                  {active && (
                    <span className="theme-active-check" aria-label="Active theme">
                      <Check size={12} />
                    </span>
                  )}
                </div>

                <span className="theme-tagline">{theme.tagline}</span>

                <div className="theme-tags">
                  <span className="theme-tag">{isLight ? "bright-glass" : "acrylic"}</span>
                  <span className="theme-tag">anime-ready</span>
                </div>

                <div
                  className="theme-mini-preview"
                  style={isLight ? { background: "rgba(255,255,255,0.88)", color: "#0f172a" } : undefined}
                >
                  <span
                    className="theme-mini-btn"
                    style={{
                      background: `linear-gradient(135deg, ${theme.accentHex}, ${theme.secondaryHex})`,
                    }}
                  >
                    Play
                  </span>
                  <span className="theme-mini-status">Ready</span>
                  <span className="theme-mini-aa" style={isLight ? { color: "#0f172a" } : undefined}>
                    Aa Bb
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </GlassPanel>
    </div>
  );
}
