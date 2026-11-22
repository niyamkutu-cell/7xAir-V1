import {
  Check,
  Copy,
  Download,
  Eye,
  Palette,
  Plus,
  RotateCcw,
  Save,
  Sliders,
  Sparkles,
  Trash2,
  Type,
  Upload,
  Volume2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  applyCustomizationToDocument,
  computeContrastRatio,
  DEFAULT_CUSTOMIZATION,
  ensureFontLoaded,
  FONT_LIBRARY,
  parseColorToHex,
  registerCustomFontFace,
  type CustomColorPalette,
  type CustomizationState,
  type CustomThemePreset,
  type SoundPackId,
} from "../lib/customization";
import { playLauncherSound } from "../lib/launcherSound";
import { GlassPanel } from "./GlassPanel";

type CenterTab = "themes" | "fonts" | "text" | "colors" | "animations" | "audio";

interface CustomizationCenterProps {
  savedState: CustomizationState;
  onSave: (next: CustomizationState) => Promise<void>;
}

const COLOR_FIELDS: readonly { key: keyof Omit<CustomColorPalette, "enabled" | "customGradient">; label: string }[] = [
  { key: "primary", label: "Primary Color" },
  { key: "secondary", label: "Secondary Color" },
  { key: "accent", label: "Accent Color" },
  { key: "background", label: "Background Color" },
  { key: "surface", label: "Surface Color" },
  { key: "card", label: "Card Color" },
  { key: "border", label: "Border Color" },
  { key: "heading", label: "Heading Color" },
  { key: "bodyText", label: "Body Text Color" },
  { key: "button", label: "Button Color" },
  { key: "hover", label: "Hover Color" },
  { key: "activeState", label: "Active State Color" },
];

