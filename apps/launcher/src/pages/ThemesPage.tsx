import { Check } from "lucide-react";
import { SEVEN_THEMES } from "../theme/themes";
import type { LauncherSettings, ThemeId } from "../types/launcher";
import { GlassPanel } from "../components/GlassPanel";

interface ThemesPageProps {
  settings: LauncherSettings;
  onUpdateSettings: (patch: Partial<LauncherSettings>) => Promise<void>;
}

export function ThemesPage({ settings, onUpdateSettings }: ThemesPageProps) {
  const selectTheme = (theme: ThemeId) => {
    void onUpdateSettings({ theme });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Seven Color Themes</h1>
          <p className="page-subtitle">
            Live translucent glass palettes shared across the launcher and in-game HUD.
          </p>
        </div>
        <span className="glass-pill">7 Built-In Palettes</span>
      </div>

      <GlassPanel className="panel-pad">
        <div className="setting-row" style={{ paddingTop: 0 }}>
          <div>
            <div className="setting-label">
              Floating Glass Opacity ({Math.round(settings.glassOpacity * 100)}%)
            </div>
            <div className="setting-desc">
              Adjust backdrop translucency across all floating panels (35% – 95%).
            </div>
          </div>
          <input
            type="range"
            aria-label="Floating Glass Opacity"
            min={0.35}
            max={0.95}
            step={0.01}
            value={settings.glassOpacity}
            onChange={(e) =>
              void onUpdateSettings({ glassOpacity: Number(e.target.value) })
            }
            style={{ width: 220 }}
          />
        </div>
      </GlassPanel>

      <div className="themes-grid">
        {SEVEN_THEMES.map((theme) => {
          const active = settings.theme === theme.id;
          return (
            <button
              key={theme.id}
              type="button"
              className={`glass-panel glass-panel--interactive theme-card ${
                active ? "theme-card--active" : ""
              }`}
              onClick={() => selectTheme(theme.id)}
            >
              <div
                className="theme-swatch-bar"
                style={{
                  background: `linear-gradient(135deg, ${theme.accentHex}, ${theme.secondaryHex})`,
                }}
              />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span className="theme-name">{theme.name}</span>
                {active && (
                  <span className="glass-pill" style={{ padding: "3px 8px", fontSize: 11 }}>
                    <Check size={12} /> Active
                  </span>
                )}
              </div>
              <span className="theme-tagline">{theme.tagline}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
