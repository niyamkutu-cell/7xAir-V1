import { Minus, Square, X } from "lucide-react";
import { closeWindow, minimizeWindow, toggleMaximizeWindow } from "../lib/tauriBridge";

interface TitleBarProps {
  version: string;
  runtimeMode: "tauri" | "browser-preview";
  runningInstanceName?: string | null;
}

export function TitleBar({ version, runtimeMode, runningInstanceName }: TitleBarProps) {
  return (
    <header className="titlebar" data-tauri-drag-region>
      <div className="titlebar-brand" data-tauri-drag-region>
        <img
          src="/logo-7x.png"
          alt="7X"
          style={{ width: 26, height: 26, objectFit: "contain", display: "block" }}
          draggable={false}
        />
        <span className="brand-name">7xAir</span>
        <span className="brand-version">v{version}</span>
        {runtimeMode === "browser-preview" && (
          <span className="brand-version">Preview</span>
        )}
      </div>

      <div className="titlebar-center" data-tauri-drag-region>
        {runningInstanceName && (
          <span className="glass-pill" style={{ padding: "3px 10px", fontSize: 11 }}>
            <span className="status-dot" />
            Playing {runningInstanceName}
          </span>
        )}
      </div>

      <div className="window-controls">
        <button
          type="button"
          className="window-btn"
          aria-label="Minimize window"
          onClick={() => void minimizeWindow()}
        >
          <Minus size={14} />
        </button>
        <button
          type="button"
          className="window-btn"
          aria-label="Toggle maximize window"
          onClick={() => void toggleMaximizeWindow()}
        >
          <Square size={12} />
        </button>
        <button
          type="button"
          className="window-btn window-btn--close"
          aria-label="Close window"
          onClick={() => void closeWindow()}
        >
          <X size={14} />
        </button>
      </div>
    </header>
  );
}