export function CustomizationCenter({ savedState, onSave }: CustomizationCenterProps) {
  const [tab, setTab] = useState<CenterTab>("fonts");
  const [draft, setDraft] = useState<CustomizationState>(savedState);
  const [livePreview, setLivePreview] = useState(true);
  const [newThemeName, setNewThemeName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [colorTextInputs, setColorTextInputs] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fontFileRef = useRef<HTMLInputElement | null>(null);
  const themeImportRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setDraft(savedState);
  }, [savedState]);

  useEffect(() => {
    if (livePreview) {
      applyCustomizationToDocument(draft);
    } else {
      applyCustomizationToDocument(savedState);
    }
  }, [draft, livePreview, savedState]);

  const contrastRatio = computeContrastRatio(draft.colors.bodyText, draft.colors.card);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      applyCustomizationToDocument(draft);
      await onSave(draft);
      playLauncherSound("notification", draft.audio);
      setNotice("Saved Customization Center settings.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setDraft(savedState);
    applyCustomizationToDocument(savedState);
    setNotice("Reverted unsaved customization changes.");
  };

  const handleApply = () => {
    applyCustomizationToDocument(draft);
    playLauncherSound("click", draft.audio);
    setNotice("Applied customization preview live.");
  };

  const handleResetTab = () => {
    if (tab === "fonts" || tab === "text") {
      setDraft((d) => ({ ...d, text: { ...DEFAULT_CUSTOMIZATION.text } }));
    } else if (tab === "colors") {
      setDraft((d) => ({ ...d, colors: { ...DEFAULT_CUSTOMIZATION.colors } }));
    } else if (tab === "animations") {
      setDraft((d) => ({ ...d, animations: { ...DEFAULT_CUSTOMIZATION.animations } }));
    } else if (tab === "audio") {
      setDraft((d) => ({ ...d, audio: { ...DEFAULT_CUSTOMIZATION.audio } }));
    } else {
      setDraft((d) => ({ ...d, activeCustomThemeId: null }));
    }
    setNotice(`Reset ${tab} customization values.`);
  };

  const handleRestoreDefaults = () => {
    setDraft(structuredClone(DEFAULT_CUSTOMIZATION));
    applyCustomizationToDocument(DEFAULT_CUSTOMIZATION);
    setNotice("Restored all Customization Center defaults (click Save to persist).");
  };

  const handleCreateCustomTheme = () => {
    const clean = newThemeName.trim() || `Custom Theme ${draft.customThemes.length + 1}`;
    const preset: CustomThemePreset = {
      id: `custom-theme-${Date.now()}`,
      name: clean,
      baseThemeId: "obsidian-violet",
      colors: { ...draft.colors, enabled: true },
      createdAtEpoch: Math.floor(Date.now() / 1000),
    };
    setDraft((d) => ({
      ...d,
      activeCustomThemeId: preset.id,
      colors: { ...preset.colors },
      customThemes: [...d.customThemes, preset],
    }));
    setNewThemeName("");
    setNotice(`Created custom theme "${clean}".`);
  };

  const handleDuplicateTheme = (t: CustomThemePreset) => {
    const copy: CustomThemePreset = {
      ...t,
      id: `custom-theme-${Date.now()}`,
      name: `${t.name} (Copy)`,
      colors: { ...t.colors },
      createdAtEpoch: Math.floor(Date.now() / 1000),
    };
    setDraft((d) => ({ ...d, customThemes: [...d.customThemes, copy] }));
    setNotice(`Duplicated "${t.name}".`);
  };

  const handleDeleteTheme = (id: string) => {
    setDraft((d) => ({
      ...d,
      activeCustomThemeId: d.activeCustomThemeId === id ? null : d.activeCustomThemeId,
      customThemes: d.customThemes.filter((t) => t.id !== id),
    }));
    setConfirmDeleteId(null);
    setNotice("Deleted custom theme.");
  };

  const handleExportCustomTheme = (t: CustomThemePreset) => {
    const blob = new Blob([JSON.stringify(t, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `7xair-custom-theme-${t.name.toLowerCase().replace(/\s+/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportCustomTheme = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as Partial<CustomThemePreset>;
      if (!parsed.name || !parsed.colors) throw new Error("Invalid 7xAir custom theme JSON.");
      const imported: CustomThemePreset = {
        id: `custom-theme-${Date.now()}`,
        name: String(parsed.name).slice(0, 40),
        baseThemeId: parsed.baseThemeId || "obsidian-violet",
        colors: { ...DEFAULT_CUSTOMIZATION.colors, ...parsed.colors, enabled: true },
        createdAtEpoch: Math.floor(Date.now() / 1000),
      };
      setDraft((d) => ({ ...d, customThemes: [...d.customThemes, imported] }));
      setNotice(`Imported custom theme "${imported.name}".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import custom theme.");
    }
  };

  const handleUploadCustomFont = async (file: File) => {
    setError(null);
    if (!/\.(woff2|ttf|otf)$/i.test(file.name)) {
      setError("Only .woff2, .ttf, and .otf font files are supported.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Custom font file must be 5 MB or smaller.");
      return;
    }
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Could not read font file."));
        reader.readAsDataURL(file);
      });
      const fontName = `7xAirCustom-${file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "")}`;
      await registerCustomFontFace(fontName, dataUrl);
      setDraft((d) => ({
        ...d,
        text: { ...d.text, customFontName: fontName, customFontDataUrl: dataUrl },
      }));
      setNotice(`Loaded custom font "${fontName}". Click Save to persist.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load custom font.");
    }
  };

  return (
    <GlassPanel className="panel-pad" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header & Action Bar (Preview / Apply / Save / Cancel / Reset / Restore Defaults) */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2 className="section-title" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
            <Sliders size={17} />
            7xAir Advanced Customization Center
          </h2>
          <div className="setting-desc">
            27+ verified fonts, custom themes, 13-token color engine (HEX/RGB/HSL), granular animations, and UI sound packs.
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button
            type="button"
            className={`toggle-btn ${livePreview ? "toggle-btn--on" : ""}`}
            onClick={() => setLivePreview((v) => !v)}
          >
            <Eye size={13} style={{ marginRight: 5 }} /> Preview: {livePreview ? "Live" : "Off"}
          </button>
          <button type="button" className="glass-button" onClick={handleApply}>
            <Check size={13} /> Apply
          </button>
          <button
            type="button"
            className="glass-button glass-button--primary"
            disabled={saving}
            onClick={() => void handleSave()}
          >
            <Save size={13} /> {saving ? "Saving..." : "Save"}
          </button>
          <button type="button" className="glass-button" onClick={handleCancel}>
            <X size={13} /> Cancel
          </button>
          <button type="button" className="glass-button" onClick={handleResetTab}>
            <RotateCcw size={13} /> Reset
          </button>
          <button type="button" className="glass-button" onClick={handleRestoreDefaults}>
            Restore Defaults
          </button>
        </div>
      </div>

      {notice && <div className="toast-banner">{notice}</div>}
      {error && (
        <div className="toast-banner" style={{ borderColor: "rgba(239, 68, 68, 0.55)" }}>
          {error}
        </div>
      )}

      {/* Sub-Tabs */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {(
          [
            ["themes", "Custom Themes", Palette],
            ["fonts", "27+ Font Library", Type],
            ["text", "Text & Typography", Type],
            ["colors", "Colors & Gradients", Palette],
            ["animations", "Animations", Sparkles],
            ["audio", "Audio & Sound Packs", Volume2],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            className={`toggle-btn ${tab === id ? "toggle-btn--on" : ""}`}
            onClick={() => {
              setTab(id);
              playLauncherSound("click", draft.audio);
            }}
          >
            <Icon size={13} style={{ marginRight: 6 }} />
            {label}
          </button>
        ))}
      </div>

      {/* TAB 1: CUSTOM THEMES CRUD */}
      {tab === "themes" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              type="text"
              className="glass-input"
              style={{ flex: "1 1 220px" }}
              placeholder="New custom theme name..."
              value={newThemeName}
              onChange={(e) => setNewThemeName(e.target.value)}
            />
            <button
              type="button"
              className="glass-button glass-button--primary"
              onClick={handleCreateCustomTheme}
            >
              <Plus size={14} /> Create Custom Theme
            </button>
            <button
              type="button"
              className="glass-button"
              onClick={() => themeImportRef.current?.click()}
            >
              <Upload size={14} /> Import Theme
            </button>
            <input
              ref={themeImportRef}
              type="file"
              accept="application/json,.json"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleImportCustomTheme(f);
                e.target.value = "";
              }}
            />
          </div>

          {draft.customThemes.length === 0 ? (
            <p className="hero-copy">
              No custom themes yet. Customize colors in the Colors tab or create one above to save, duplicate, export, and switch freely.
            </p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
              {draft.customThemes.map((t) => {
                const active = draft.activeCustomThemeId === t.id;
                return (
                  <div
                    key={t.id}
                    className="glass-panel--subtle"
                    style={{
                      padding: 12,
                      borderColor: active ? "var(--accent)" : undefined,
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    <div className="theme-swatch-tri">
                      <span style={{ background: t.colors.background }} />
                      <span style={{ background: t.colors.primary }} />
                      <span style={{ background: t.colors.accent }} />
                    </div>
                    <strong>{t.name}</strong>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="glass-button"
                        style={{ padding: "4px 8px", fontSize: 11 }}
                        onClick={() =>
                          setDraft((d) => ({
                            ...d,
                            activeCustomThemeId: t.id,
                            colors: { ...t.colors, enabled: true },
                          }))
                        }
                      >
                        {active ? "Active" : "Apply"}
                      </button>
                      <button
                        type="button"
                        className="glass-button"
                        style={{ padding: "4px 8px", fontSize: 11 }}
                        onClick={() => handleDuplicateTheme(t)}
                      >
                        <Copy size={11} /> Duplicate
                      </button>
                      <button
                        type="button"
                        className="glass-button"
                        style={{ padding: "4px 8px", fontSize: 11 }}
                        onClick={() => handleExportCustomTheme(t)}
                      >
                        <Download size={11} /> Export
                      </button>
                      {confirmDeleteId === t.id ? (
                        <button
                          type="button"
                          className="glass-button"
                          style={{ padding: "4px 8px", fontSize: 11, borderColor: "#ef4444", color: "#fca5a5" }}
                          onClick={() => handleDeleteTheme(t.id)}
                        >
                          Confirm Delete
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="glass-button"
                          style={{ padding: "4px 8px", fontSize: 11 }}
                          onClick={() => setConfirmDeleteId(t.id)}
                        >
                          <Trash2 size={11} /> Delete
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: 27+ FONT LIBRARY */}
      {tab === "fonts" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
              <span>Global Font</span>
              <select
                className="glass-select"
                value={draft.text.globalFont}
                onChange={(e) => {
                  const fam = e.target.value;
                  ensureFontLoaded(fam);
                  setDraft((d) => ({
                    ...d,
                    text: { ...d.text, globalFont: fam, headingFont: fam, bodyFont: fam, customFontName: null },
                  }));
                }}
              >
                {FONT_LIBRARY.map((f) => (
                  <option key={f.family} value={f.family}>
                    {f.family} ({f.category})
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
              <span>Heading Font</span>
              <select
                className="glass-select"
                value={draft.text.headingFont}
                onChange={(e) => {
                  ensureFontLoaded(e.target.value);
                  setDraft((d) => ({ ...d, text: { ...d.text, headingFont: e.target.value } }));
                }}
              >
                {FONT_LIBRARY.map((f) => (
                  <option key={f.family} value={f.family}>
                    {f.family}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
              <span>Body Font</span>
              <select
                className="glass-select"
                value={draft.text.bodyFont}
                onChange={(e) => {
                  ensureFontLoaded(e.target.value);
                  setDraft((d) => ({ ...d, text: { ...d.text, bodyFont: e.target.value } }));
                }}
              >
                {FONT_LIBRARY.map((f) => (
                  <option key={f.family} value={f.family}>
                    {f.family}
                  </option>
                ))}
              </select>
            </label>

            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <button
                type="button"
                className="glass-button"
                onClick={() => fontFileRef.current?.click()}
              >
                <Upload size={13} /> Upload Custom Font (.woff2/.ttf)
              </button>
              <input
                ref={fontFileRef}
                type="file"
                accept=".woff2,.ttf,.otf"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleUploadCustomFont(f);
                  e.target.value = "";
                }}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(195px, 1fr))", gap: 8, maxHeight: 290, overflowY: "auto" }}>
            {FONT_LIBRARY.map((f) => {
              const active = draft.text.bodyFont === f.family;
              return (
                <button
                  key={f.family}
                  type="button"
                  className={`glass-panel--subtle ${active ? "theme-card--active" : ""}`}
                  style={{
                    padding: "10px 12px",
                    textAlign: "left",
                    cursor: "pointer",
                    color: "var(--text-primary)",
                    borderColor: active ? "var(--accent)" : undefined,
                  }}
                  onMouseEnter={() => ensureFontLoaded(f.family)}
                  onClick={() => {
                    ensureFontLoaded(f.family);
                    setDraft((d) => ({
                      ...d,
                      text: { ...d.text, globalFont: f.family, headingFont: f.family, bodyFont: f.family },
                    }));
                  }}
                >
                  <div style={{ fontFamily: `"${f.family}", ${f.fallback}`, fontSize: 15, fontWeight: 700 }}>
                    {f.family}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                    Aa Bb 123 · {f.license}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: TEXT CUSTOMIZATION */}
      {tab === "text" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
            <span>Custom Font Size ({draft.text.customFontSizePx}px)</span>
            <input
              type="range"
              min={11}
              max={22}
              step={1}
              value={draft.text.customFontSizePx}
              onChange={(e) =>
                setDraft((d) => ({ ...d, text: { ...d.text, customFontSizePx: Number(e.target.value) } }))
              }
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
            <span>Heading Scale ({draft.text.headingScale.toFixed(2)}x)</span>
            <input
              type="range"
              min={0.85}
              max={1.5}
              step={0.05}
              value={draft.text.headingScale}
              onChange={(e) =>
                setDraft((d) => ({ ...d, text: { ...d.text, headingScale: Number(e.target.value) } }))
              }
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
            <span>Body Scale ({draft.text.bodyScale.toFixed(2)}x)</span>
            <input
              type="range"
              min={0.85}
              max={1.35}
              step={0.05}
              value={draft.text.bodyScale}
              onChange={(e) =>
                setDraft((d) => ({ ...d, text: { ...d.text, bodyScale: Number(e.target.value) } }))
              }
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
            <span>Font Weight ({draft.text.fontWeight})</span>
            <select
              className="glass-select"
              value={draft.text.fontWeight}
              onChange={(e) =>
                setDraft((d) => ({ ...d, text: { ...d.text, fontWeight: Number(e.target.value) } }))
              }
            >
              {[300, 400, 500, 600, 700, 800].map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
            <span>Line Height ({draft.text.lineHeight.toFixed(2)})</span>
            <input
              type="range"
              min={1.2}
              max={2.0}
              step={0.05}
              value={draft.text.lineHeight}
              onChange={(e) =>
                setDraft((d) => ({ ...d, text: { ...d.text, lineHeight: Number(e.target.value) } }))
              }
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
            <span>Letter Spacing ({draft.text.letterSpacingEm.toFixed(2)}em)</span>
            <input
              type="range"
              min={-0.04}
              max={0.12}
              step={0.01}
              value={draft.text.letterSpacingEm}
              onChange={(e) =>
                setDraft((d) => ({ ...d, text: { ...d.text, letterSpacingEm: Number(e.target.value) } }))
              }
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
            <span>Text Opacity ({Math.round(draft.text.textOpacity * 100)}%)</span>
            <input
              type="range"
              min={0.55}
              max={1.0}
              step={0.02}
              value={draft.text.textOpacity}
              onChange={(e) =>
                setDraft((d) => ({ ...d, text: { ...d.text, textOpacity: Number(e.target.value) } }))
              }
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
            <span>Text Glow ({draft.text.textGlowPx}px)</span>
            <input
              type="range"
              min={0}
              max={24}
              step={1}
              value={draft.text.textGlowPx}
              onChange={(e) =>
                setDraft((d) => ({ ...d, text: { ...d.text, textGlowPx: Number(e.target.value) } }))
              }
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
            <span>Text Shadow ({draft.text.textShadowPx}px)</span>
            <input
              type="range"
              min={0}
              max={18}
              step={1}
              value={draft.text.textShadowPx}
              onChange={(e) =>
                setDraft((d) => ({ ...d, text: { ...d.text, textShadowPx: Number(e.target.value) } }))
              }
            />
          </label>
          <div style={{ display: "flex", alignItems: "center" }}>
            <button
              type="button"
              className={`toggle-btn ${draft.text.gradientHeadings ? "toggle-btn--on" : ""}`}
              onClick={() =>
                setDraft((d) => ({
                  ...d,
                  text: { ...d.text, gradientHeadings: !d.text.gradientHeadings },
                }))
              }
            >
              Gradient Headings: {draft.text.gradientHeadings ? "ON" : "OFF"}
            </button>
          </div>
        </div>
      )}

      {/* TAB 4: COLOR CUSTOMIZATION (HEX / RGB / HSL + Contrast Guard) */}
      {tab === "colors" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
            <button
              type="button"
              className={`toggle-btn ${draft.colors.enabled ? "toggle-btn--on" : ""}`}
              onClick={() =>
                setDraft((d) => ({ ...d, colors: { ...d.colors, enabled: !d.colors.enabled } }))
              }
            >
              Custom Color Palette: {draft.colors.enabled ? "ON" : "OFF"}
            </button>
            <span className="glass-pill" style={{ fontSize: 11.5 }}>
              Contrast Ratio: {contrastRatio.toFixed(1)}:1 ({contrastRatio >= 4.5 ? "Readable AA" : "Auto-Guarded"})
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
            {COLOR_FIELDS.map(({ key, label }) => {
              const hexVal = draft.colors[key];
              return (
                <div key={key} className="glass-panel--subtle" style={{ padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 600 }}>{label}</span>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="color"
                      aria-label={label}
                      value={hexVal}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          colors: { ...d.colors, enabled: true, [key]: e.target.value },
                        }))
                      }
                      style={{ width: 34, height: 30, border: "none", background: "transparent", cursor: "pointer" }}
                    />
                    <input
                      type="text"
                      className="glass-input"
                      style={{ fontSize: 11.5, padding: "5px 8px" }}
                      placeholder="HEX, rgb(), or hsl()"
                      value={colorTextInputs[key] ?? hexVal}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setColorTextInputs((prev) => ({ ...prev, [key]: raw }));
                        const parsed = parseColorToHex(raw);
                        if (parsed) {
                          setDraft((d) => ({
                            ...d,
                            colors: { ...d.colors, enabled: true, [key]: parsed },
                          }));
                        }
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
            <span>Custom Gradient CSS</span>
            <input
              type="text"
              className="glass-input"
              value={draft.colors.customGradient}
              onChange={(e) =>
                setDraft((d) => ({ ...d, colors: { ...d.colors, customGradient: e.target.value } }))
              }
            />
          </label>
        </div>
      )}

      {/* TAB 5: GRANULAR ANIMATION CUSTOMIZATION */}
      {tab === "animations" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(
              [
                ["hoverAnimation", "Hover Animation"],
                ["pageTransitions", "Page Transitions"],
                ["buttonTransitions", "Button Transitions"],
                ["backgroundTransitions", "Background Transitions"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`toggle-btn ${draft.animations[key] ? "toggle-btn--on" : ""}`}
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    animations: { ...d.animations, [key]: !d.animations[key] },
                  }))
                }
              >
                {label}: {draft.animations[key] ? "ON" : "OFF"}
              </button>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
            {(
              [
                ["speed", "Animation Speed", 0.4, 2.0, 0.05],
                ["intensity", "Animation Intensity", 0.25, 2.0, 0.05],
                ["particleDensity", "Particle Density", 0.25, 2.0, 0.05],
                ["flyingObjectFrequency", "Flying-Object Frequency", 0, 2.0, 0.1],
                ["rocketFrequency", "Rocket Frequency", 0, 2.0, 0.1],
                ["airplaneFrequency", "Airplane Frequency", 0, 2.0, 0.1],
                ["helicopterFrequency", "Helicopter Frequency", 0, 2.0, 0.1],
                ["birdFrequency", "Bird Frequency", 0, 2.0, 0.1],
                ["rainIntensity", "Rain Intensity", 0, 2.0, 0.1],
                ["fallingLeafIntensity", "Falling Leaf Intensity", 0, 2.0, 0.1],
                ["animatedIconIntensity", "Animated Icon Intensity", 0, 2.0, 0.1],
                ["wallpaperTransitionSec", "Wallpaper Transition Speed (s)", 0.15, 1.2, 0.05],
              ] as const
            ).map(([key, label, min, max, step]) => (
              <label key={key} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                <span>
                  {label} ({draft.animations[key].toFixed(2)})
                </span>
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={step}
                  value={draft.animations[key]}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      animations: { ...d.animations, [key]: Number(e.target.value) },
                    }))
                  }
                />
              </label>
            ))}
          </div>
        </div>
      )}

      {/* TAB 6: AUDIO & SOUND PACKS */}
      {tab === "audio" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className={`toggle-btn ${draft.audio.muted ? "" : "toggle-btn--on"}`}
              onClick={() =>
                setDraft((d) => ({ ...d, audio: { ...d.audio, muted: !d.audio.muted } }))
              }
            >
              Master Audio: {draft.audio.muted ? "MUTED" : "ON"}
            </button>
            {(
              [
                ["hoverSound", "Hover Sound"],
                ["clickSound", "Click Sound"],
                ["toggleSound", "Toggle Sound"],
                ["notificationSound", "Notification Sound"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`toggle-btn ${draft.audio[key] ? "toggle-btn--on" : ""}`}
                onClick={() => {
                  const nextAudio = { ...draft.audio, [key]: !draft.audio[key] };
                  setDraft((d) => ({ ...d, audio: nextAudio }));
                  playLauncherSound("toggle", nextAudio, true);
                }}
              >
                {label}: {draft.audio[key] ? "ON" : "OFF"}
              </button>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
              <span>Custom Sound Pack</span>
              <select
                className="glass-select"
                value={draft.audio.soundPack}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    audio: { ...d.audio, soundPack: e.target.value as SoundPackId },
                  }))
                }
              >
                <option value="metallic-pro">Metallic Pro (Brushed Steel)</option>
                <option value="glass-chime">Glass Chime (Crisp Acrylic)</option>
                <option value="cyber-pulse">Cyber Pulse (Tactile Synth)</option>
                <option value="soft-nature">Soft Nature (Warm Acoustic)</option>
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
              <span>Sound Volume ({Math.round(draft.audio.volume * 100)}%)</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.02}
                value={draft.audio.volume}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, audio: { ...d.audio, volume: Number(e.target.value) } }))
                }
              />
            </label>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(["hover", "click", "toggle", "notification"] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                className="glass-button"
                onClick={() => playLauncherSound(kind, draft.audio, true)}
              >
                <Volume2 size={13} /> Preview {kind}
              </button>
            ))}
          </div>
        </div>
      )}
    </GlassPanel>
  );
}
